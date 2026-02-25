# MedicaidSleuth ETL Pipeline

Downloads the HHS Medicaid Provider Spending dataset (~10.3 GB), uploads it to Google Cloud Storage, and loads it into BigQuery.

## Prerequisites

1. A Google Cloud project with BigQuery and Cloud Storage APIs enabled
2. A GCS bucket (the script will create one named `medicaid-raw-data` if it doesn't exist)
3. A service account with these roles:
   - `BigQuery Data Editor`
   - `BigQuery Job User`
   - `Storage Object Admin`
4. The service account JSON key file downloaded to your machine

## Setup

Install Python dependencies:

```bash
pip install -r etl/requirements.txt
```

Set required environment variables:

```bash
export GCP_SERVICE_ACCOUNT_JSON=/path/to/service-account-key.json
export GCP_PROJECT_ID=your-gcp-project-id
```

## Running the Pipeline

```bash
python etl/medicaid_etl.py
```

The pipeline runs three phases:
1. **Download** — Streams the 10.3 GB CSV from HHS with resume support and retry logic
2. **Upload to GCS** — Resumable upload to `gs://medicaid-raw-data/medicaid_provider_spending.csv`
3. **Load to BigQuery** — Loads from GCS into `your_project.medicaid_data.medicaid_provider_spending`

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GCP_SERVICE_ACCOUNT_JSON` | Yes | — | Path to service account JSON key |
| `GCP_PROJECT_ID` | Yes | — | Google Cloud project ID |
| `BQ_DATASET` | No | `medicaid_data` | BigQuery dataset name |
| `BQ_TABLE` | No | `medicaid_provider_spending` | BigQuery table name |
| `GCS_BUCKET` | No | `medicaid-raw-data` | GCS bucket name |
| `HHS_DATASET_URL` | No | HHS API endpoint | Override download URL |
| `SKIP_DOWNLOAD` | No | `false` | Skip download phase |
| `SKIP_GCS_UPLOAD` | No | `false` | Skip GCS upload phase |
| `LOCAL_FILE_PATH` | No | `etl/medicaid_provider_spending.csv` | Local file path |

## Skipping Phases

If you already downloaded the file:
```bash
export SKIP_DOWNLOAD=true
python etl/medicaid_etl.py
```

If the file is already in GCS:
```bash
export SKIP_DOWNLOAD=true
export SKIP_GCS_UPLOAD=true
python etl/medicaid_etl.py
```

## Expected Schema

The HHS dataset contains these key columns (mapped to app terminology):

| HHS Column | App Column | Description |
|------------|-----------|-------------|
| `npi` | `provider_id` | National Provider Identifier |
| `hcpcs_cd` | `procedure_code` | Healthcare procedure code |
| `prvdr_state_abrvtn` | `state_code` | Provider state abbreviation |
| `avg_mdcd_pymt_amt` | `total_paid` | Average Medicaid payment amount |
| `year` | `year` | Reporting year |
| `prvdr_last_name_org` | `provider_name` | Provider organization name |
| `tot_srvcs` | `total_services` | Total services rendered |
| `tot_benes` | `total_beneficiaries` | Total beneficiaries served |
