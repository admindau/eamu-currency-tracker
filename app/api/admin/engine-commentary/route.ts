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
  kind?: "point_summary" | "official_vs_manual";

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

  // Only used for kind="official_vs_manual"
  officialMid?: number | null;
  manualMid?: number | null;
  absDiff?: number | null;
  pctDiff?: number | null;
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

function getCache(): Map<string, CacheEntry> {
  if (!global.__eamu_engine_commentary_cache) {
    global.__eamu_engine_commentary_cache = new Map();
  }
  return global.__eamu_engine_commentary_cache;
}

function getRateMap(): Map<string, RateEntry> {
  if (!global.__eamu_engine_commentary_rate) {
    global.__eamu_engine_commentary_rate = new Map();
  }
  return global.__eamu_engine_commentary_rate;
}

function json(body: any, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

function cleanStr(v: any): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function toNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampReasons(v: any): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
  return out.length ? out : null;
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return "unknown";
}

function stableKeyFromPayload(p: CommentaryRequest) {
  const kind = p.kind ?? "point_summary";

  const keyObj = {
    kind,
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

    // comparison fields (only meaningful when kind="official_vs_manual")
    officialMid:
      p.officialMid === null || p.officialMid === undefined
        ? null
        : Math.round(p.officialMid * 1e6) / 1e6,
    manualMid:
      p.manualMid === null || p.manualMid === undefined
        ? null
        : Math.round(p.manualMid * 1e6) / 1e6,
    pctDiff:
      p.pctDiff === null || p.pctDiff === undefined
        ? null
        : Math.round(p.pctDiff * 100) / 100,
  };

  return JSON.stringify(keyObj);
}

function buildPrompt(d: CommentaryRequest) {
  const kind = d.kind ?? "point_summary";
  const lines: string[] = [];

  lines.push(
    "Write a short, institutional commentary based ONLY on the signals below."
  );
  lines.push("Do not introduce external causes, speculation, or real-world events.");
  lines.push("Do not mention politics, conflict, people, or stakeholders.");
  lines.push("Use cautious language: 'suggests', 'consistent with', 'indicates'.");
  lines.push("Output exactly 2–3 sentences. No bullets. No headings. No emojis.");

  if (kind === "official_vs_manual") {
    lines.push("Focus on comparing Official vs Manual for the same date and pair.");
    lines.push(
      "State the deviation (absolute and percent) and interpret it using regime, volatility, and confidence signals."
    );
    lines.push("If inputs are missing, fall back to neutral wording.");
  }

  lines.push("");

  lines.push(`PAIR: ${d.pairLabel}`);
  lines.push(`DATE: ${d.date}`);
  lines.push(`MODE: ${d.modeLabel}`);
  lines.push(`MID: ${Number(d.mid).toLocaleString()}`);

  if (kind === "official_vs_manual") {
    if (d.officialMid !== null && d.officialMid !== undefined)
      lines.push(`OFFICIAL MID: ${Number(d.officialMid).toLocaleString()}`);
    if (d.manualMid !== null && d.manualMid !== undefined)
      lines.push(`MANUAL MID: ${Number(d.manualMid).toLocaleString()}`);

    if (d.absDiff !== null && d.absDiff !== undefined)
      lines.push(`MANUAL − OFFICIAL: ${d.absDiff}`);

    if (d.pctDiff !== null && d.pctDiff !== undefined)
      lines.push(`PCT DEVIATION: ${d.pctDiff}%`);
  }

  if (d.delta !== null && d.delta !== undefined) lines.push(`Δ DAY: ${d.delta}`);
  if (d.pctDelta !== null && d.pctDelta !== undefined)
    lines.push(`% Δ DAY: ${d.pctDelta}%`);

  if (d.volPct !== null && d.volPct !== undefined) lines.push(`VOL (7D): ${d.volPct}%`);
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

  try {
    const body = await req.json();

    const payload: CommentaryRequest = {
      kind:
        body?.kind === "official_vs_manual" || body?.kind === "point_summary"
          ? body.kind
          : "point_summary",

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

      officialMid: toNum(body?.officialMid),
      manualMid: toNum(body?.manualMid),
      absDiff: toNum(body?.absDiff),
      pctDiff: toNum(body?.pctDiff),
    };

    if (!Number.isFinite(payload.mid)) {
      return json({ error: "Invalid mid" }, { status: 400 });
    }

    const kind = payload.kind ?? "point_summary";

    if (kind === "official_vs_manual") {
      const om = payload.officialMid;
      const mm = payload.manualMid;
      if (!Number.isFinite(Number(om)) || !Number.isFinite(Number(mm))) {
        // Fall back gracefully rather than erroring the UI
        payload.kind = "point_summary";
        payload.officialMid = null;
        payload.manualMid = null;
        payload.absDiff = null;
        payload.pctDiff = null;
      } else {
        // Compute deterministically server-side (trust-but-verify)
        const abs = Number(mm) - Number(om);
        const pct = Number(om) !== 0 ? (Number(mm) / Number(om) - 1) * 100 : null;
        payload.absDiff = Number.isFinite(abs) ? abs : null;
        payload.pctDiff = pct !== null && Number.isFinite(pct) ? pct : null;
      }
    }

    // Rate limit
    const ip = getClientIp(req);
    const rate = getRateMap();
    const now = Date.now();
    const entry = rate.get(ip);

    if (!entry || now - entry.windowStart >= rlWindowMs) {
      rate.set(ip, { count: 1, windowStart: now });
    } else {
      entry.count += 1;
      if (entry.count > rlLimit) {
        const resetMs = entry.windowStart + rlWindowMs - now;
        return json(
          { error: "Rate limit exceeded", resetMs },
          { status: 429, headers: { "retry-after": String(Math.ceil(resetMs / 1000)) } }
        );
      }
      rate.set(ip, entry);
    }

    // Cache
    const cache = getCache();
    const cacheKey = stableKeyFromPayload(payload);
    const t = Date.now();

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

    const text = String((r as any)?.output_text ?? "").trim();

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
