import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const WINDOW_OPTIONS = ["90d", "365d"] as const;
type WindowKey = (typeof WINDOW_OPTIONS)[number];

const WINDOW_TO_DAYS: Record<WindowKey, number> = {
  "90d": 90,
  "365d": 365,
};

export async function GET(req: NextRequest) {
  try {
    // supabaseServer is already a configured client
    const supabase = supabaseServer;

    // ============================
    // 1. Parse URL params
    // ============================
    const url = new URL(req.url);
    const searchParams = url.searchParams;

    // Default pair: SSP as base, USD as quote
    const pairParam = searchParams.get("pair") || "SSPUSD";

    const rawWindow = (searchParams.get("window") || "365d").toLowerCase();
    if (!WINDOW_OPTIONS.includes(rawWindow as WindowKey)) {
      return NextResponse.json({ error: "Invalid window value." }, { status: 400 });
    }
    const windowParam = rawWindow as WindowKey;

    const base_currency = pairParam.slice(0, 3);
    const quote_currency = pairParam.slice(3);

    // ============================
    // 2. Date window (no "all" – always a bounded window)
    // ============================
    const days = WINDOW_TO_DAYS[windowParam];
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceDate = since.toISOString().slice(0, 10); // YYYY-MM-DD

    // ============================
    // 3. Engine history from fx_daily_rates_default
    // ============================
    let ratesQuery = supabase
      .from("fx_daily_rates_default")
      .select(
        `
        as_of_date,
        base_currency,
        quote_currency,
        rate_mid,
        is_manual_override
      `
      )
      .eq("base_currency", base_currency)
      .eq("quote_currency", quote_currency)
      .gte("as_of_date", sinceDate)
      .order("as_of_date", { ascending: true });

    const { data: engineRates, error: engineError } = await ratesQuery;

    if (engineError) {
      console.error("Engine fetch error:", engineError);
      return NextResponse.json({ error: "Failed to fetch engine history" }, { status: 500 });
    }

    // ============================
    // 4. Manual overrides from manual_fixings
    // ============================
    let overrideQuery = supabase
      .from("manual_fixings")
      .select(
        `
        as_of_date,
        base_currency,
        quote_currency,
        rate_mid,
        created_at
      `
      )
      .eq("base_currency", base_currency)
      .eq("quote_currency", quote_currency)
      .gte("as_of_date", sinceDate)
      .order("as_of_date", { ascending: true });

    const { data: overrides, error: overrideError } = await overrideQuery;

    if (overrideError) {
      console.error("Override fetch error:", overrideError);
      return NextResponse.json({ error: "Failed to fetch overrides" }, { status: 500 });
    }

    // ============================
    // 5. Shape response for the chart
    // ============================
    const history = (engineRates ?? []).map((r) => ({
      date: r.as_of_date,
      mid: Number(r.rate_mid),
    }));

    const overrideMarkers = (overrides ?? []).map((o) => ({
      date: o.as_of_date,
      mid: Number(o.rate_mid),
    }));

    return NextResponse.json({
      pair: pairParam,
      window: windowParam,
      history,
      overrides: overrideMarkers,
    });
  } catch (err) {
    console.error("Anchor history route crashed:", err);
    return NextResponse.json({ error: "Server crashed" }, { status: 500 });
  }
}
