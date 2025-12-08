import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type WindowKey = "90d" | "365d" | "all";

const WINDOW_DEFAULT: WindowKey = "365d";

const WINDOW_TO_DAYS: Record<Exclude<WindowKey, "all">, number> = {
  "90d": 90,
  "365d": 365,
};

/**
 * /api/admin/anchor-history
 *
 * Source of truth for the Central Bank admin chart.
 * Reads from the `fx_daily_rates_default` view so we only ever show the
 * canonical, de-duplicated time-series that the engine itself relies on.
 *
 * Query params:
 *   - pair:  "USD/SSP" style string (preferred)
 *   - base:  optional fallback if `pair` not provided
 *   - quote: optional fallback if `pair` not provided
 *   - window: "90d" | "365d" | "all"
 */
export async function GET(req: NextRequest) {
  // NOTE: supabaseServer is already a Supabase client instance in this project
  const supabase = supabaseServer;

  const url = new URL(req.url);
  const searchParams = url.searchParams;

  const windowParamRaw = (searchParams.get("window") ?? WINDOW_DEFAULT).toLowerCase();

  // Normalise and clamp to allowed values
  const windowParam: WindowKey =
    windowParamRaw === "90d" || windowParamRaw === "365d" || windowParamRaw === "all"
      ? (windowParamRaw as WindowKey)
      : WINDOW_DEFAULT;

  const pairParam = searchParams.get("pair");

  let base = searchParams.get("base");
  let quote = searchParams.get("quote");

  if (pairParam && pairParam.includes("/")) {
    const [maybeBase, maybeQuote] = pairParam.split("/");
    base = base ?? maybeBase;
    quote = quote ?? maybeQuote;
  }

  if (!base || !quote) {
    return NextResponse.json(
      {
        error:
          "Missing or invalid pair. Provide either `pair=USD/SSP` or `base=USD&quote=SSP`.",
      },
      { status: 400 },
    );
  }

  const baseCurrency = base.toUpperCase();
  const quoteCurrency = quote.toUpperCase();

  // Resolve window → date lower bound (or null for "all")
  let sinceDate: string | null = null;

  if (windowParam !== "all") {
    // Here TS knows windowParam is "90d" | "365d" – we just assert it explicitly
    const key = windowParam as Exclude<WindowKey, "all">;
    const days = WINDOW_TO_DAYS[key];

    const now = new Date();
    now.setDate(now.getDate() - days);
    sinceDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  let query = supabase
    .from("fx_daily_rates_default")
    .select(
      "as_of_date, base_currency, quote_currency, rate_mid, is_manual_override, is_official, source_label",
    )
    .eq("base_currency", baseCurrency)
    .eq("quote_currency", quoteCurrency)
    .order("as_of_date", { ascending: true });

  if (sinceDate) {
    query = query.gte("as_of_date", sinceDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[anchor-history] Supabase error:", error);
    return NextResponse.json(
      { error: "Failed to load anchor history." },
      { status: 500 },
    );
  }

  const safeRows = (data ?? []).filter(
    (row) => row && row.as_of_date && row.rate_mid != null,
  );

  const history = safeRows.map((row) => ({
    date: row.as_of_date as string,
    mid: Number(row.rate_mid),
    isManualOverride: Boolean(row.is_manual_override),
    isOfficial: Boolean(row.is_official),
    sourceLabel: row.source_label as string | null,
  }));

  const overrideMarkers = history
    .filter((row) => row.isManualOverride)
    .map((row) => ({
      date: row.date,
      mid: row.mid,
    }));

  return NextResponse.json({
    pair: `${baseCurrency}/${quoteCurrency}`,
    baseCurrency,
    quoteCurrency,
    window: windowParam,
    history,
    overrideMarkers,
    _meta: {
      rows: history.length,
      overrides: overrideMarkers.length,
      source: "fx_daily_rates_default",
    },
  });
}
