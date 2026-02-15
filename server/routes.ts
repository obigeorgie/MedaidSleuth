import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { sql } from "drizzle-orm";

interface Claim {
  provider_id: string;
  provider_name: string;
  procedure_code: string;
  procedure_desc: string;
  state_code: string;
  state_name: string;
  total_paid: number;
  month: string;
}

interface FraudResult {
  provider_id: string;
  provider_name: string;
  state_code: string;
  state_name: string;
  procedure_code: string;
  procedure_desc: string;
  month: string;
  monthly_total: number;
  prev_month_total: number;
  growth_percent: number;
  severity: "critical" | "high" | "medium";
}

const PROCEDURE_MAP: Record<string, string> = {
  "97153": "Adaptive Behavior Treatment (ABA)",
  "99213": "Office/Outpatient Visit Level 3",
  "99214": "Office/Outpatient Visit Level 4",
  "D0120": "Periodic Oral Evaluation",
  "90834": "Psychotherapy 45min",
  "90837": "Psychotherapy 60min",
  "99232": "Subsequent Hospital Care",
  "T1017": "Targeted Case Management",
};

const STATE_MAP: Record<string, string> = {
  MN: "Minnesota",
  TX: "Texas",
  FL: "Florida",
  CA: "California",
  NY: "New York",
  OH: "Ohio",
  IL: "Illinois",
};

let claims: Claim[] = [];

function seedRng(base: number): () => number {
  let s = base;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function generateMockData() {
  claims = [];
  const months = [
    "2023-01-01", "2023-02-01", "2023-03-01", "2023-04-01",
    "2023-05-01", "2023-06-01", "2023-07-01", "2023-08-01",
    "2023-09-01", "2023-10-01", "2023-11-01", "2023-12-01",
  ];

  const rng = seedRng(42);
  const randInt = (min: number, max: number) =>
    Math.floor(rng() * (max - min + 1)) + min;

  for (const m of months) {
    claims.push({
      provider_id: "TX-100",
      provider_name: "Lone Star Health Clinic",
      procedure_code: "99213",
      procedure_desc: PROCEDURE_MAP["99213"],
      state_code: "TX",
      state_name: "Texas",
      total_paid: randInt(10000, 12500),
      month: m,
    });
  }

  for (const m of months) {
    claims.push({
      provider_id: "FL-200",
      provider_name: "Sunshine Dental Group",
      procedure_code: "D0120",
      procedure_desc: PROCEDURE_MAP["D0120"],
      state_code: "FL",
      state_name: "Florida",
      total_paid: randInt(5000, 6500),
      month: m,
    });
  }

  for (const m of months) {
    claims.push({
      provider_id: "CA-300",
      provider_name: "Pacific Behavioral Health",
      procedure_code: "90834",
      procedure_desc: PROCEDURE_MAP["90834"],
      state_code: "CA",
      state_name: "California",
      total_paid: randInt(15000, 18000),
      month: m,
    });
  }

  for (const m of months) {
    claims.push({
      provider_id: "NY-400",
      provider_name: "Empire State Medical",
      procedure_code: "99214",
      procedure_desc: PROCEDURE_MAP["99214"],
      state_code: "NY",
      state_name: "New York",
      total_paid: randInt(20000, 24000),
      month: m,
    });
  }

  for (const m of months) {
    claims.push({
      provider_id: "OH-500",
      provider_name: "Buckeye Community Care",
      procedure_code: "T1017",
      procedure_desc: PROCEDURE_MAP["T1017"],
      state_code: "OH",
      state_name: "Ohio",
      total_paid: randInt(7000, 9000),
      month: m,
    });
  }

  const mnFraudAmounts: Record<string, number> = {
    "2023-01-01": 2000,
    "2023-02-01": 2500,
    "2023-03-01": 55000,
    "2023-04-01": 120000,
    "2023-05-01": 150000,
    "2023-06-01": 180000,
    "2023-07-01": 210000,
    "2023-08-01": 195000,
    "2023-09-01": 225000,
    "2023-10-01": 240000,
    "2023-11-01": 260000,
    "2023-12-01": 280000,
  };

  for (const m of months) {
    claims.push({
      provider_id: "MN-999",
      provider_name: "Suspicious Care LLC",
      procedure_code: "97153",
      procedure_desc: PROCEDURE_MAP["97153"],
      state_code: "MN",
      state_name: "Minnesota",
      total_paid: mnFraudAmounts[m],
      month: m,
    });
  }

  const ilFraudAmounts: Record<string, number> = {
    "2023-01-01": 3000,
    "2023-02-01": 3200,
    "2023-03-01": 3100,
    "2023-04-01": 3500,
    "2023-05-01": 4000,
    "2023-06-01": 35000,
    "2023-07-01": 72000,
    "2023-08-01": 95000,
    "2023-09-01": 110000,
    "2023-10-01": 130000,
    "2023-11-01": 145000,
    "2023-12-01": 160000,
  };

  for (const m of months) {
    claims.push({
      provider_id: "IL-888",
      provider_name: "Midwest Wellness Network",
      procedure_code: "90837",
      procedure_desc: PROCEDURE_MAP["90837"],
      state_code: "IL",
      state_name: "Illinois",
      total_paid: ilFraudAmounts[m],
      month: m,
    });
  }

  const flFraudAmounts: Record<string, number> = {
    "2023-01-01": 8000,
    "2023-02-01": 8500,
    "2023-03-01": 9000,
    "2023-04-01": 8800,
    "2023-05-01": 9200,
    "2023-06-01": 9500,
    "2023-07-01": 9100,
    "2023-08-01": 42000,
    "2023-09-01": 88000,
    "2023-10-01": 105000,
    "2023-11-01": 120000,
    "2023-12-01": 135000,
  };

  for (const m of months) {
    claims.push({
      provider_id: "FL-777",
      provider_name: "Gulf Coast Recovery Center",
      procedure_code: "99232",
      procedure_desc: PROCEDURE_MAP["99232"],
      state_code: "FL",
      state_name: "Florida",
      total_paid: flFraudAmounts[m],
      month: m,
    });
  }
}

generateMockData();

function getMonthlyTotals(providerId: string) {
  const providerClaims = claims.filter((c) => c.provider_id === providerId);
  const grouped: Record<string, number> = {};
  for (const c of providerClaims) {
    grouped[c.month] = (grouped[c.month] || 0) + c.total_paid;
  }
  return Object.entries(grouped)
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function scanForFraud(): FraudResult[] {
  const grouped: Record<string, { month: string; total: number }[]> = {};

  for (const c of claims) {
    const key = `${c.provider_id}|${c.procedure_code}`;
    if (!grouped[key]) grouped[key] = [];
    const existing = grouped[key].find((g) => g.month === c.month);
    if (existing) {
      existing.total += c.total_paid;
    } else {
      grouped[key].push({ month: c.month, total: c.total_paid });
    }
  }

  const results: FraudResult[] = [];

  for (const [key, months] of Object.entries(grouped)) {
    months.sort((a, b) => a.month.localeCompare(b.month));
    const [providerId, procedureCode] = key.split("|");
    const sample = claims.find(
      (c) => c.provider_id === providerId && c.procedure_code === procedureCode
    );
    if (!sample) continue;

    for (let i = 1; i < months.length; i++) {
      const prev = months[i - 1].total;
      const curr = months[i].total;
      if (prev > 0) {
        const growth = ((curr - prev) / prev) * 100;
        if (growth > 200) {
          let severity: "critical" | "high" | "medium" = "medium";
          if (growth > 1000) severity = "critical";
          else if (growth > 500) severity = "high";

          results.push({
            provider_id: sample.provider_id,
            provider_name: sample.provider_name,
            state_code: sample.state_code,
            state_name: sample.state_name,
            procedure_code: sample.procedure_code,
            procedure_desc: sample.procedure_desc,
            month: months[i].month,
            monthly_total: curr,
            prev_month_total: prev,
            growth_percent: Math.round(growth * 100) / 100,
            severity,
          });
        }
      }
    }
  }

  return results.sort((a, b) => b.growth_percent - a.growth_percent);
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/stats", (_req: Request, res: Response) => {
    const uniqueProviders = new Set(claims.map((c) => c.provider_id));
    const uniqueStates = new Set(claims.map((c) => c.state_code));
    const totalSpend = claims.reduce((sum, c) => sum + c.total_paid, 0);
    const fraudAlerts = scanForFraud();

    res.json({
      totalClaims: claims.length,
      totalProviders: uniqueProviders.size,
      totalStates: uniqueStates.size,
      totalSpend,
      flaggedProviders: new Set(fraudAlerts.map((f) => f.provider_id)).size,
      totalAlerts: fraudAlerts.length,
    });
  });

  app.get("/api/claims", (req: Request, res: Response) => {
    let filtered = [...claims];

    const state = req.query.state as string | undefined;
    const code = req.query.code as string | undefined;
    const provider = req.query.provider as string | undefined;

    if (state) filtered = filtered.filter((c) => c.state_code === state);
    if (code) filtered = filtered.filter((c) => c.procedure_code === code);
    if (provider) filtered = filtered.filter((c) => c.provider_id === provider);

    filtered.sort((a, b) => a.month.localeCompare(b.month));
    res.json(filtered);
  });

  app.get("/api/scan", (_req: Request, res: Response) => {
    res.json(scanForFraud());
  });

  app.get("/api/providers", (_req: Request, res: Response) => {
    const providerMap: Record<
      string,
      {
        id: string;
        name: string;
        state_code: string;
        state_name: string;
        procedure_code: string;
        procedure_desc: string;
        totalSpend: number;
        claimCount: number;
      }
    > = {};

    for (const c of claims) {
      if (!providerMap[c.provider_id]) {
        providerMap[c.provider_id] = {
          id: c.provider_id,
          name: c.provider_name,
          state_code: c.state_code,
          state_name: c.state_name,
          procedure_code: c.procedure_code,
          procedure_desc: c.procedure_desc,
          totalSpend: 0,
          claimCount: 0,
        };
      }
      providerMap[c.provider_id].totalSpend += c.total_paid;
      providerMap[c.provider_id].claimCount++;
    }

    res.json(Object.values(providerMap));
  });

  app.get("/api/providers/:id", (req: Request, res: Response) => {
    const providerId = req.params.id;
    const providerClaims = claims.filter((c) => c.provider_id === providerId);

    if (providerClaims.length === 0) {
      return res.status(404).json({ message: "Provider not found" });
    }

    const sample = providerClaims[0];
    const monthlyTotals = getMonthlyTotals(providerId);
    const totalSpend = providerClaims.reduce((s, c) => s + c.total_paid, 0);

    const growthData: { month: string; growth: number }[] = [];
    for (let i = 1; i < monthlyTotals.length; i++) {
      const prev = monthlyTotals[i - 1].total;
      const curr = monthlyTotals[i].total;
      if (prev > 0) {
        growthData.push({
          month: monthlyTotals[i].month,
          growth: Math.round(((curr - prev) / prev) * 100 * 100) / 100,
        });
      }
    }

    const fraudAlerts = scanForFraud().filter(
      (f) => f.provider_id === providerId
    );

    res.json({
      id: sample.provider_id,
      name: sample.provider_name,
      state_code: sample.state_code,
      state_name: sample.state_name,
      procedure_code: sample.procedure_code,
      procedure_desc: sample.procedure_desc,
      totalSpend,
      claimCount: providerClaims.length,
      monthlyTotals,
      growthData,
      fraudAlerts,
      isFlagged: fraudAlerts.length > 0,
    });
  });

  app.get("/api/states", (_req: Request, res: Response) => {
    const states = [...new Set(claims.map((c) => c.state_code))].map((code) => ({
      code,
      name: STATE_MAP[code] || code,
    }));
    res.json(states);
  });

  app.get("/api/procedures", (_req: Request, res: Response) => {
    const codes = [...new Set(claims.map((c) => c.procedure_code))].map(
      (code) => ({
        code,
        desc: PROCEDURE_MAP[code] || code,
      })
    );
    res.json(codes);
  });

  // --- Stripe payment routes ---

  app.get("/api/stripe/publishable-key", async (_req: Request, res: Response) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (error: any) {
      console.error("Error getting publishable key:", error.message);
      res.status(500).json({ error: "Failed to get Stripe publishable key" });
    }
  });

  app.get("/api/stripe/products", async (_req: Request, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const products = await stripe.products.list({ active: true, limit: 10 });
      const prices = await stripe.prices.list({ active: true, limit: 50 });

      const productsWithPrices = products.data.map((product) => {
        const productPrices = prices.data.filter((p) => p.product === product.id);
        return {
          id: product.id,
          name: product.name,
          description: product.description,
          metadata: product.metadata,
          prices: productPrices.map((p) => ({
            id: p.id,
            unit_amount: p.unit_amount,
            currency: p.currency,
            recurring: p.recurring,
          })),
        };
      });

      res.json({ data: productsWithPrices });
    } catch (error: any) {
      console.error("Error listing products:", error.message);
      res.status(500).json({ error: "Failed to list products" });
    }
  });

  app.post("/api/stripe/checkout", async (req: Request, res: Response) => {
    try {
      const { priceId } = req.body;
      if (!priceId) {
        return res.status(400).json({ error: "priceId is required" });
      }

      const stripe = await getUncachableStripeClient();

      const forwardedProto = req.header("x-forwarded-proto") || req.protocol || "https";
      const forwardedHost = req.header("x-forwarded-host") || req.get("host");
      const baseUrl = `${forwardedProto}://${forwardedHost}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        success_url: `${baseUrl}/api/stripe/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/api/stripe/checkout/cancel`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating checkout session:", error.message);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  app.get("/api/stripe/checkout/success", (_req: Request, res: Response) => {
    res.send(`
      <html>
        <head><title>Payment Successful</title></head>
        <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #060D1B; color: #F0F4FA; margin: 0;">
          <div style="text-align: center; padding: 40px;">
            <div style="font-size: 64px; margin-bottom: 16px;">&#10003;</div>
            <h1 style="color: #00E5CC; margin-bottom: 8px;">Payment Successful</h1>
            <p style="color: #8E9AB5;">Your subscription is now active. You can close this window and return to the app.</p>
          </div>
        </body>
      </html>
    `);
  });

  app.get("/api/stripe/checkout/cancel", (_req: Request, res: Response) => {
    res.send(`
      <html>
        <head><title>Payment Cancelled</title></head>
        <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #060D1B; color: #F0F4FA; margin: 0;">
          <div style="text-align: center; padding: 40px;">
            <div style="font-size: 64px; margin-bottom: 16px;">&#10007;</div>
            <h1 style="color: #FF4D6A; margin-bottom: 8px;">Payment Cancelled</h1>
            <p style="color: #8E9AB5;">No charges were made. You can close this window and return to the app.</p>
          </div>
        </body>
      </html>
    `);
  });

  const httpServer = createServer(app);
  return httpServer;
}
