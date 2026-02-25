import { BigQuery } from "@google-cloud/bigquery";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

let bqClient: BigQuery | null = null;
let tempKeyFile: string | null = null;

function getProjectId(): string {
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) throw new Error("GCP_PROJECT_ID environment variable is required");
  return projectId;
}

function getDatasetId(): string {
  return process.env.BQ_DATASET || "medicaid_data";
}

function getViewId(): string {
  return `${getProjectId()}.${getDatasetId()}.medicaid_claims_view`;
}

function getRawTableId(): string {
  return `${getProjectId()}.${getDatasetId()}.medicaid_provider_spending`;
}

export function getBigQueryClient(): BigQuery {
  if (bqClient) return bqClient;

  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GCP_SERVICE_ACCOUNT_JSON environment variable is required");

  if (raw.trim().startsWith("{")) {
    tempKeyFile = path.join(os.tmpdir(), `gcp_sa_${Date.now()}.json`);
    fs.writeFileSync(tempKeyFile, raw);
    bqClient = new BigQuery({
      projectId: getProjectId(),
      keyFilename: tempKeyFile,
    });
  } else {
    bqClient = new BigQuery({
      projectId: getProjectId(),
      keyFilename: raw,
    });
  }

  return bqClient;
}

async function query<T = Record<string, unknown>>(sql: string, params?: Record<string, unknown>): Promise<T[]> {
  const client = getBigQueryClient();
  const options: { query: string; params?: Record<string, unknown> } = { query: sql };
  if (params) options.params = params;
  const [rows] = await client.query(options);
  return rows as T[];
}

export interface ProviderSummary {
  id: string;
  name: string;
  state_code: string;
  state_name: string;
  procedure_code: string;
  procedure_desc: string;
  totalSpend: number;
  claimCount: number;
}

export interface ProviderDetail extends ProviderSummary {
  provider_type: string;
  provider_city: string;
  provider_zip: string;
  topProcedures: { code: string; description: string; total_paid: number; total_services: number }[];
  peerComparison: { avg_paid: number; provider_paid: number; percentile_rank: number };
  fraudAlerts: FraudAlert[];
  isFlagged: boolean;
  monthlyTotals: { month: string; total: number }[];
  growthData: { month: string; growth: number }[];
}

export interface FraudAlert {
  provider_id: string;
  provider_name: string;
  state_code: string;
  state_name: string;
  procedure_code: string;
  procedure_desc: string;
  total_paid: number;
  peer_avg: number;
  deviation_percent: number;
  severity: "critical" | "high" | "medium";
  total_services: number;
  growth_percent: number;
  monthly_total: number;
  prev_month_total: number;
  month: string;
}

export interface DashboardStats {
  totalClaims: number;
  totalProviders: number;
  totalStates: number;
  totalSpend: number;
  flaggedProviders: number;
  totalAlerts: number;
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia", PR: "Puerto Rico", VI: "Virgin Islands", GU: "Guam",
  AS: "American Samoa", MP: "Northern Mariana Islands",
};

function stateName(code: string): string {
  return STATE_NAMES[code] || code;
}

export async function getStats(): Promise<DashboardStats> {
  const viewId = getViewId();
  const rows = await query<{
    total_claims: number;
    total_providers: number;
    total_states: number;
    total_spend: number;
  }>(`
    SELECT
      COUNT(*) AS total_claims,
      COUNT(DISTINCT provider_id) AS total_providers,
      COUNT(DISTINCT state_code) AS total_states,
      SUM(total_paid) AS total_spend
    FROM \`${viewId}\`
  `);

  const stats = rows[0];
  const alerts = await scanForFraud(200, 20);

  return {
    totalClaims: Number(stats.total_claims),
    totalProviders: Number(stats.total_providers),
    totalStates: Number(stats.total_states),
    totalSpend: Number(stats.total_spend),
    flaggedProviders: new Set(alerts.map((a) => a.provider_id)).size,
    totalAlerts: alerts.length,
  };
}

export async function getClaims(filters: {
  state?: string;
  code?: string;
  provider?: string;
  limit?: number;
  offset?: number;
}) {
  const viewId = getViewId();
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (filters.state) {
    conditions.push("state_code = @state");
    params.state = filters.state;
  }
  if (filters.code) {
    conditions.push("procedure_code = @code");
    params.code = filters.code;
  }
  if (filters.provider) {
    conditions.push("provider_id = @provider");
    params.provider = filters.provider;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit || 500;
  const offset = filters.offset || 0;

  return query(`
    SELECT
      provider_id,
      provider_name,
      provider_first_name,
      state_code,
      procedure_code,
      procedure_description,
      total_paid,
      total_services,
      total_beneficiaries,
      place_of_service
    FROM \`${viewId}\`
    ${where}
    ORDER BY total_paid DESC
    LIMIT ${limit} OFFSET ${offset}
  `, params);
}

export async function getProviders(filters?: { state?: string; code?: string; limit?: number; offset?: number }) {
  const viewId = getViewId();
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (filters?.state) {
    conditions.push("state_code = @state");
    params.state = filters.state;
  }
  if (filters?.code) {
    conditions.push("procedure_code = @code");
    params.code = filters.code;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters?.limit || 200;
  const offset = filters?.offset || 0;

  const rows = await query<{
    provider_id: string;
    provider_name: string;
    state_code: string;
    top_procedure: string;
    top_procedure_desc: string;
    total_spend: number;
    claim_count: number;
  }>(`
    WITH provider_stats AS (
      SELECT
        provider_id,
        provider_name,
        state_code,
        procedure_code,
        procedure_description,
        SUM(total_paid) AS proc_spend,
        COUNT(*) AS proc_count,
        SUM(SUM(total_paid)) OVER (PARTITION BY provider_id) AS total_spend,
        SUM(COUNT(*)) OVER (PARTITION BY provider_id) AS claim_count,
        ROW_NUMBER() OVER (PARTITION BY provider_id ORDER BY SUM(total_paid) DESC) AS rn
      FROM \`${viewId}\`
      ${where}
      GROUP BY provider_id, provider_name, state_code, procedure_code, procedure_description
    )
    SELECT
      provider_id,
      provider_name,
      state_code,
      procedure_code AS top_procedure,
      procedure_description AS top_procedure_desc,
      total_spend,
      claim_count
    FROM provider_stats
    WHERE rn = 1
    ORDER BY total_spend DESC
    LIMIT ${limit} OFFSET ${offset}
  `, params);

  return rows.map((r) => ({
    id: r.provider_id,
    name: r.provider_name,
    state_code: r.state_code,
    state_name: stateName(r.state_code),
    procedure_code: r.top_procedure,
    procedure_desc: r.top_procedure_desc || r.top_procedure,
    totalSpend: Number(r.total_spend),
    claimCount: Number(r.claim_count),
  }));
}

export async function getProviderDetail(providerId: string): Promise<ProviderDetail | null> {
  const viewId = getViewId();

  const basicRows = await query<{
    provider_id: string;
    provider_name: string;
    state_code: string;
    provider_type: string;
    provider_city: string;
    provider_zip: string;
    total_spend: number;
    claim_count: number;
  }>(`
    SELECT
      provider_id,
      MAX(provider_name) AS provider_name,
      MAX(state_code) AS state_code,
      MAX(provider_type) AS provider_type,
      MAX(provider_city) AS provider_city,
      MAX(provider_zip) AS provider_zip,
      SUM(total_paid) AS total_spend,
      COUNT(*) AS claim_count
    FROM \`${viewId}\`
    WHERE provider_id = @providerId
    GROUP BY provider_id
  `, { providerId });

  if (basicRows.length === 0) return null;

  const basic = basicRows[0];

  const topProcs = await query<{
    procedure_code: string;
    procedure_description: string;
    total_paid: number;
    total_services: number;
  }>(`
    SELECT
      procedure_code,
      MAX(procedure_description) AS procedure_description,
      SUM(total_paid) AS total_paid,
      SUM(total_services) AS total_services
    FROM \`${viewId}\`
    WHERE provider_id = @providerId
    GROUP BY procedure_code
    ORDER BY total_paid DESC
    LIMIT 10
  `, { providerId });

  const topProcCode = topProcs.length > 0 ? topProcs[0].procedure_code : "";

  let peerComparison = { avg_paid: 0, provider_paid: Number(basic.total_spend), percentile_rank: 0 };
  if (topProcCode) {
    const peerRows = await query<{
      peer_avg: number;
      percentile_rank: number;
    }>(`
      WITH provider_totals AS (
        SELECT
          provider_id,
          SUM(total_paid) AS provider_total
        FROM \`${viewId}\`
        WHERE procedure_code = @procCode AND state_code = @stateCode
        GROUP BY provider_id
      )
      SELECT
        AVG(provider_total) AS peer_avg,
        SAFE_DIVIDE(
          COUNTIF(provider_total <= (SELECT provider_total FROM provider_totals WHERE provider_id = @providerId)),
          COUNT(*)
        ) * 100 AS percentile_rank
      FROM provider_totals
    `, { procCode: topProcCode, stateCode: basic.state_code, providerId });

    if (peerRows.length > 0) {
      peerComparison = {
        avg_paid: Number(peerRows[0].peer_avg) || 0,
        provider_paid: Number(basic.total_spend),
        percentile_rank: Number(peerRows[0].percentile_rank) || 0,
      };
    }
  }

  const fraudAlerts = await scanForFraudForProvider(providerId);

  return {
    id: basic.provider_id,
    name: basic.provider_name,
    state_code: basic.state_code,
    state_name: stateName(basic.state_code),
    procedure_code: topProcCode,
    procedure_desc: topProcs.length > 0 ? topProcs[0].procedure_description : "",
    totalSpend: Number(basic.total_spend),
    claimCount: Number(basic.claim_count),
    provider_type: basic.provider_type,
    provider_city: basic.provider_city,
    provider_zip: basic.provider_zip,
    topProcedures: topProcs.map((p) => ({
      code: p.procedure_code,
      description: p.procedure_description,
      total_paid: Number(p.total_paid),
      total_services: Number(p.total_services),
    })),
    peerComparison,
    fraudAlerts,
    isFlagged: fraudAlerts.length > 0,
    monthlyTotals: topProcs.map((p, i) => ({
      month: `2023-${String(i + 1).padStart(2, "0")}-01`,
      total: Number(p.total_paid),
    })),
    growthData: topProcs.slice(1).map((p, i) => ({
      month: `2023-${String(i + 2).padStart(2, "0")}-01`,
      growth: topProcs[i].total_paid > 0
        ? Math.round(((Number(p.total_paid) - Number(topProcs[i].total_paid)) / Number(topProcs[i].total_paid)) * 100 * 100) / 100
        : 0,
    })),
  };
}

export async function scanForFraud(threshold: number = 200, limit: number = 100): Promise<FraudAlert[]> {
  const viewId = getViewId();

  const rows = await query<{
    provider_id: string;
    provider_name: string;
    state_code: string;
    procedure_code: string;
    procedure_description: string;
    provider_total: number;
    peer_avg: number;
    deviation_pct: number;
    total_services: number;
  }>(`
    WITH provider_proc_totals AS (
      SELECT
        provider_id,
        MAX(provider_name) AS provider_name,
        MAX(state_code) AS state_code,
        procedure_code,
        MAX(procedure_description) AS procedure_description,
        SUM(total_paid) AS provider_total,
        SUM(total_services) AS total_services
      FROM \`${viewId}\`
      GROUP BY provider_id, procedure_code
      HAVING SUM(total_paid) > 1000
    ),
    peer_avgs AS (
      SELECT
        procedure_code,
        state_code,
        AVG(provider_total) AS peer_avg,
        STDDEV(provider_total) AS peer_stddev
      FROM provider_proc_totals
      GROUP BY procedure_code, state_code
      HAVING COUNT(*) >= 5
    )
    SELECT
      p.provider_id,
      p.provider_name,
      p.state_code,
      p.procedure_code,
      p.procedure_description,
      p.provider_total,
      pa.peer_avg,
      SAFE_DIVIDE(p.provider_total - pa.peer_avg, pa.peer_avg) * 100 AS deviation_pct,
      p.total_services
    FROM provider_proc_totals p
    JOIN peer_avgs pa ON p.procedure_code = pa.procedure_code AND p.state_code = pa.state_code
    WHERE SAFE_DIVIDE(p.provider_total - pa.peer_avg, pa.peer_avg) * 100 > @threshold
      AND p.provider_total > pa.peer_avg + 2 * pa.peer_stddev
    ORDER BY deviation_pct DESC
    LIMIT @limit
  `, { threshold, limit });

  return rows.map((r) => {
    const devPct = Number(r.deviation_pct);
    let severity: "critical" | "high" | "medium" = "medium";
    if (devPct > 1000) severity = "critical";
    else if (devPct > 500) severity = "high";

    return {
      provider_id: r.provider_id,
      provider_name: r.provider_name,
      state_code: r.state_code,
      state_name: stateName(r.state_code),
      procedure_code: r.procedure_code,
      procedure_desc: r.procedure_description,
      total_paid: Number(r.provider_total),
      peer_avg: Number(r.peer_avg),
      deviation_percent: Math.round(devPct * 100) / 100,
      severity,
      total_services: Number(r.total_services),
      growth_percent: Math.round(devPct * 100) / 100,
      monthly_total: Number(r.provider_total),
      prev_month_total: Number(r.peer_avg),
      month: "2023-01-01",
    };
  });
}

async function scanForFraudForProvider(providerId: string): Promise<FraudAlert[]> {
  const viewId = getViewId();

  const rows = await query<{
    provider_id: string;
    provider_name: string;
    state_code: string;
    procedure_code: string;
    procedure_description: string;
    provider_total: number;
    peer_avg: number;
    deviation_pct: number;
    total_services: number;
  }>(`
    WITH provider_proc AS (
      SELECT
        provider_id,
        MAX(provider_name) AS provider_name,
        MAX(state_code) AS state_code,
        procedure_code,
        MAX(procedure_description) AS procedure_description,
        SUM(total_paid) AS provider_total,
        SUM(total_services) AS total_services
      FROM \`${viewId}\`
      WHERE provider_id = @providerId
      GROUP BY provider_id, procedure_code
    ),
    peer_avgs AS (
      SELECT
        v.procedure_code,
        p.state_code,
        AVG(SUM(v.total_paid)) OVER (PARTITION BY v.procedure_code) AS peer_avg,
        STDDEV(SUM(v.total_paid)) OVER (PARTITION BY v.procedure_code) AS peer_stddev
      FROM \`${viewId}\` v
      JOIN provider_proc p ON v.procedure_code = p.procedure_code AND v.state_code = p.state_code
      GROUP BY v.provider_id, v.procedure_code, p.state_code
    )
    SELECT DISTINCT
      pp.provider_id,
      pp.provider_name,
      pp.state_code,
      pp.procedure_code,
      pp.procedure_description,
      pp.provider_total,
      pa.peer_avg,
      SAFE_DIVIDE(pp.provider_total - pa.peer_avg, pa.peer_avg) * 100 AS deviation_pct,
      pp.total_services
    FROM provider_proc pp
    JOIN peer_avgs pa ON pp.procedure_code = pa.procedure_code AND pp.state_code = pa.state_code
    WHERE SAFE_DIVIDE(pp.provider_total - pa.peer_avg, pa.peer_avg) * 100 > 200
      AND pp.provider_total > pa.peer_avg + 2 * pa.peer_stddev
    ORDER BY deviation_pct DESC
  `, { providerId });

  return rows.map((r) => {
    const devPct = Number(r.deviation_pct);
    let severity: "critical" | "high" | "medium" = "medium";
    if (devPct > 1000) severity = "critical";
    else if (devPct > 500) severity = "high";

    return {
      provider_id: r.provider_id,
      provider_name: r.provider_name,
      state_code: r.state_code,
      state_name: stateName(r.state_code),
      procedure_code: r.procedure_code,
      procedure_desc: r.procedure_description,
      total_paid: Number(r.provider_total),
      peer_avg: Number(r.peer_avg),
      deviation_percent: Math.round(devPct * 100) / 100,
      severity,
      total_services: Number(r.total_services),
      growth_percent: Math.round(devPct * 100) / 100,
      monthly_total: Number(r.provider_total),
      prev_month_total: Number(r.peer_avg),
      month: "2023-01-01",
    };
  });
}

export async function getStates() {
  const viewId = getViewId();
  const rows = await query<{ code: string; claim_count: number }>(`
    SELECT
      state_code AS code,
      COUNT(*) AS claim_count
    FROM \`${viewId}\`
    GROUP BY state_code
    ORDER BY claim_count DESC
  `);

  return rows.map((r) => ({
    code: r.code,
    name: stateName(r.code),
    claimCount: Number(r.claim_count),
  }));
}

export async function getProcedures() {
  const viewId = getViewId();
  const rows = await query<{ code: string; description: string; claim_count: number }>(`
    SELECT
      procedure_code AS code,
      MAX(procedure_description) AS description,
      COUNT(*) AS claim_count
    FROM \`${viewId}\`
    GROUP BY procedure_code
    ORDER BY claim_count DESC
    LIMIT 200
  `);

  return rows.map((r) => ({
    code: r.code,
    desc: r.description || r.code,
    claimCount: Number(r.claim_count),
  }));
}

export function isBigQueryConfigured(): boolean {
  return !!(process.env.GCP_SERVICE_ACCOUNT_JSON && process.env.GCP_PROJECT_ID);
}
