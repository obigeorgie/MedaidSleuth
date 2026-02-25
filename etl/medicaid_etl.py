#!/usr/bin/env python3
"""
MedicaidSleuth ETL Pipeline
============================
Downloads the HHS Medicaid Provider Spending dataset (~10.3 GB),
uploads it to Google Cloud Storage, and loads it into BigQuery.

Usage:
    python etl/medicaid_etl.py

Environment Variables:
    GCP_SERVICE_ACCOUNT_JSON  - Path to service account JSON key file (required)
    GCP_PROJECT_ID            - Google Cloud project ID (required)
    BQ_DATASET                - BigQuery dataset name (default: medicaid_data)
    BQ_TABLE                  - BigQuery table name (default: medicaid_provider_spending)
    GCS_BUCKET                - GCS bucket name (default: medicaid-raw-data)
    HHS_DATASET_URL           - Override the default HHS download URL
    SKIP_DOWNLOAD             - Set to "true" to skip download (use existing local file)
    SKIP_GCS_UPLOAD           - Set to "true" to skip GCS upload (load directly or use existing GCS file)
    LOCAL_FILE_PATH           - Override local file path (default: etl/medicaid_provider_spending.csv)
"""

import atexit
import json
import logging
import os
import sys
import tempfile
import time
from pathlib import Path

import requests
from google.cloud import bigquery, storage
from google.oauth2 import service_account
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("medicaid_etl")

CMS_DOWNLOAD_URLS = {
    "2023": "https://data.cms.gov/sites/default/files/2025-04/e3f823f8-db5b-4cc7-ba04-e7ae92b99757/MUP_PHY_R25_P05_V20_D23_Prov_Svc.csv",
    "2022": "https://data.cms.gov/sites/default/files/2025-11/53fb2bae-4913-48dc-a6d4-d8c025906567/MUP_PHY_R25_P05_V20_D22_Prov_Svc.csv",
    "2021": "https://data.cms.gov/sites/default/files/2025-11/bffaf97a-c2ab-4fd7-8718-be90742e3485/MUP_PHY_R25_P05_V20_D21_Prov_Svc.csv",
    "2020": "https://data.cms.gov/sites/default/files/2025-11/d22b18cd-7726-4bf5-8e9c-3e4587c589a1/MUP_PHY_R25_P05_V20_D20_Prov_Svc.csv",
    "2019": "https://data.cms.gov/sites/default/files/2025-11/7befba27-752e-47a8-a76c-6c6d4f74f2e3/MUP_PHY_R25_P04_V20_D19_Prov_Svc.csv",
    "2018": "https://data.cms.gov/sites/default/files/2025-11/5669eafb-f0b3-4dc5-be6d-abc09b480c2e/MUP_PHY_R25_P04_V20_D18_Prov_Svc.csv",
    "2017": "https://data.cms.gov/sites/default/files/2025-11/4623fb40-781e-4eef-860e-b851cd5d10ea/MUP_PHY_R25_P04_V20_D17_Prov_Svc.csv",
    "2016": "https://data.cms.gov/sites/default/files/2025-11/426bf97a-4cb8-47ca-9727-a535d9e8c298/MUP_PHY_R25_P04_V20_D16_Prov_Svc.csv",
    "2015": "https://data.cms.gov/sites/default/files/2025-11/14954ce3-4c43-43df-97e9-2c0437d7b43c/MUP_PHY_R25_P04_V20_D15_Prov_Svc.csv",
    "2014": "https://data.cms.gov/sites/default/files/2025-11/6700f86d-d2e5-4f2d-9dcb-8c30412768ff/MUP_PHY_R25_P04_V20_D14_Prov_Svc.csv",
    "2013": "https://data.cms.gov/sites/default/files/2025-11/bf4231f9-ec7f-4189-afc3-ba5d53b8bd12/MUP_PHY_R25_P04_V20_D13_Prov_Svc.csv",
}
DEFAULT_DOWNLOAD_URL = CMS_DOWNLOAD_URLS["2023"]

EXPECTED_COLUMNS = [
    "rndrng_npi",
    "rndrng_prvdr_last_org_name",
    "rndrng_prvdr_first_name",
    "rndrng_prvdr_state_abrvtn",
    "rndrng_prvdr_type",
    "hcpcs_cd",
    "hcpcs_desc",
    "tot_srvcs",
    "tot_benes",
    "avg_mdcr_pymt_amt",
]

COLUMN_ALIASES = {
    "rndrng_npi": "provider_id",
    "hcpcs_cd": "procedure_code",
    "rndrng_prvdr_state_abrvtn": "state_code",
    "avg_mdcr_pymt_amt": "total_paid",
    "rndrng_prvdr_last_org_name": "provider_name",
    "rndrng_prvdr_first_name": "provider_first_name",
    "rndrng_prvdr_type": "provider_type",
    "hcpcs_desc": "procedure_description",
    "tot_srvcs": "total_services",
    "tot_benes": "total_beneficiaries",
    "avg_sbmtd_chrg": "avg_submitted_charge",
    "avg_mdcr_alowd_amt": "avg_allowed_amount",
    "avg_mdcr_stdzd_amt": "avg_standardized_amount",
    "place_of_srvc": "place_of_service",
    "rndrng_prvdr_city": "provider_city",
    "rndrng_prvdr_zip5": "provider_zip",
}


class ETLConfig:
    def __init__(self):
        self._raw_credentials = os.environ.get("GCP_SERVICE_ACCOUNT_JSON", "")
        self._credentials_file = None
        self.project_id = os.environ.get("GCP_PROJECT_ID")
        self.dataset_id = os.environ.get("BQ_DATASET", "medicaid_data")
        self.table_id = os.environ.get("BQ_TABLE", "medicaid_provider_spending")
        self.bucket_name = os.environ.get("GCS_BUCKET", "medicaid-raw-data")
        self.hhs_url = os.environ.get("HHS_DATASET_URL", DEFAULT_DOWNLOAD_URL)
        self.skip_download = os.environ.get("SKIP_DOWNLOAD", "").lower() == "true"
        self.skip_gcs_upload = os.environ.get("SKIP_GCS_UPLOAD", "").lower() == "true"
        self.local_file = os.environ.get(
            "LOCAL_FILE_PATH", "etl/medicaid_provider_spending.csv"
        )
        self.chunk_size = 10 * 1024 * 1024  # 10 MB chunks for download
        self.gcs_chunk_size = 50 * 1024 * 1024  # 50 MB chunks for GCS upload

    def validate(self):
        errors = []
        if not self._raw_credentials:
            errors.append("GCP_SERVICE_ACCOUNT_JSON is required (JSON content or file path)")
        if not self.project_id:
            errors.append("GCP_PROJECT_ID is required")
        if errors:
            for err in errors:
                logger.error(err)
            raise SystemExit(1)

        self._resolve_credentials()

    def _resolve_credentials(self):
        value = self._raw_credentials.strip()
        if value.startswith("{"):
            try:
                json.loads(value)
            except json.JSONDecodeError as e:
                logger.error(f"GCP_SERVICE_ACCOUNT_JSON contains invalid JSON: {e}")
                raise SystemExit(1)
            tmp = tempfile.NamedTemporaryFile(
                mode="w", suffix=".json", delete=False, prefix="gcp_sa_"
            )
            tmp.write(value)
            tmp.close()
            self._credentials_file = tmp.name
            atexit.register(lambda: os.unlink(tmp.name) if os.path.exists(tmp.name) else None)
            logger.info("Loaded service account credentials from environment variable")
        else:
            if not Path(value).exists():
                logger.error(f"Service account file not found: {value}")
                raise SystemExit(1)
            self._credentials_file = value
            logger.info(f"Using service account credentials from file: {value}")

    def get_credentials(self):
        return service_account.Credentials.from_service_account_file(
            self._credentials_file,
            scopes=[
                "https://www.googleapis.com/auth/cloud-platform",
                "https://www.googleapis.com/auth/bigquery",
                "https://www.googleapis.com/auth/devstorage.read_write",
            ],
        )

    @property
    def full_table_id(self):
        return f"{self.project_id}.{self.dataset_id}.{self.table_id}"

    @property
    def gcs_uri(self):
        return f"gs://{self.bucket_name}/{self.table_id}.csv"

    @property
    def gcs_blob_name(self):
        return f"{self.table_id}.csv"


def format_bytes(num_bytes):
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if abs(num_bytes) < 1024.0:
            return f"{num_bytes:.2f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.2f} PB"


def format_duration(seconds):
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    parts = []
    if hours:
        parts.append(f"{hours}h")
    if minutes:
        parts.append(f"{minutes}m")
    parts.append(f"{secs}s")
    return " ".join(parts)


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=10, max=300),
    retry=retry_if_exception_type((requests.ConnectionError, requests.Timeout, IOError)),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
def download_dataset(config: ETLConfig):
    local_path = Path(config.local_file)
    local_path.parent.mkdir(parents=True, exist_ok=True)

    resume_byte = 0
    mode = "wb"
    if local_path.exists():
        resume_byte = local_path.stat().st_size
        if resume_byte > 0:
            logger.info(f"Found partial download: {format_bytes(resume_byte)}")

    headers = {"Accept": "text/csv"}
    if resume_byte > 0:
        headers["Range"] = f"bytes={resume_byte}-"

    logger.info(f"Downloading dataset from {config.hhs_url}")
    logger.info(f"Saving to {local_path}")

    response = requests.get(
        config.hhs_url, headers=headers, stream=True, timeout=120
    )
    response.raise_for_status()

    if resume_byte > 0 and response.status_code == 206:
        mode = "ab"
        logger.info(f"Server supports resume — continuing from byte {format_bytes(resume_byte)}")
    elif resume_byte > 0:
        logger.warning(
            f"Server returned {response.status_code} (not 206) — "
            "resume not supported, restarting download from scratch"
        )
        resume_byte = 0
        mode = "wb"

    content_length = response.headers.get("Content-Length")
    total_size = int(content_length) + resume_byte if content_length else None
    if total_size:
        logger.info(f"Total file size: {format_bytes(total_size)}")
    else:
        logger.info("File size unknown (no Content-Length header)")

    downloaded = resume_byte
    start_time = time.time()
    last_log_time = start_time

    with open(local_path, mode) as f:
        for chunk in response.iter_content(chunk_size=config.chunk_size):
            if chunk:
                f.write(chunk)
                downloaded += len(chunk)

                now = time.time()
                if now - last_log_time >= 30:
                    elapsed = now - start_time
                    speed = (downloaded - resume_byte) / elapsed if elapsed > 0 else 0
                    progress = ""
                    if total_size:
                        pct = (downloaded / total_size) * 100
                        eta = (total_size - downloaded) / speed if speed > 0 else 0
                        progress = f" ({pct:.1f}%, ETA: {format_duration(eta)})"
                    logger.info(
                        f"Downloaded {format_bytes(downloaded)}{progress} "
                        f"@ {format_bytes(speed)}/s"
                    )
                    last_log_time = now

    elapsed = time.time() - start_time
    logger.info(
        f"Download complete: {format_bytes(downloaded)} in {format_duration(elapsed)}"
    )

    actual_size = local_path.stat().st_size
    if total_size and abs(actual_size - total_size) > 1024:
        raise IOError(
            f"File size mismatch: expected {format_bytes(total_size)}, "
            f"got {format_bytes(actual_size)}. File may be corrupt."
        )
    logger.info(f"File integrity check passed: {format_bytes(actual_size)} on disk")

    return local_path


def validate_csv_header(file_path: Path):
    logger.info("Validating CSV header...")
    with open(file_path, "r") as f:
        header_line = f.readline().strip()

    if not header_line:
        raise ValueError("CSV file is empty — no header found")

    columns = [col.strip().strip('"').lower() for col in header_line.split(",")]
    logger.info(f"Found {len(columns)} columns: {columns[:15]}{'...' if len(columns) > 15 else ''}")

    found = []
    missing = []
    for expected in EXPECTED_COLUMNS:
        if expected in columns:
            found.append(expected)
        else:
            missing.append(expected)

    if found:
        logger.info(f"Matched expected columns: {found}")
    if missing:
        logger.warning(
            f"Expected columns not found (may have different names): {missing}"
        )
        logger.warning(
            "The script will proceed — BigQuery autodetect will infer the schema. "
            "You may need to create a VIEW to map column names."
        )

    return columns


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=30, max=120),
    retry=retry_if_exception_type(Exception),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
def upload_to_gcs(config: ETLConfig, file_path: Path):
    credentials = config.get_credentials()
    client = storage.Client(project=config.project_id, credentials=credentials)

    bucket = client.bucket(config.bucket_name)
    if not bucket.exists():
        logger.info(f"Creating GCS bucket: {config.bucket_name}")
        bucket = client.create_bucket(config.bucket_name, location="US")
        logger.info(f"Bucket created in location: {bucket.location}")
    else:
        logger.info(f"Using existing GCS bucket: {config.bucket_name}")

    blob = bucket.blob(config.gcs_blob_name)
    blob.chunk_size = config.gcs_chunk_size

    file_size = file_path.stat().st_size
    logger.info(
        f"Uploading {format_bytes(file_size)} to gs://{config.bucket_name}/{config.gcs_blob_name}"
    )
    logger.info("Using resumable upload (this may take a while for 10+ GB files)...")

    start_time = time.time()
    blob.upload_from_filename(
        str(file_path),
        content_type="text/csv",
        timeout=7200,
    )
    elapsed = time.time() - start_time

    logger.info(
        f"Upload complete: {format_bytes(file_size)} in {format_duration(elapsed)}"
    )
    logger.info(f"GCS URI: {config.gcs_uri}")

    return config.gcs_uri


def load_to_bigquery(config: ETLConfig, gcs_uri: str):
    credentials = config.get_credentials()
    client = bigquery.Client(project=config.project_id, credentials=credentials)

    dataset_ref = bigquery.DatasetReference(config.project_id, config.dataset_id)
    try:
        client.get_dataset(dataset_ref)
        logger.info(f"Using existing BigQuery dataset: {config.dataset_id}")
    except Exception:
        logger.info(f"Creating BigQuery dataset: {config.dataset_id}")
        dataset = bigquery.Dataset(dataset_ref)
        dataset.location = "US"
        client.create_dataset(dataset, exists_ok=True)
        logger.info(f"Dataset created: {config.dataset_id}")

    job_config = bigquery.LoadJobConfig(
        autodetect=True,
        source_format=bigquery.SourceFormat.CSV,
        skip_leading_rows=1,
        allow_quoted_newlines=True,
        allow_jagged_rows=False,
        max_bad_records=0,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )

    logger.info(f"Loading data from {gcs_uri} into {config.full_table_id}")
    logger.info("Configuration: autodetect=True, format=CSV, write_disposition=TRUNCATE")

    start_time = time.time()
    load_job = client.load_table_from_uri(
        gcs_uri, config.full_table_id, job_config=job_config
    )

    logger.info(f"BigQuery load job started: {load_job.job_id}")
    logger.info("Waiting for job to complete (this may take several minutes)...")

    while not load_job.done():
        time.sleep(15)
        load_job.reload()
        logger.info(f"Job status: {load_job.state}")

    elapsed = time.time() - start_time

    if load_job.errors:
        for error in load_job.errors:
            logger.error(f"BigQuery error: {error}")
        raise RuntimeError(
            f"BigQuery load job failed with {len(load_job.errors)} error(s)"
        )

    table = client.get_table(config.full_table_id)
    logger.info(f"Load complete in {format_duration(elapsed)}")
    logger.info(f"Table: {config.full_table_id}")
    logger.info(f"Rows loaded: {table.num_rows:,}")
    logger.info(f"Table size: {format_bytes(table.num_bytes)}")

    logger.info("Schema:")
    for field in table.schema:
        logger.info(f"  {field.name} ({field.field_type})")

    return table


def create_mapped_view(config: ETLConfig):
    credentials = config.get_credentials()
    client = bigquery.Client(project=config.project_id, credentials=credentials)

    view_id = f"{config.project_id}.{config.dataset_id}.medicaid_claims_view"
    view_sql = f"""
    SELECT
        Rndrng_NPI AS provider_id,
        Rndrng_Prvdr_Last_Org_Name AS provider_name,
        Rndrng_Prvdr_First_Name AS provider_first_name,
        Rndrng_Prvdr_State_Abrvtn AS state_code,
        Rndrng_Prvdr_City AS provider_city,
        Rndrng_Prvdr_Zip5 AS provider_zip,
        Rndrng_Prvdr_Type AS provider_type,
        HCPCS_Cd AS procedure_code,
        HCPCS_Desc AS procedure_description,
        Place_Of_Srvc AS place_of_service,
        SAFE_CAST(Tot_Benes AS INT64) AS total_beneficiaries,
        SAFE_CAST(Tot_Srvcs AS INT64) AS total_services,
        SAFE_CAST(Avg_Sbmtd_Chrg AS FLOAT64) AS avg_submitted_charge,
        SAFE_CAST(Avg_Mdcr_Alowd_Amt AS FLOAT64) AS avg_allowed_amount,
        SAFE_CAST(Avg_Mdcr_Pymt_Amt AS FLOAT64) AS total_paid,
        SAFE_CAST(Avg_Mdcr_Stdzd_Amt AS FLOAT64) AS avg_standardized_amount
    FROM `{config.full_table_id}`
    """

    view = bigquery.Table(view_id)
    view.view_query = view_sql
    try:
        client.delete_table(view_id, not_found_ok=True)
        client.create_table(view)
        logger.info(f"Created mapped view: {view_id}")
        logger.info("App-friendly column names: provider_id, provider_name, state_code, procedure_code, total_paid, year, etc.")
    except Exception as e:
        logger.warning(f"Could not create mapped view: {e}")
        logger.warning("You can create it manually or query the raw table with column aliases.")


def verify_data(config: ETLConfig):
    credentials = config.get_credentials()
    client = bigquery.Client(project=config.project_id, credentials=credentials)

    queries = [
        ("Row count", f"SELECT COUNT(*) as cnt FROM `{config.full_table_id}`"),
        (
            "Sample rows",
            f"SELECT * FROM `{config.full_table_id}` LIMIT 5",
        ),
        (
            "Distinct states",
            f"SELECT COUNT(DISTINCT Rndrng_Prvdr_State_Abrvtn) as states FROM `{config.full_table_id}`",
        ),
        (
            "Distinct providers (NPI)",
            f"SELECT COUNT(DISTINCT Rndrng_NPI) as providers FROM `{config.full_table_id}`",
        ),
    ]

    logger.info("Running verification queries...")
    for label, query in queries:
        try:
            result = client.query(query).result()
            rows = list(result)
            if label == "Sample rows":
                logger.info(f"{label}:")
                for row in rows:
                    logger.info(f"  {dict(row)}")
            else:
                logger.info(f"{label}: {dict(rows[0])}")
        except Exception as e:
            logger.warning(f"Verification query '{label}' failed: {e}")


def main():
    logger.info("=" * 60)
    logger.info("MedicaidSleuth ETL Pipeline")
    logger.info("=" * 60)

    config = ETLConfig()
    config.validate()

    pipeline_start = time.time()

    # Phase 1: Download
    if config.skip_download:
        local_path = Path(config.local_file)
        if not local_path.exists():
            logger.error(f"SKIP_DOWNLOAD=true but file not found: {local_path}")
            raise SystemExit(1)
        logger.info(f"Skipping download, using existing file: {local_path}")
    else:
        logger.info("")
        logger.info("Phase 1/3: Downloading dataset from HHS")
        logger.info("-" * 40)
        local_path = download_dataset(config)

    validate_csv_header(local_path)

    # Phase 2: Upload to GCS
    if config.skip_gcs_upload:
        gcs_uri = config.gcs_uri
        logger.info(f"Skipping GCS upload, using existing URI: {gcs_uri}")
    else:
        logger.info("")
        logger.info("Phase 2/3: Uploading to Google Cloud Storage")
        logger.info("-" * 40)
        gcs_uri = upload_to_gcs(config, local_path)

    # Phase 3: Load to BigQuery
    logger.info("")
    logger.info("Phase 3/3: Loading into BigQuery")
    logger.info("-" * 40)
    load_to_bigquery(config, gcs_uri)

    # Create mapped view for app-friendly column names
    logger.info("")
    logger.info("Creating mapped view")
    logger.info("-" * 40)
    create_mapped_view(config)

    # Verify
    logger.info("")
    logger.info("Verification")
    logger.info("-" * 40)
    verify_data(config)

    total_elapsed = time.time() - pipeline_start
    logger.info("")
    logger.info("=" * 60)
    logger.info(f"ETL Pipeline completed in {format_duration(total_elapsed)}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
