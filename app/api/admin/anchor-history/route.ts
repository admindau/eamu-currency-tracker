import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const WINDOW_OPTIONS = ["90d", "365d", "all"] as const;
type WindowKey = (typeof WINDOW_OPTIONS)[number];

const WINDOW_TO_DAYS: Record<Exclude<WindowKey, "all">, number> = {
  "90d": 90,
  "365d": 365,
};

// Anchor pair is SSP as base, USD as quote
const DEFAULT_PAIR = "SSPUSD";

export async function GET(req: NextRequest) {
  try {
    // supabaseServer is already a configured client (do NOT call it)
    const supabase = supabaseServer;

    // ============================
    // 1. Parse URL params
    // ============================
    const url = new URL(req.url);
    const searchParams = url.searchParams;

    const pairParamRaw = (searchParams.get("pair") || DEFAULT_PAIR).toUpperCase();
    const windowParamRaw = (searchParams.get("window") || "365d").toLowerCase();

    const windowParam: WindowKey = WINDOW_OPTIONS.includes(
      windowParamRaw as WindowKey,
    )
      ? (windowParamRaw as WindowKey)
      : "365d";

    const base_currency = pairParamRaw.slice(0, 3);
    const quote_currency = pairParamRaw.slice(3);

    // ============================
    // 2. Date window
    // ============================
    let sinceDate: string | null = null;

    if (windowParam !== "all") {
      const days = WINDOW_TO_DAYS[windowParam as Exclude<WindowKey, "all">];
      const since = new Date();
      since.setDate(since.getDate() - days);
      sinceDate = since.toISOString().slice(0, 10); // YYYY-MM-DD
    }

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
      `,
      )
      .eq("base_currency", base_currency)
      .eq("quote_currency", quote_currency)
      .order("as_of_date", { ascending: true });

    if (sinceDate) {
      ratesQuery = ratesQuery.gte("as_of_date", sinceDate);
    }

    const { data: engineRates, error: engineError } = await ratesQuery;

    if (engineError) {
      console.error("Engine fetch error:", engineError);
      return NextResponse.json(
        { error: "Failed to fetch engine history" },
        { status: 500 },
      );
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
      `,
      )
      .eq("base_currency", base_currency)
      .eq("quote_currency", quote_currency)
      .order("as_of_date", { ascending: true });

    if (sinceDate) {
      overrideQuery = overrideQuery.gte("as_of_date", sinceDate);
    }

    const { data: overrides, error: overrideError } = await overrideQuery;

    if (overrideError) {
      console.error("Override fetch error:", overrideError);
      return NextResponse.json(
        { error: "Failed to fetch overrides" },
        { status: 500 },
      );
    }

    // ============================
    // 5. Shape response for the chart
    // ============================
    const history = (engineRates ?? []).map((r) => ({
      date: r.as_of_date as string,
      mid: Number(r.rate_mid ?? 0),
    }));

    const overrideMarkers = (overrides ?? []).map((o) => ({
      date: o.as_of_date as string,
      mid: Number(o.rate_mid ?? 0),
    }));

    return NextResponse.json({
      pair: pairParamRaw,
      window: windowParam,
      history,
      overrides: overrideMarkers,
    });
  } catch (err) {
    console.error("Anchor history route crashed:", err);
    return NextResponse.json({ error: "Server crashed" }, { status: 500 });
  }
}
