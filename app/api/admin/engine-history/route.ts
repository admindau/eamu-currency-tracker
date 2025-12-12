import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Canonical source for engine history.
 */
const ENGINE_HISTORY_SOURCE = "fx_daily_rates_default";

/**
 * Supported windows (calendar days).
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

/**
 * Canonical UI pair convention:
 *   Display always as XXX/SSP  (e.g., USD/SSP, KES/SSP)
 *   Query param pair always as XXXSSP (e.g., USDSSP, KESSSP)
 *
 * Storage convention:
 *   base_currency = SSP
 *   quote_currency = XXX
 *
 * Therefore: display USD/SSP => storage base=SSP quote=USD
 */
const DEFAULT_PAIR_CANONICAL = "USDSSP";

/**
 * Supabase admin client.
 */
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase env vars (URL or SERVICE_ROLE_KEY).");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

function toUtcDateTs(date: string) {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function tsToDate(ts: number) {
  return new Date(ts).toISOString().slice(0, 10);
}

function normalizePair(raw: string) {
  const clean = raw.replace(/[^A-Za-z]/g, "").toUpperCase();
  const a = clean.slice(0, 3);
  const b = clean.slice(3, 6);
  return { a, b, clean };
}

/**
 * Canonicalize any incoming pair so that:
 * - Returned pair is always XXXSSP
 * - Returned label is always XXX/SSP
 * - Returned storage mapping is always base=SSP, quote=XXX
 *
 * Examples:
 *  - "USDSSP" => canonical USDSSP, storage base=SSP quote=USD
 *  - "SSPUSD" => canonical USDSSP, storage base=SSP quote=USD
 */
function canonicalizeToQuoteOverSSP(rawPair: string) {
  const { a, b } = normalizePair(rawPair || "");
  // If one side is SSP, the other side is the quote currency
  if (a === "SSP" && b) {
    const quote = b;
    return {
      canonicalPair: `${quote}SSP`,
      label: `${quote}/SSP`,
      storagePair: { base: "SSP", quote },
    };
  }
  if (b === "SSP" && a) {
    const quote = a;
    return {
      canonicalPair: `${quote}SSP`,
      label: `${quote}/SSP`,
      storagePair: { base: "SSP", quote },
    };
  }

  // Fallback: if SSP is not present, we cannot guarantee meaning.
  // We will treat "a/b" as quote/base display and invert into storage.
  // (If your product will never support non-SSP denominators, you can remove this.)
  const quote = a || "USD";
  return {
    canonicalPair: `${quote}SSP`,
    label: `${quote}/SSP`,
    storagePair: { base: "SSP", quote },
  };
}

/**
 * GET /api/admin/engine-history
 * Query params:
 * - window: 15d | 30d | 90d | 365d | all
 * - pair: canonical XXXSSP preferred (e.g., USDSSP), but SSPUSD also accepted
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const rawWindow = (url.searchParams.get("window") ?? "90d").toLowerCase();
    const window: WindowKey = WINDOWS.includes(rawWindow as WindowKey)
      ? (rawWindow as WindowKey)
      : "90d";

    const incomingPair = (url.searchParams.get("pair") ?? DEFAULT_PAIR_CANONICAL).toUpperCase();
    const canon = canonicalizeToQuoteOverSSP(incomingPair);

    const canonicalPair = canon.canonicalPair; // e.g. USDSSP
    const label = canon.label; // e.g. USD/SSP
    const { base, quote } = canon.storagePair; // storage: base=SSP, quote=USD

    const supabase = getSupabaseAdmin();

    /**
     * Build selector pairs list from engine source.
     * Only expose canonical XXX/SSP.
     */
    const pairsRes = await supabase
      .from(ENGINE_HISTORY_SOURCE)
      .select("base_currency, quote_currency")
      .eq("base_currency", "SSP")
      .limit(5000);

    if (pairsRes.error) {
      return NextResponse.json({ error: pairsRes.error.message }, { status: 500 });
    }

    const pairSet = new Set<string>();
    for (const r of pairsRes.data ?? []) {
      const b = String(r.base_currency).toUpperCase(); // SSP
      const q = String(r.quote_currency).toUpperCase(); // USD, EUR, etc.
      if (!b || !q) continue;
      if (b !== "SSP") continue;

      // canonical display pair value: QUOTE+SSP
      pairSet.add(`${q}SSP`);
    }

    // Ensure current selection exists
    pairSet.add(canonicalPair);

    const pairs = Array.from(pairSet)
      .map((val) => {
        const { a, b } = normalizePair(val); // a=USD, b=SSP
        return {
          value: val,
          base: b,  // SSP
          quote: a, // USD
          label: `${a}/${b}`,
        };
      })
      .sort((x, y) => x.label.localeCompare(y.label));

    /**
     * Determine RAW max date for the storage pair.
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
        {
          error: "No engine history found for this pair.",
          pair: canonicalPair,
          label,
          storagePair: { base, quote },
          source: ENGINE_HISTORY_SOURCE,
        },
        { status: 404 }
      );
    }

    const rawMaxDate: string = latestRes.data[0].as_of_date;
    const rawMaxTs = toUtcDateTs(rawMaxDate);

    /**
     * Determine window minimum date (calendar-based).
     */
    let windowMinDate: string;

    if (window === "all") {
      const earliestRes = await supabase
        .from(ENGINE_HISTORY_SOURCE)
        .select("as_of_date")
        .eq("base_currency", base)
        .eq("quote_currency", quote)
        .order("as_of_date", { ascending: true })
        .limit(1);

      if (earliestRes.error || !earliestRes.data?.length) {
        windowMinDate = rawMaxDate;
      } else {
        windowMinDate = earliestRes.data[0].as_of_date;
      }
    } else {
      const days = WINDOW_TO_DAYS[window];
      const minTs = rawMaxTs - (days - 1) * DAY_MS;
      windowMinDate = tsToDate(minTs);
    }

    /**
     * Fetch history rows.
     *
     * CRITICAL FIX:
     * For window=all, PostgREST may return only the first page (often 1000 rows).
     * We explicitly request a large range to avoid truncation.
     */
    let historyQuery = supabase
      .from(ENGINE_HISTORY_SOURCE)
      .select("as_of_date, rate_mid")
      .eq("base_currency", base)
      .eq("quote_currency", quote)
      .gte("as_of_date", windowMinDate)
      .lte("as_of_date", rawMaxDate)
      .order("as_of_date", { ascending: true });

    if (window === "all") {
      // Your dataset is ~1.2k rows, so 5000 is safe and avoids the 1000-row default cap.
      historyQuery = historyQuery.range(0, 5000);
    }

    const historyRes = await historyQuery;

    if (historyRes.error) {
      return NextResponse.json({ error: historyRes.error.message }, { status: 500 });
    }

    const history = (historyRes.data ?? [])
      .filter(
        (r) =>
          r.as_of_date &&
          r.rate_mid !== null &&
          r.rate_mid !== undefined &&
          Number.isFinite(Number(r.rate_mid))
      )
      .map((r) => ({
        date: r.as_of_date as string,
        mid: Number(r.rate_mid),
      }));

    /**
     * FIX A (still applies):
     * min/max should reflect plotted dataset, not raw dataset.
     */
    const minDate = history.length ? history[0].date : windowMinDate;
    const maxDate = history.length ? history[history.length - 1].date : rawMaxDate;

    return NextResponse.json({
      source: ENGINE_HISTORY_SOURCE,
      window,

      pair: canonicalPair,
      label,

      storagePair: { base, quote },

      minDate,
      maxDate,

      rawMinDate: windowMinDate,
      rawMaxDate,

      pairs,
      history,
    });
  } catch (err: any) {
    console.error("engine-history route crashed:", err);
    return NextResponse.json(
      { error: err?.message || "Server crashed" },
      { status: 500 }
    );
  }
}
