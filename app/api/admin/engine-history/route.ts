import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Engine history source (locked)
 * This view is treated as the canonical FX engine output.
 */
const ENGINE_HISTORY_SOURCE = "fx_daily_rates_default";

/**
 * Supported windows
 */
const WINDOWS = ["15d", "30d", "90d", "365d", "all"] as const;
type WindowKey = (typeof WINDOWS)[number];

const WINDOW_TO_DAYS: Record<Exclude<WindowKey, "all">, number> = {
  "15d": 15,
  "30d": 30,
  "90d": 90,
  "365d": 365,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PAIR = "SSPUSD";

/**
 * Supabase admin client
 */
function getSupabaseAdmin() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase env vars (URL or SERVICE_ROLE_KEY)."
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

/**
 * Pair helpers
 */
function parsePair(raw: string) {
  const clean = raw.replace(/[^A-Za-z]/g, "").toUpperCase();
  const base = clean.slice(0, 3) || "SSP";
  const quote = clean.slice(3, 6) || "USD";
  return { base, quote, raw: `${base}${quote}` };
}

function pairLabel(base: string, quote: string) {
  return `${quote}/${base}`;
}

function toUtcDateTs(date: string) {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function tsToDate(ts: number) {
  return new Date(ts).toISOString().slice(0, 10);
}

/**
 * GET /api/admin/engine-history
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const rawWindow = (url.searchParams.get("window") ?? "90d").toLowerCase();
    const window: WindowKey =
      WINDOWS.includes(rawWindow as WindowKey)
        ? (rawWindow as WindowKey)
        : "90d";

    const rawPair = (url.searchParams.get("pair") ?? DEFAULT_PAIR).toUpperCase();
    const { base, quote, raw } = parsePair(rawPair);

    const supabase = getSupabaseAdmin();

    /**
     * Load available pairs for selector
     */
    const pairsRes = await supabase
      .from(ENGINE_HISTORY_SOURCE)
      .select("base_currency, quote_currency")
      .limit(3000);

    if (pairsRes.error) {
      return NextResponse.json(
        { error: pairsRes.error.message },
        { status: 500 }
      );
    }

    const pairMap = new Map<string, { base: string; quote: string }>();
    for (const r of pairsRes.data ?? []) {
      const b = String(r.base_currency).toUpperCase();
      const q = String(r.quote_currency).toUpperCase();
      pairMap.set(`${b}${q}`, { base: b, quote: q });
    }

    // Ensure requested pair always exists in selector
    pairMap.set(raw, { base, quote });

    const pairs = Array.from(pairMap.entries())
      .map(([value, p]) => ({
        value,
        base: p.base,
        quote: p.quote,
        label: pairLabel(p.base, p.quote),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    /**
     * Determine max date for this pair
     */
    const latestRes = await supabase
      .from(ENGINE_HISTORY_SOURCE)
      .select("as_of_date")
      .eq("base_currency", base)
      .eq("quote_currency", quote)
      .order("as_of_date", { ascending: false })
      .limit(1);

    if (latestRes.error || !latestRes.data?.length) {
      return NextResponse.json(
        { error: "No engine history found for this pair." },
        { status: 404 }
      );
    }

    const maxDate = latestRes.data[0].as_of_date;
    const maxTs = toUtcDateTs(maxDate);

    /**
     * Determine min date based on window
     */
    let minDate: string;

    if (window === "all") {
      const earliestRes = await supabase
        .from(ENGINE_HISTORY_SOURCE)
        .select("as_of_date")
        .eq("base_currency", base)
        .eq("quote_currency", quote)
        .order("as_of_date", { ascending: true })
        .limit(1);

      minDate = earliestRes.data?.[0]?.as_of_date ?? maxDate;
    } else {
      const days = WINDOW_TO_DAYS[window];
      const minTs = maxTs - (days - 1) * DAY_MS;
      minDate = tsToDate(minTs);
    }

    /**
     * Fetch history
     */
    const historyRes = await supabase
      .from(ENGINE_HISTORY_SOURCE)
      .select("as_of_date, rate_mid")
      .eq("base_currency", base)
      .eq("quote_currency", quote)
      .gte("as_of_date", minDate)
      .lte("as_of_date", maxDate)
      .order("as_of_date", { ascending: true });

    if (historyRes.error) {
      return NextResponse.json(
        { error: historyRes.error.message },
        { status: 500 }
      );
    }

    const history = (historyRes.data ?? [])
      .filter(
        (r) =>
          r.as_of_date &&
          r.rate_mid !== null &&
          Number.isFinite(Number(r.rate_mid))
      )
      .map((r) => ({
        date: r.as_of_date,
        mid: Number(r.rate_mid),
      }));

    return NextResponse.json({
      source: ENGINE_HISTORY_SOURCE,
      pair: raw,
      window,
      minDate,
      maxDate,
      pairs,
      history,
    });
  } catch (err: any) {
    console.error("engine-history route error:", err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
