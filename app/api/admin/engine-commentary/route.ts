// app/api/admin/engine-commentary/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 4.1: server cache + rate guard
 *
 * - In-memory cache (per server instance) with TTL
 * - IP-based rate limit (per server instance) with window
 *
 * Notes:
 * - Vercel/serverless instances can scale; each instance has its own memory.
 * - This still delivers major cost protection and smooth UX, but is not a global, cross-instance cache.
 * - If you later want global cache/rate-limits, we can move these maps to Redis/Upstash.
 */

type CommentaryRequest = {
  pairLabel: string;
  date: string; // YYYY-MM-DD
  mid: number;

  modeLabel: "Official" | "Effective" | "Both";

  delta?: number | null;
  pctDelta?: number | null;

  volPct?: number | null;
  volLabel?: string | null;

  regimeLabel?: string | null;
  regimeReason?: string | null;

  confidenceLabel?: string | null;
  confidenceReasons?: string[] | null;

  manualLabel?: "Manual override" | "Manual fixing" | "None";
};

type CacheEntry = {
  text: string;
  model: string;
  createdAt: number;
  expiresAt: number;
};

type RateEntry = {
  count: number;
  windowStart: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __eamu_engine_commentary_cache: Map<string, CacheEntry> | undefined;
  // eslint-disable-next-line no-var
  var __eamu_engine_commentary_rate: Map<string, RateEntry> | undefined;
}

function getCacheStore() {
  if (!globalThis.__eamu_engine_commentary_cache) {
    globalThis.__eamu_engine_commentary_cache = new Map<string, CacheEntry>();
  }
  return globalThis.__eamu_engine_commentary_cache;
}

function getRateStore() {
  if (!globalThis.__eamu_engine_commentary_rate) {
    globalThis.__eamu_engine_commentary_rate = new Map<string, RateEntry>();
  }
  return globalThis.__eamu_engine_commentary_rate;
}

function nowMs() {
  return Date.now();
}

function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function clampReasons(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 6);
}

/**
 * Build a stable cache key.
 * Avoids churn by rounding floats and excluding verbose arrays.
 */
function stableKeyFromPayload(p: CommentaryRequest) {
  const keyObj = {
    pair: p.pairLabel,
    date: p.date,
    mid: Math.round(p.mid * 1e6) / 1e6,
    mode: p.modeLabel,
    volLabel: p.volLabel ?? null,
    regimeLabel: p.regimeLabel ?? null,
    confidenceLabel: p.confidenceLabel ?? null,
    manual: p.manualLabel ?? "None",
    pctDelta:
      p.pctDelta === null || p.pctDelta === undefined
        ? null
        : Math.round(p.pctDelta * 100) / 100,
  };

  return JSON.stringify(keyObj);
}

function buildPrompt(d: CommentaryRequest) {
  const lines: string[] = [];

  lines.push("Write a short, institutional commentary based ONLY on the signals below.");
  lines.push("Do not introduce external causes, speculation, or real-world events.");
  lines.push("Do not mention politics, conflict, people, or stakeholders.");
  lines.push("Use cautious language: 'suggests', 'consistent with', 'indicates'.");
  lines.push("Output exactly 2–3 sentences. No bullets. No headings. No emojis.");
  lines.push("");

  lines.push(`PAIR: ${d.pairLabel}`);
  lines.push(`DATE: ${d.date}`);
  lines.push(`MODE: ${d.modeLabel}`);
  lines.push(`MID: ${Number(d.mid).toLocaleString()}`);

  if (d.delta !== null && d.delta !== undefined) lines.push(`Δ DAY: ${d.delta}`);
  if (d.pctDelta !== null && d.pctDelta !== undefined)
    lines.push(`%Δ DAY: ${d.pctDelta}%`);

  if (d.volPct !== null && d.volPct !== undefined)
    lines.push(`VOLATILITY(7d): ${d.volPct}%`);
  if (d.volLabel) lines.push(`VOL BUCKET: ${d.volLabel}`);

  if (d.regimeLabel) lines.push(`REGIME: ${d.regimeLabel}`);
  if (d.regimeReason) lines.push(`REGIME REASON: ${d.regimeReason}`);

  if (d.confidenceLabel) lines.push(`CONFIDENCE: ${d.confidenceLabel}`);
  if (d.confidenceReasons?.length) {
    lines.push(`CONFIDENCE REASONS: ${d.confidenceReasons.join(" | ")}`);
  }

  lines.push(`MANUAL: ${d.manualLabel ?? "None"}`);

  return lines.join("\n");
}

/**
 * Best-effort IP extraction for rate-limiting.
 */
function getClientIp(req: NextRequest) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return (req as any).ip || "unknown";
}

function rateLimitOrThrow(ip: string, opts: { limit: number; windowMs: number }) {
  const store = getRateStore();
  const t = nowMs();
  const entry = store.get(ip);

  if (!entry) {
    store.set(ip, { count: 1, windowStart: t });
    return { remaining: opts.limit - 1, resetMs: opts.windowMs };
  }

  const elapsed = t - entry.windowStart;
  if (elapsed > opts.windowMs) {
    store.set(ip, { count: 1, windowStart: t });
    return { remaining: opts.limit - 1, resetMs: opts.windowMs };
  }

  if (entry.count >= opts.limit) {
    const reset = opts.windowMs - elapsed;
    const e = new Error("Rate limit exceeded");
    (e as any).status = 429;
    (e as any).resetMs = reset;
    throw e;
  }

  entry.count += 1;
  store.set(ip, entry);
  return { remaining: opts.limit - entry.count, resetMs: opts.windowMs - elapsed };
}

function json(body: any, init: { status?: number; headers?: Record<string, string> } = {}) {
  const res = NextResponse.json(body, { status: init.status ?? 200 });
  if (init.headers) {
    for (const [k, v] of Object.entries(init.headers)) res.headers.set(k, v);
  }
  return res;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const ttlSeconds = Math.max(
    60,
    Number(process.env.ENGINE_COMMENTARY_CACHE_TTL_SECONDS || 86400)
  );

  const rlLimit = Math.max(5, Number(process.env.ENGINE_COMMENTARY_RL_LIMIT || 30));
  const rlWindowMs = Math.max(
    10_000,
    Number(process.env.ENGINE_COMMENTARY_RL_WINDOW_MS || 60_000)
  );

  const ip = getClientIp(req);
  let rlMeta: { remaining: number; resetMs: number } | null = null;

  try {
    rlMeta = rateLimitOrThrow(ip, { limit: rlLimit, windowMs: rlWindowMs });

    const body = await req.json();
    const payload: CommentaryRequest = {
      pairLabel: cleanStr(body?.pairLabel) ?? "—",
      date: cleanStr(body?.date) ?? "—",
      mid: Number(body?.mid),
      modeLabel:
        body?.modeLabel === "Official" ||
        body?.modeLabel === "Effective" ||
        body?.modeLabel === "Both"
          ? body.modeLabel
          : "Both",
      delta: toNum(body?.delta),
      pctDelta: toNum(body?.pctDelta),
      volPct: toNum(body?.volPct),
      volLabel: cleanStr(body?.volLabel),
      regimeLabel: cleanStr(body?.regimeLabel),
      regimeReason: cleanStr(body?.regimeReason),
      confidenceLabel: cleanStr(body?.confidenceLabel),
      confidenceReasons: clampReasons(body?.confidenceReasons),
      manualLabel:
        body?.manualLabel === "Manual override" ||
        body?.manualLabel === "Manual fixing" ||
        body?.manualLabel === "None"
          ? body.manualLabel
          : "None",
    };

    if (!Number.isFinite(payload.mid)) {
      return json({ error: "Invalid mid" }, { status: 400 });
    }

    const cacheKey = stableKeyFromPayload(payload);
    const cache = getCacheStore();
    const t = nowMs();

    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > t) {
      return json(
        { text: hit.text, model: hit.model, cached: true },
        {
          headers: {
            "x-cache": "HIT",
            "x-cache-ttl-s": String(Math.floor((hit.expiresAt - t) / 1000)),
          },
        }
      );
    }

    const openai = new OpenAI({ apiKey });
    const r = await openai.responses.create({
      model,
      input: buildPrompt(payload),
      max_output_tokens: 160,
    });

    const text = (r.output_text ?? "").trim() || "No commentary generated.";

    cache.set(cacheKey, {
      text,
      model,
      createdAt: t,
      expiresAt: t + ttlSeconds * 1000,
    });

    return json(
      { text, model, cached: false },
      { headers: { "x-cache": "MISS", "x-cache-ttl-s": String(ttlSeconds) } }
    );
  } catch (e: any) {
    if (e?.status === 429) {
      return json(
        { error: "Rate limit exceeded", resetMs: e.resetMs ?? null },
        { status: 429 }
      );
    }

    return json(
      {
        error: "OpenAI request failed",
        message: e?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
