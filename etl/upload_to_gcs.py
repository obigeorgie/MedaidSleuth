#!/usr/bin/env python3
"""Upload the local CSV to GCS, then load into BigQuery, create view, and verify."""

import os
import sys
import time
import tempfile
import json

from google.cloud import storage, bigquery
from google.oauth2 import service_account


def get_credentials():
    raw = os.environ["GCP_SERVICE_ACCOUNT_JSON"]
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
    tmp.write(raw)
    tmp.close()
    creds = service_account.Credentials.from_service_account_file(
        tmp.name,
        scopes=[
            "https://www.googleapis.com/auth/cloud-platform",
            "https://www.googleapis.com/auth/bigquery",
            "https://www.googleapis.com/auth/devstorage.read_write",
        ],
    )
    return creds, tmp.name


def upload_to_gcs(creds, project_id, bucket_name, filepath, blob_name):
    client = storage.Client(project=project_id, credentials=creds)
    bucket = client.bucket(bucket_name)

    blob = bucket.blob(blob_name)
    if blob.exists():
        blob.reload()
        print(f"File already in GCS: {blob.size / (1024**3):.2f} GB — skipping upload")
        return f"gs://{bucket_name}/{blob_name}"

    blob.chunk_size = 10 * 1024 * 1024
    filesize = os.path.getsize(filepath)
    print(f"Uploading {filesize / (1024**3):.2f} GB to gs://{bucket_name}/{blob_name}")
    print("This will take several minutes...")
    sys.stdout.flush()

    start = time.time()
    blob.upload_from_filename(filepath, content_type="text/csv", timeout=7200)
    elapsed = time.time() - start
    print(f"Upload complete in {int(elapsed // 60)}m {int(elapsed % 60)}s")
    return f"gs://{bucket_name}/{blob_name}"


def load_to_bigquery(creds, project_id, dataset_id, table_id, gcs_uri):
    client = bigquery.Client(project=project_id, credentials=creds)
    full_table_id = f"{project_id}.{dataset_id}.{table_id}"

    dataset_ref = bigquery.DatasetReference(project_id, dataset_id)
    try:
        client.get_dataset(dataset_ref)
        print(f"Using existing dataset: {dataset_id}")
    except Exception:
        print(f"Creating dataset: {dataset_id}")
        dataset = bigquery.Dataset(dataset_ref)
        dataset.location = "US"
        client.create_dataset(dataset, exists_ok=True)

    job_config = bigquery.LoadJobConfig(
        autodetect=True,
        source_format=bigquery.SourceFormat.CSV,
        skip_leading_rows=1,
        allow_quoted_newlines=True,
        allow_jagged_rows=False,
        max_bad_records=0,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )

    print(f"Loading {gcs_uri} into {full_table_id}...")
    sys.stdout.flush()

    start = time.time()
    load_job = client.load_table_from_uri(gcs_uri, full_table_id, job_config=job_config)
    print(f"Job ID: {load_job.job_id}")

    while not load_job.done():
        time.sleep(10)
        load_job.reload()
        print(f"  Status: {load_job.state}")
        sys.stdout.flush()

    elapsed = time.time() - start

    if load_job.errors:
        for error in load_job.errors:
            print(f"ERROR: {error}")
        raise RuntimeError(f"BigQuery load failed with {len(load_job.errors)} error(s)")

    table = client.get_table(full_table_id)
    print(f"Load complete in {int(elapsed)}s")
    print(f"Rows: {table.num_rows:,}")
    print(f"Size: {table.num_bytes / (1024**3):.2f} GB")
    return table


def create_view(creds, project_id, dataset_id, table_id):
    client = bigquery.Client(project=project_id, credentials=creds)
    full_table_id = f"{project_id}.{dataset_id}.{table_id}"
    view_id = f"{project_id}.{dataset_id}.medicaid_claims_view"

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
    FROM `{full_table_id}`
    """

    view = bigquery.Table(view_id)
    view.view_query = view_sql
    client.delete_table(view_id, not_found_ok=True)
    client.create_table(view)
    print(f"Created view: {view_id}")


def verify(creds, project_id, dataset_id, table_id):
    client = bigquery.Client(project=project_id, credentials=creds)
    full_table_id = f"{project_id}.{dataset_id}.{table_id}"

    queries = {
        "Row count": f"SELECT COUNT(*) as cnt FROM `{full_table_id}`",
        "Distinct states": f"SELECT COUNT(DISTINCT Rndrng_Prvdr_State_Abrvtn) as states FROM `{full_table_id}`",
        "Distinct providers": f"SELECT COUNT(DISTINCT Rndrng_NPI) as providers FROM `{full_table_id}`",
        "Sample": f"SELECT Rndrng_NPI, Rndrng_Prvdr_Last_Org_Name, Rndrng_Prvdr_State_Abrvtn, HCPCS_Cd, Avg_Mdcr_Pymt_Amt FROM `{full_table_id}` LIMIT 3",
    }

    for label, query in queries.items():
        try:
            rows = list(client.query(query).result())
            if label == "Sample":
                print(f"{label}:")
                for row in rows:
                    print(f"  {dict(row)}")
            else:
                print(f"{label}: {dict(rows[0])}")
        except Exception as e:
            print(f"{label} failed: {e}")


def main():
    project_id = os.environ["GCP_PROJECT_ID"]
    bucket_name = os.environ.get("GCS_BUCKET", "medicaid-raw-data")
    dataset_id = os.environ.get("BQ_DATASET", "medicaid_data")
    table_id = os.environ.get("BQ_TABLE", "medicaid_provider_spending")
    filepath = os.environ.get("LOCAL_FILE_PATH", "etl/medicaid_provider_spending.csv")
    blob_name = f"{table_id}.csv"

    creds, tmp_file = get_credentials()

    try:
        print("=" * 50)
        print("Step 1: Upload to GCS")
        print("=" * 50)
        gcs_uri = upload_to_gcs(creds, project_id, bucket_name, filepath, blob_name)

        print()
        print("=" * 50)
        print("Step 2: Load into BigQuery")
        print("=" * 50)
        load_to_bigquery(creds, project_id, dataset_id, table_id, gcs_uri)

        print()
        print("=" * 50)
        print("Step 3: Create mapped view")
        print("=" * 50)
        create_view(creds, project_id, dataset_id, table_id)

        print()
        print("=" * 50)
        print("Step 4: Verify data")
        print("=" * 50)
        verify(creds, project_id, dataset_id, table_id)

        print()
        print("=" * 50)
        print("PIPELINE COMPLETE")
        print("=" * 50)
    finally:
        os.unlink(tmp_file)


if __name__ == "__main__":
    main()
