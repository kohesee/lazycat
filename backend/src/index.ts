import { serve } from "@hono/node-server";
import { Database } from "bun:sqlite";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { timingSafeEqual } from "node:crypto";
import { randomBytes } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { claimDomain, claimTypes } from "../../shared/src/eip712.js";
import { RULES } from "../../shared/src/rules.js";
import { z } from "zod";

const env = (key: string, fallback?: string) => {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === "") throw new Error(`Missing ${key}`);
  return value;
};
const PORT = Number(env("PORT", "8787"));
const DB_PATH = env("DB_PATH", "./data/kickbacks.db");
const CONTRACT_ADDRESS = env("CONTRACT_ADDRESS");
const CHAIN_ID = Number(env("CHAIN_ID", String(RULES.chainId)));
const DAILY_CAP = BigInt(env("DAILY_CAP_WEI", RULES.dailyCapWei.toString()));
const REWARD = BigInt(env("REWARD_PER_AD_WEI", RULES.rewardPerAdWei.toString()));
const MAX_ADS_DAY = Number(env("MAX_ADS_PER_DAY", String(RULES.maxAdsPerDay)));
const MAX_ADS_HOUR = Number(env("MAX_ADS_PER_HOUR", String(RULES.maxAdsPerHour)));
const SIGNER_KEY = env("VOUCHER_SIGNER_KEY") as `0x${string}`;
const ADMIN_TOKEN = env("ADMIN_TOKEN");
const account = privateKeyToAccount(SIGNER_KEY);

const path = await import("node:path");
const fs = await import("node:fs");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.exec(`
CREATE TABLE IF NOT EXISTS daily (
 wallet TEXT NOT NULL, day INTEGER NOT NULL, views INTEGER NOT NULL DEFAULT 0,
 earned TEXT NOT NULL DEFAULT '0', pending TEXT NOT NULL DEFAULT '0',
 claimed TEXT NOT NULL DEFAULT '0', last_view_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(wallet, day)
);
CREATE TABLE IF NOT EXISTS fraud_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT, reason TEXT NOT NULL, created_at INTEGER NOT NULL
);
`);

const walletSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid wallet");
const day = () => Math.floor(Date.now() / 86_400_000);
const logFraud = db.prepare("INSERT INTO fraud_log (wallet, reason, created_at) VALUES (?, ?, ?)");
const rowFor = db.prepare("SELECT * FROM daily WHERE wallet = ? AND day = ?");
const upsert = db.prepare(`
INSERT INTO daily(wallet, day) VALUES(?, ?)
ON CONFLICT(wallet, day) DO NOTHING
`);
const viewUpdate = db.prepare(`
UPDATE daily SET views = views + 1, earned = earned + ?, last_view_at = ?
WHERE wallet = ? AND day = ?
`);

const app = new Hono();
app.use("*", cors({ origin: env("ALLOWED_ORIGIN", "http://localhost:5173") }));
app.get("/health", (c) => c.json({ ok: true, chainId: CHAIN_ID }));
app.get("/status", (c) => {
  const parsed = walletSchema.safeParse(c.req.query("wallet"));
  if (!parsed.success) return c.json({ error: "invalid wallet" }, 400);
  upsert.run(parsed.data.toLowerCase(), day());
  const row = rowFor.get(parsed.data.toLowerCase(), day()) as Record<string, string | number>;
  return c.json({
    earnedToday: String(row.earned),
    pending: String(row.pending),
    claimed: String(row.claimed),
    views: row.views,
    cap: DAILY_CAP.toString(),
    maxAdsPerDay: MAX_ADS_DAY,
  });
});
app.post("/view", async (c) => {
  const parsed = walletSchema.safeParse((await c.req.json().catch(() => ({}))).wallet);
  if (!parsed.success) return c.json({ error: "invalid wallet" }, 400);
  const wallet = parsed.data.toLowerCase();
  const today = day();
  upsert.run(wallet, today);
  const row = rowFor.get(wallet, today) as Record<string, string | number>;
  const now = Date.now();
  if (now - Number(row.last_view_at) < RULES.cooldownSeconds * 1000) {
    logFraud.run(wallet, "view cooldown", now);
    return c.json({ error: "rate_limited", retryAfterSeconds: RULES.cooldownSeconds }, 429);
  }
  if (Number(row.views) >= MAX_ADS_DAY) {
    logFraud.run(wallet, "daily ad count cap", now);
    return c.json({ error: "ad_cap_reached" }, 429);
  }
  const hourStart = now - 3_600_000;
  const recent = db.prepare("SELECT COALESCE(SUM(views), 0) AS count FROM daily WHERE wallet = ? AND last_view_at >= ?").get(wallet, hourStart) as { count: number };
  if (recent.count >= MAX_ADS_HOUR) {
    logFraud.run(wallet, "hourly ad count cap", now);
    return c.json({ error: "hourly_cap_reached" }, 429);
  }
  const earned = BigInt(String(row.earned));
  if (earned + REWARD > DAILY_CAP) {
    logFraud.run(wallet, "daily value cap", now);
    return c.json({ error: "cap_reached" }, 429);
  }
  viewUpdate.run(REWARD.toString(), now, wallet, today);
  return c.json({ earnedToday: (earned + REWARD).toString(), cap: DAILY_CAP.toString() });
});
app.post("/claim", async (c) => {
  const parsed = walletSchema.safeParse((await c.req.json().catch(() => ({}))).wallet);
  if (!parsed.success) return c.json({ error: "invalid wallet" }, 400);
  const wallet = parsed.data.toLowerCase();
  const today = day();
  upsert.run(wallet, today);
  const row = rowFor.get(wallet, today) as Record<string, string | number>;
  const amount = BigInt(String(row.earned)) - BigInt(String(row.claimed)) - BigInt(String(row.pending));
  if (amount <= 0n) {
    logFraud.run(wallet, "duplicate or empty claim", Date.now());
    return c.json({ error: "nothing_to_claim" }, 409);
  }
  const nonce = BigInt(`0x${randomBytes(32).toString("hex")}`);
  const signature = await account.signTypedData({
    domain: claimDomain(CHAIN_ID, CONTRACT_ADDRESS as `0x${string}`),
    types: claimTypes,
    primaryType: "Claim",
    message: { wallet: wallet as `0x${string}`, amount, nonce, day: BigInt(today) },
  });
  db.prepare("UPDATE daily SET pending = pending + ? WHERE wallet = ? AND day = ?").run(amount.toString(), wallet, today);
  return c.json({ amount: amount.toString(), nonce: nonce.toString(), day: today, signature });
});
app.get("/admin/fraud-log", (c) => {
  const supplied = c.req.header("x-admin-token") ?? "";
  const safe = supplied.length === ADMIN_TOKEN.length &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(ADMIN_TOKEN));
  if (!safe) return c.json({ error: "unauthorized" }, 401);
  return c.json({ entries: db.prepare("SELECT * FROM fraud_log ORDER BY id DESC LIMIT 100").all() });
});

serve({ fetch: app.fetch, port: PORT });
console.log(`Kickbacks backend listening on http://localhost:${PORT}`);
