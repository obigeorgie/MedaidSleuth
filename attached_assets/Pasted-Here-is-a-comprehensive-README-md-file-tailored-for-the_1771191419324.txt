Here is a comprehensive `README.md` file tailored for the **MedicaidSleuth** application. It incorporates the technical details from the code we generated and the background context from the provided sources regarding the dataset and fraud detection methodologies.

***

# MedicaidSleuth 🕵️‍♂️

**Medicaid Provider Spending Analysis & Fraud Detection Tool**

MedicaidSleuth is a lightweight SaaS prototype designed to analyze the **10.32 GB Medicaid Provider Spending dataset** released by the HHS. It allows investigators, journalists, and researchers to query provider billing history, visualize spending trends, and automatically detect "fraud spikes" (anomalous billing growth).

This tool implements the "reverse engineering" methodology to uncover patterns similar to the **Minnesota EIDBI (Autism) scandal**, where providers billed for services that were statistically impossible.

## 🚀 Key Features

*   **🔍 Data Explorer:** Filter 227 million rows of claims data by State, Procedure Code (CPT), and Provider Name.
*   **🚨 Anomaly Scanner:** Automated detection of "Spike Fraud." Identifies providers with **>200% month-over-month billing growth**—a key indicator of potential fraud.
*   **📈 Visualizations:** Instant time-series charting of payment history using Chart.js.
*   **⚡ High-Performance Backend:** Uses **DuckDB** for ultra-fast OLAP queries on large datasets without needing enterprise infrastructure.

## 🛠 Tech Stack

*   **Backend:** Python 3.x, Flask
*   **Data Engine:** DuckDB, Pandas
*   **Frontend:** HTML5, TailwindCSS, Chart.js (No build step required)

## 📦 Installation & Setup

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/medicaidsleuth.git
cd medicaidsleuth
```

### 2. Install Dependencies
```bash
pip install flask duckdb pandas
```

### 3. Run the Application
```bash
python main.py
```
*The app will start on `http://0.0.0.0:8080` (or `http://localhost:8080`).*

---

## 📊 Data Source & "Real Mode"

### Default: Mock Data Mode
By default, the app runs in **Mock Mode** using an in-memory database. It generates synthetic data that mimics real-world fraud patterns (specifically the "Suspicious Care LLC" example mimicking the Minnesota autism fraud case) so you can test the UI immediately.

### How to Use Real Government Data
To analyze the actual **$1.09 Trillion** in payments, follow these steps:

1.  **Download the Data:**
    *   Visit [opendata.hhs.gov](https://opendata.hhs.gov).
    *   Search for **"Medicaid Provider Spending"** (Look for the version dated Feb 8, 2026).
    *   Download the full dataset (approx. 10.32 GB compressed).

2.  **Load into DuckDB:**
    *   Place the CSV/Parquet file in your project root.
    *   Modify `main.py` to point to the real file instead of `:memory:`:
    ```python
    # In main.py
    # con = duckdb.connect(database=':memory:')  <-- Comment this out
    con = duckdb.connect(database='medicaid_data.duckdb') # <-- Use persistent DB
    
    # Run once to import:
    # con.execute("CREATE TABLE claims AS SELECT * FROM read_csv_auto('medicaid_provider_spending.csv')")
    ```

## 🧠 Fraud Detection Logic

The "Scan for Fraud" feature utilizes a specific SQL pattern derived from forensic accounting principles:

> **The Spike Pattern:** We calculate the percentage growth of `total_paid` for a specific `procedure_code` from Month A to Month B. If `growth_percent > 200` AND `previous_month_total > $0`, the provider is flagged.

This logic is effective for spotting:
*   **Upcoding:** Suddenly billing for more expensive services.
*   **Ghost Patients:** Billing for services never rendered, resulting in impossible volume spikes.

## 🗺 Roadmap

*   **Ingestion Pipeline:** Script to auto-download monthly updates from HHS.
*   **Geospatial Analysis:** Compare cost-per-procedure across different states to find geographic outliers.
*   **Bounty Hunter Reporting:** One-click generation of PDF reports formatted for HHS OIG tip submissions.

## ⚖️ License & Disclaimer

*   **Data Rights:** The underlying data is sourced from the U.S. Department of Health and Human Services (HHS) and is in the public domain. Please attribute HHS when publishing findings.
*   **Liability:** This tool is for analytical purposes only. Verify all "fraud" flags with actual provider records before making public accusations or reports.

---

*Built for the Transparency Era.*