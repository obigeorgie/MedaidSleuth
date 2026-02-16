import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { sql, eq, and, desc, or } from "drizzle-orm";
import { requireAuth } from "./auth";
import { db } from "./db";
import {
  watchlist,
  savedSearches,
  caseNotes,
  userSettings,
  sharedFindings,
  activityLogs,
  users,
} from "@shared/schema";

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

function scanForFraud(threshold: number = 200): FraudResult[] {
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
        if (growth > threshold) {
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
  app.get("/api/stats", requireAuth, (_req: Request, res: Response) => {
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

  app.get("/api/claims", requireAuth, (req: Request, res: Response) => {
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

  app.get("/api/scan", requireAuth, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    let threshold = 200;
    try {
      const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
      if (settings?.alertThreshold) threshold = settings.alertThreshold;
    } catch (e) {}
    const thresholdParam = req.query.threshold as string | undefined;
    if (thresholdParam) threshold = parseInt(thresholdParam, 10);
    res.json(scanForFraud(threshold));
  });

  app.get("/api/providers", requireAuth, (_req: Request, res: Response) => {
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

  app.get("/api/providers/:id", requireAuth, (req: Request, res: Response) => {
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

  app.get("/api/states", requireAuth, (_req: Request, res: Response) => {
    const states = [...new Set(claims.map((c) => c.state_code))].map((code) => ({
      code,
      name: STATE_MAP[code] || code,
    }));
    res.json(states);
  });

  app.get("/api/procedures", requireAuth, (_req: Request, res: Response) => {
    const codes = [...new Set(claims.map((c) => c.procedure_code))].map(
      (code) => ({
        code,
        desc: PROCEDURE_MAP[code] || code,
      })
    );
    res.json(codes);
  });

  // --- Watchlist routes ---

  app.get("/api/watchlist", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const items = await db.select().from(watchlist).where(eq(watchlist.userId, userId)).orderBy(desc(watchlist.addedAt));
      const fraudAlerts = scanForFraud();
      const flaggedIds = new Set(fraudAlerts.map((f) => f.provider_id));
      const enriched = items.map((item) => ({
        ...item,
        isFlagged: flaggedIds.has(item.providerId),
        alerts: fraudAlerts.filter((f) => f.provider_id === item.providerId),
      }));
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch watchlist" });
    }
  });

  app.post("/api/watchlist", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { providerId, providerName, stateCode, procedureCode } = req.body;
      if (!providerId) return res.status(400).json({ message: "providerId required" });
      const existing = await db.select().from(watchlist).where(and(eq(watchlist.userId, userId), eq(watchlist.providerId, providerId)));
      if (existing.length > 0) return res.status(409).json({ message: "Already in watchlist" });
      const [item] = await db.insert(watchlist).values({ userId, providerId, providerName: providerName || providerId, stateCode: stateCode || "", procedureCode: procedureCode || "" }).returning();
      await db.insert(activityLogs).values({ userId, action: "added_to_watchlist", entityType: "provider", entityId: providerId, metadata: { providerName } });
      res.status(201).json(item);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to add to watchlist" });
    }
  });

  app.delete("/api/watchlist/:providerId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const providerId = req.params.providerId;
      await db.delete(watchlist).where(and(eq(watchlist.userId, userId), eq(watchlist.providerId, providerId)));
      await db.insert(activityLogs).values({ userId, action: "removed_from_watchlist", entityType: "provider", entityId: providerId });
      res.json({ message: "Removed from watchlist" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to remove from watchlist" });
    }
  });

  app.get("/api/watchlist/check/:providerId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const providerId = req.params.providerId;
      const existing = await db.select().from(watchlist).where(and(eq(watchlist.userId, userId), eq(watchlist.providerId, providerId)));
      res.json({ isWatched: existing.length > 0 });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to check watchlist" });
    }
  });

  // --- Saved Searches routes ---

  app.get("/api/saved-searches", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const searches = await db.select().from(savedSearches).where(eq(savedSearches.userId, userId)).orderBy(desc(savedSearches.createdAt));
      res.json(searches);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch saved searches" });
    }
  });

  app.post("/api/saved-searches", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { name, stateCode, procedureCode } = req.body;
      if (!name) return res.status(400).json({ message: "name required" });
      const [search] = await db.insert(savedSearches).values({ userId, name, stateCode: stateCode || null, procedureCode: procedureCode || null }).returning();
      await db.insert(activityLogs).values({ userId, action: "saved_search", entityType: "search", entityId: search.id.toString(), metadata: { name, stateCode, procedureCode } });
      res.status(201).json(search);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to save search" });
    }
  });

  app.delete("/api/saved-searches/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const id = parseInt(req.params.id, 10);
      await db.delete(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)));
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete search" });
    }
  });

  // --- User Settings routes (alert threshold) ---

  app.get("/api/settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      let [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
      if (!settings) {
        [settings] = await db.insert(userSettings).values({ userId }).returning();
      }
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      res.json({ ...settings, themePreference: user?.themePreference || "dark" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.put("/api/settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { alertThreshold, themePreference } = req.body;
      let [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
      if (!settings) {
        [settings] = await db.insert(userSettings).values({ userId, alertThreshold: alertThreshold || 200 }).returning();
      } else {
        if (alertThreshold !== undefined) {
          [settings] = await db.update(userSettings).set({ alertThreshold, updatedAt: new Date() }).where(eq(userSettings.userId, userId)).returning();
        }
      }
      if (themePreference !== undefined) {
        await db.update(users).set({ themePreference }).where(eq(users.id, userId));
      }
      await db.insert(activityLogs).values({ userId, action: "updated_settings", entityType: "settings", metadata: { alertThreshold, themePreference } });
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // --- Case Notes routes ---

  app.get("/api/case-notes/:providerId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const providerId = req.params.providerId;
      const notes = await db.select().from(caseNotes).where(and(eq(caseNotes.userId, userId), eq(caseNotes.providerId, providerId))).orderBy(desc(caseNotes.createdAt));
      res.json(notes);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch case notes" });
    }
  });

  app.post("/api/case-notes", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { providerId, content, tags } = req.body;
      if (!providerId || !content) return res.status(400).json({ message: "providerId and content required" });
      const [note] = await db.insert(caseNotes).values({ userId, providerId, content, tags: tags || [] }).returning();
      await db.insert(activityLogs).values({ userId, action: "added_case_note", entityType: "case_note", entityId: providerId, metadata: { noteId: note.id } });
      res.status(201).json(note);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to create case note" });
    }
  });

  app.delete("/api/case-notes/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const id = parseInt(req.params.id, 10);
      await db.delete(caseNotes).where(and(eq(caseNotes.id, id), eq(caseNotes.userId, userId)));
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete case note" });
    }
  });

  // --- Shared Findings routes ---

  app.get("/api/shared-findings", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const received = await db.select().from(sharedFindings).where(eq(sharedFindings.toUserId, userId)).orderBy(desc(sharedFindings.createdAt));
      const sent = await db.select().from(sharedFindings).where(eq(sharedFindings.fromUserId, userId)).orderBy(desc(sharedFindings.createdAt));
      const allUsers = await db.select({ id: users.id, username: users.username }).from(users);
      const userMap: Record<string, string> = {};
      allUsers.forEach((u) => { userMap[u.id] = u.username; });
      const enrichReceived = received.map((f) => ({ ...f, fromUsername: userMap[f.fromUserId] || "Unknown" }));
      const enrichSent = sent.map((f) => ({ ...f, toUsername: userMap[f.toUserId] || "Unknown" }));
      res.json({ received: enrichReceived, sent: enrichSent });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch shared findings" });
    }
  });

  app.post("/api/shared-findings", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { toUsername, providerId, providerName, message } = req.body;
      if (!toUsername || !providerId) return res.status(400).json({ message: "toUsername and providerId required" });
      const [targetUser] = await db.select().from(users).where(eq(users.username, toUsername));
      if (!targetUser) return res.status(404).json({ message: "User not found" });
      if (targetUser.id === userId) return res.status(400).json({ message: "Cannot share with yourself" });
      const [finding] = await db.insert(sharedFindings).values({ fromUserId: userId, toUserId: targetUser.id, providerId, providerName: providerName || providerId, message: message || null }).returning();
      await db.insert(activityLogs).values({ userId, action: "shared_finding", entityType: "provider", entityId: providerId, metadata: { toUsername, providerName } });
      res.status(201).json(finding);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to share finding" });
    }
  });

  app.put("/api/shared-findings/:id/read", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const id = parseInt(req.params.id, 10);
      await db.update(sharedFindings).set({ isRead: true }).where(and(eq(sharedFindings.id, id), eq(sharedFindings.toUserId, userId)));
      res.json({ message: "Marked as read" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update" });
    }
  });

  app.get("/api/users/search", requireAuth, async (req: Request, res: Response) => {
    try {
      const q = (req.query.q as string || "").toLowerCase();
      const userId = req.session.userId!;
      const allUsers = await db.select({ id: users.id, username: users.username }).from(users);
      const filtered = allUsers.filter((u) => u.id !== userId && u.username.toLowerCase().includes(q));
      res.json(filtered.slice(0, 10));
    } catch (error: any) {
      res.status(500).json({ message: "Failed to search users" });
    }
  });

  // --- Activity Feed routes ---

  app.get("/api/activity", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const logs = await db.select().from(activityLogs).where(eq(activityLogs.userId, userId)).orderBy(desc(activityLogs.createdAt)).limit(50);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch activity" });
    }
  });

  // --- Comparative Analysis route ---

  app.get("/api/compare", requireAuth, (req: Request, res: Response) => {
    const ids = ((req.query.ids as string) || "").split(",").filter(Boolean);
    if (ids.length < 2) return res.status(400).json({ message: "At least 2 provider IDs required" });
    const results = ids.map((id) => {
      const providerClaims = claims.filter((c) => c.provider_id === id);
      if (providerClaims.length === 0) return null;
      const sample = providerClaims[0];
      const monthlyTotals = getMonthlyTotals(id);
      const totalSpend = providerClaims.reduce((s, c) => s + c.total_paid, 0);
      const fraudAlerts = scanForFraud().filter((f) => f.provider_id === id);
      return {
        id: sample.provider_id,
        name: sample.provider_name,
        state_code: sample.state_code,
        state_name: sample.state_name,
        procedure_code: sample.procedure_code,
        procedure_desc: sample.procedure_desc,
        totalSpend,
        claimCount: providerClaims.length,
        monthlyTotals,
        fraudAlerts,
        isFlagged: fraudAlerts.length > 0,
      };
    }).filter(Boolean);
    res.json(results);
  });

  // --- Geographic Heatmap route ---

  app.get("/api/heatmap", requireAuth, (_req: Request, res: Response) => {
    const fraudAlerts = scanForFraud();
    const stateData: Record<string, { code: string; name: string; totalSpend: number; alertCount: number; providerCount: number; criticalCount: number; highCount: number; mediumCount: number }> = {};
    for (const c of claims) {
      if (!stateData[c.state_code]) {
        stateData[c.state_code] = { code: c.state_code, name: c.state_name, totalSpend: 0, alertCount: 0, providerCount: 0, criticalCount: 0, highCount: 0, mediumCount: 0 };
      }
      stateData[c.state_code].totalSpend += c.total_paid;
    }
    const providersByState: Record<string, Set<string>> = {};
    for (const c of claims) {
      if (!providersByState[c.state_code]) providersByState[c.state_code] = new Set();
      providersByState[c.state_code].add(c.provider_id);
    }
    for (const [code, providers] of Object.entries(providersByState)) {
      if (stateData[code]) stateData[code].providerCount = providers.size;
    }
    for (const alert of fraudAlerts) {
      if (stateData[alert.state_code]) {
        stateData[alert.state_code].alertCount++;
        if (alert.severity === "critical") stateData[alert.state_code].criticalCount++;
        else if (alert.severity === "high") stateData[alert.state_code].highCount++;
        else stateData[alert.state_code].mediumCount++;
      }
    }
    res.json(Object.values(stateData));
  });

  // --- Export route ---

  app.get("/api/export/csv", requireAuth, (_req: Request, res: Response) => {
    const fraudAlerts = scanForFraud();
    const header = "Provider ID,Provider Name,State,Procedure Code,Procedure Description,Month,Billed Amount,Previous Month,Growth %,Severity\n";
    const rows = fraudAlerts.map((a) =>
      `"${a.provider_id}","${a.provider_name}","${a.state_name}","${a.procedure_code}","${a.procedure_desc}","${a.month}",${a.monthly_total},${a.prev_month_total},${a.growth_percent},"${a.severity}"`
    ).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=fraud-report.csv");
    res.send(header + rows);
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
