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
import {
  getStats,
  getClaims,
  getProviders,
  getProviderDetail,
  scanForFraud,
  getStates,
  getProcedures,
  isBigQueryConfigured,
} from "./bigquery";

export async function registerRoutes(app: Express): Promise<Server> {

  app.get("/api/stats", requireAuth, async (_req: Request, res: Response) => {
    try {
      if (!isBigQueryConfigured()) {
        return res.status(503).json({ message: "BigQuery not configured" });
      }
      const stats = await getStats();
      res.json(stats);
    } catch (error: any) {
      console.error("Error fetching stats:", error.message);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get("/api/claims", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isBigQueryConfigured()) {
        return res.status(503).json({ message: "BigQuery not configured" });
      }
      const state = req.query.state as string | undefined;
      const code = req.query.code as string | undefined;
      const provider = req.query.provider as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 500;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      const claims = await getClaims({ state, code, provider, limit, offset });
      res.json(claims);
    } catch (error: any) {
      console.error("Error fetching claims:", error.message);
      res.status(500).json({ message: "Failed to fetch claims" });
    }
  });

  app.get("/api/scan", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isBigQueryConfigured()) {
        return res.status(503).json({ message: "BigQuery not configured" });
      }
      const userId = req.session.userId!;
      let threshold = 200;
      try {
        const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
        if (settings?.alertThreshold) threshold = settings.alertThreshold;
      } catch (e) {}
      const thresholdParam = req.query.threshold as string | undefined;
      if (thresholdParam) threshold = parseInt(thresholdParam, 10);
      const limitParam = req.query.limit as string | undefined;
      const limit = limitParam ? parseInt(limitParam, 10) : 100;
      const results = await scanForFraud(threshold, limit);
      res.json(results);
    } catch (error: any) {
      console.error("Error scanning for fraud:", error.message);
      res.status(500).json({ message: "Failed to run fraud scan" });
    }
  });

  app.get("/api/providers", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isBigQueryConfigured()) {
        return res.status(503).json({ message: "BigQuery not configured" });
      }
      const state = req.query.state as string | undefined;
      const code = req.query.code as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 200;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      const providers = await getProviders({ state, code, limit, offset });
      res.json(providers);
    } catch (error: any) {
      console.error("Error fetching providers:", error.message);
      res.status(500).json({ message: "Failed to fetch providers" });
    }
  });

  app.get("/api/providers/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isBigQueryConfigured()) {
        return res.status(503).json({ message: "BigQuery not configured" });
      }
      const providerId = req.params.id;
      const detail = await getProviderDetail(providerId);
      if (!detail) {
        return res.status(404).json({ message: "Provider not found" });
      }
      res.json(detail);
    } catch (error: any) {
      console.error("Error fetching provider detail:", error.message);
      res.status(500).json({ message: "Failed to fetch provider detail" });
    }
  });

  app.get("/api/states", requireAuth, async (_req: Request, res: Response) => {
    try {
      if (!isBigQueryConfigured()) {
        return res.status(503).json({ message: "BigQuery not configured" });
      }
      const states = await getStates();
      res.json(states);
    } catch (error: any) {
      console.error("Error fetching states:", error.message);
      res.status(500).json({ message: "Failed to fetch states" });
    }
  });

  app.get("/api/procedures", requireAuth, async (_req: Request, res: Response) => {
    try {
      if (!isBigQueryConfigured()) {
        return res.status(503).json({ message: "BigQuery not configured" });
      }
      const procedures = await getProcedures();
      res.json(procedures);
    } catch (error: any) {
      console.error("Error fetching procedures:", error.message);
      res.status(500).json({ message: "Failed to fetch procedures" });
    }
  });

  app.get("/api/watchlist", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const items = await db.select().from(watchlist).where(eq(watchlist.userId, userId)).orderBy(desc(watchlist.addedAt));

      let flaggedIds = new Set<string>();
      let allAlerts: any[] = [];
      if (isBigQueryConfigured()) {
        try {
          allAlerts = await scanForFraud(200, 100);
          flaggedIds = new Set(allAlerts.map((f) => f.provider_id));
        } catch (e) {}
      }

      const enriched = items.map((item) => ({
        ...item,
        isFlagged: flaggedIds.has(item.providerId),
        alerts: allAlerts.filter((f) => f.provider_id === item.providerId),
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
      await db.insert(activityLogs).values({ userId, action: "shared_finding", entityType: "shared_finding", entityId: providerId, metadata: { toUsername, providerName } });
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
      res.status(500).json({ message: "Failed to update finding" });
    }
  });

  app.delete("/api/shared-findings/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const id = parseInt(req.params.id, 10);
      await db.delete(sharedFindings).where(and(eq(sharedFindings.id, id), or(eq(sharedFindings.fromUserId, userId), eq(sharedFindings.toUserId, userId))));
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete finding" });
    }
  });

  app.get("/api/activity", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const logs = await db.select().from(activityLogs).where(eq(activityLogs.userId, userId)).orderBy(desc(activityLogs.createdAt)).limit(50);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch activity" });
    }
  });

  app.get("/api/stripe/config", async (_req: Request, res: Response) => {
    try {
      const publishableKey = getStripePublishableKey();
      if (publishableKey) {
        res.json({ publishableKey });
      } else {
        res.status(503).json({ error: "Stripe not configured" });
      }
    } catch (error) {
      res.status(503).json({ error: "Stripe not configured" });
    }
  });

  app.post("/api/stripe/create-checkout", requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = getUncachableStripeClient();
      if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

      const { priceId, plan } = req.body;
      if (!priceId) return res.status(400).json({ error: "priceId required" });

      const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost:5000";
      const baseUrl = `https://${domain}`;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/?checkout=success&plan=${plan || "unknown"}`,
        cancel_url: `${baseUrl}/?checkout=cancelled`,
        metadata: {
          userId: req.session.userId!.toString(),
          plan: plan || "unknown",
        },
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Checkout error:", error.message);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
