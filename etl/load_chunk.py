#!/usr/bin/env python3
"""Load a single chunk into BigQuery. Usage: python etl/load_chunk.py <chunk_number> [TRUNCATE|APPEND]"""
import os, sys, time, tempfile
from google.cloud import bigquery
from google.oauth2 import service_account

chunk_num = int(sys.argv[1]) if len(sys.argv) > 1 else 0
mode = sys.argv[2] if len(sys.argv) > 2 else "APPEND"

raw = os.environ["GCP_SERVICE_ACCOUNT_JSON"]
tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
tmp.write(raw); tmp.close()

project_id = os.environ["GCP_PROJECT_ID"]
full_table_id = f"{project_id}.medicaid_data.medicaid_provider_spending"

creds = service_account.Credentials.from_service_account_file(tmp.name, scopes=[
    "https://www.googleapis.com/auth/cloud-platform",
])
client = bigquery.Client(project=project_id, credentials=creds)

dataset_ref = bigquery.DatasetReference(project_id, "medicaid_data")
try:
    client.get_dataset(dataset_ref)
except Exception:
    ds = bigquery.Dataset(dataset_ref)
    ds.location = "US"
    client.create_dataset(ds, exists_ok=True)

chunk_file = f"etl/chunk_{chunk_num:02d}.csv"
with open(chunk_file, "r") as f:
    header = f.readline().strip()
columns = [col.strip() for col in header.split(",")]
schema = [bigquery.SchemaField(col, "STRING") for col in columns]

wd = bigquery.WriteDisposition.WRITE_TRUNCATE if mode == "TRUNCATE" else bigquery.WriteDisposition.WRITE_APPEND
job_config = bigquery.LoadJobConfig(
    schema=schema,
    source_format=bigquery.SourceFormat.CSV,
    skip_leading_rows=1,
    allow_quoted_newlines=True,
    write_disposition=wd,
)

filesize = os.path.getsize(chunk_file)
print(f"Chunk {chunk_num} ({filesize / (1024**2):.0f} MB) -> {mode}")
sys.stdout.flush()

start = time.time()
with open(chunk_file, "rb") as f:
    job = client.load_table_from_file(f, full_table_id, job_config=job_config)
job.result(timeout=600)
elapsed = time.time() - start

if job.errors:
    for err in job.errors:
        print(f"ERROR: {err}")
    sys.exit(1)

table = client.get_table(full_table_id)
print(f"Done in {int(elapsed)}s | Total: {table.num_rows:,} rows | {table.num_bytes / (1024**3):.2f} GB")
os.unlink(tmp.name)
