import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Engine history source (locked)
 * This view/table is treated as the canonical FX engine output.
 */
const ENGINE_HISTORY_SOURCE = "fx_daily_rates_default";

/**
 * Supported windows (calendar days)
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
 * Default display pair (UI)
 * UI displays as QUOTE/BASE (e.g., USD/SSP).
 */
const DEFAULT_PAIR_DISPLAY = "USDSSP";

/**
 * Supabase admin client
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

/**
 * Helpers
 */
function toUtcDateTs(date: string) {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function tsToDate(ts: number) {
  return new Date(ts).toISOString().slice(0, 10);
}

/**
 * IMPORTANT: Pair semantics
 *
 * UI displays pair as QUOTE/BASE (e.g., USD/SSP).
 * Storage is BASE/QUOTE (e.g., base_currency=SSP, quote_currency=USD).
 *
 * Therefore:
 * - Display "USDSSP" must map to storage base="SSP", quote="USD".
 * - In general, if SSP is present, SSP is the storage base (denominator).
 */
function normalizePairDisplay(raw: string) {
  const clean = raw.replace(/[^A-Za-z]/g, "").toUpperCase();
  const left = clean.slice(0, 3) || "USD"; // display quote
  const right = clean.slice(3, 6) || "SSP"; // display base
  return { left, right, displayValue: `${left}${right}` };
}

function mapDisplayPairToStorage(displayValue: string) {
  const { left, right } = normalizePairDisplay(displayValue);

  // If display is USD/SSP => left=USD, right=SSP => storage base=SSP, quote=USD
  if (right === "SSP") {
    return { base: "SSP", quote: left, displayValue: `${left}${right}` };
  }

  // If display is SSP/USD (rare in UI, but handle) => right=USD, left=SSP
  // storage would still be base=SSP, quote=USD (consistent with model)
  if (left === "SSP") {
    return { base: "SSP", quote: right, displayValue: `${left}${right}` };
  }

  // Fallback for non-SSP pairs (future-proofing)
  return { base: right, quote: left, displayValue: `${left}${right}` };
}

function pairLabelForDisplay(displayValue: string) {
  const { left, right } = normalizePairDisplay(displayValue);
  // Display label shown in UI: QUOTE/BASE
  return `${left}/${right}`;
}

/**
 * GET /api/admin/engine-history
 * Query params:
 * - window: 15d | 30d | 90d | 365d | all
 * - pair: display pair e.g. "USDSSP", "KESSSP"
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const rawWindow = (url.searchParams.get("window") ?? "90d").toLowerCase();
    const window: WindowKey = WINDOWS.includes(rawWindow as WindowKey)
      ? (rawWindow as WindowKey)
      : "90d";

    const rawPair = (url.searchParams.get("pair") ?? DEFAULT_PAIR_DISPLAY).toUpperCase();
    const { base, quote, displayValue } = mapDisplayPairToStorage(rawPair);

    const supabase = getSupabaseAdmin();

    /**
     * Build selector pairs list from engine source.
     * We will emit *display pairs* (QUOTE/BASE), consistent with the UI.
     *
     * Storage rows: base_currency (BASE), quote_currency (QUOTE)
     * Display: QUOTE/BASE
     */
    const pairsRes = await supabase
      .from(ENGINE_HISTORY_SOURCE)
      .select("base_currency, quote_currency")
      .limit(5000);

    if (pairsRes.error) {
      return NextResponse.json({ error: pairsRes.error.message }, { status: 500 });
    }

    const pairSet = new Set<string>();
    for (const r of pairsRes.data ?? []) {
      const b = String(r.base_currency).toUpperCase();
      const q = String(r.quote_currency).toUpperCase();
      if (!b || !q) continue;

      // display value is QUOTE+BASE (e.g., USDSSP)
      const display = `${q}${b}`;
      pairSet.add(display);
    }

    // Ensure requested pair always exists in selector
    pairSet.add(displayValue);

    const pairs = Array.from(pairSet)
      .map((val) => {
        const { left, right } = normalizePairDisplay(val);
        return {
          value: val,
          // keep these fields for UI convenience
          base: right, // display base (denominator)
          quote: left, // display quote (numerator)
          label: `${left}/${right}`,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    /**
     * Determine RAW max date for the *storage pair* (base/quote)
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
          pair: displayValue,
          storagePair: { base, quote },
          source: ENGINE_HISTORY_SOURCE,
        },
        { status: 404 }
      );
    }

    const rawMaxDate: string = latestRes.data[0].as_of_date;
    const rawMaxTs = toUtcDateTs(rawMaxDate);

    /**
     * Determine window minimum date (calendar-based)
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
     * Fetch history rows for the window, for the *storage pair*
     */
    const historyRes = await supabase
      .from(ENGINE_HISTORY_SOURCE)
      .select("as_of_date, rate_mid")
      .eq("base_currency", base)
      .eq("quote_currency", quote)
      .gte("as_of_date", windowMinDate)
      .lte("as_of_date", rawMaxDate)
      .order("as_of_date", { ascending: true });

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
     * FIX A:
     * Return minDate/maxDate based on the SAME FILTERED dataset used for plotting
     */
    const minDate = history.length ? history[0].date : windowMinDate;
    const maxDate = history.length ? history[history.length - 1].date : rawMaxDate;

    return NextResponse.json({
      source: ENGINE_HISTORY_SOURCE,
      window,

      // UI/display pair value (QUOTE+BASE), e.g. USDSSP
      pair: displayValue,
      label: pairLabelForDisplay(displayValue),

      // storage mapping (BASE/QUOTE)
      storagePair: { base, quote },

      // plotted range (honest)
      minDate,
      maxDate,

      // diagnostics
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
