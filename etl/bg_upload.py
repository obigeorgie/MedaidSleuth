#!/usr/bin/env python3
"""Background GCS upload script. Writes status to /tmp/gcs_status.json"""
import os
import sys
import json
import time
import tempfile
from google.cloud import storage
from google.oauth2 import service_account

STATUS_FILE = "/tmp/gcs_status.json"

def write_status(state, **kwargs):
    data = {"state": state, "timestamp": time.time(), **kwargs}
    with open(STATUS_FILE, "w") as f:
        json.dump(data, f)

def main():
    try:
        raw = os.environ["GCP_SERVICE_ACCOUNT_JSON"]
        project_id = os.environ["GCP_PROJECT_ID"]
        bucket_name = os.environ.get("GCS_BUCKET", "medicaid-raw-data")
        filepath = os.environ.get("LOCAL_FILE_PATH", "etl/medicaid_provider_spending.csv")
        blob_name = "medicaid_provider_spending.csv"

        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        tmp.write(raw)
        tmp.close()

        creds = service_account.Credentials.from_service_account_file(tmp.name)
        client = storage.Client(project=project_id, credentials=creds)
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_name)

        if blob.exists():
            blob.reload()
            write_status("DONE", size_gb=round(blob.size / (1024**3), 2))
            print(f"Already uploaded: {blob.size / (1024**3):.2f} GB")
            os.unlink(tmp.name)
            return

        filesize = os.path.getsize(filepath)
        write_status("UPLOADING", size_gb=round(filesize / (1024**3), 2))

        blob.chunk_size = 10 * 1024 * 1024
        start = time.time()
        blob.upload_from_filename(filepath, content_type="text/csv", timeout=7200)
        elapsed = time.time() - start

        write_status("DONE", size_gb=round(filesize / (1024**3), 2), elapsed_s=int(elapsed))
        print(f"Upload complete: {filesize / (1024**3):.2f} GB in {int(elapsed)}s")
        os.unlink(tmp.name)

    except Exception as e:
        write_status("ERROR", error=str(e))
        print(f"ERROR: {e}", file=sys.stderr)
        raise

if __name__ == "__main__":
    main()
