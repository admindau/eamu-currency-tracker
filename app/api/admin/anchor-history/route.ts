// app/api/admin/anchor-history/route.ts

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Small helper to work out the date window.
 * window = "90d" | "365d" | "all"
 */
function getWindowBounds(window: string) {
  const now = new Date();
  let from: string | null = null;

  if (window === "90d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 90);
    from = d.toISOString().slice(0, 10);
  } else if (window === "365d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 365);
    from = d.toISOString().slice(0, 10);
  } else {
    // "all" – no lower bound
    from = null;
  }

  return { from, today: now.toISOString().slice(0, 10) };
}

type FxDailyRateRow = {
  as_of_date: string;
  base_currency: string;
  quote_currency: string;
  mid_rate: number;
  is_manual_override?: boolean | null;
  source_label?: string | null;
};

/**
 * GET /api/admin/anchor-history?window=90d|365d|all
 *
 * Returns history for the anchor pair USD/SSP from the
 * fx_daily_rates_default view, shaped so the A-Mode chart
 * can consume it.
 */
export async function GET(req: NextRequest) {
  // NOTE: supabaseServer is already a SupabaseClient instance, not a function
  const supabase = supabaseServer;

  const searchParams = req.nextUrl.searchParams;
  const window = (searchParams.get("window") ?? "365d").toLowerCase();

  const { from, today } = getWindowBounds(window);

  // Base query against the read-only engine view
  let query = supabase
    .from("fx_daily_rates_default")
    .select(
      "as_of_date, base_currency, quote_currency, mid_rate, is_manual_override, source_label",
    )
    .eq("base_currency", "USD")
    .eq("quote_currency", "SSP")
    .order("as_of_date", { ascending: true });

  if (from) {
    query = query.gte("as_of_date", from);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[anchor-history] Supabase error:", error);
    return NextResponse.json(
      {
        error: error.message,
        history: [],
        summary: null,
        debug: {
          window,
          from,
          today,
          source: "fx_daily_rates_default",
        },
      },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as FxDailyRateRow[];

  // Shape to what AdminAnalyticsCard expects:
  // - history[] with `date` and `mid_rate`
  const history = rows.map((row) => ({
    date: row.as_of_date, // used as row.date ?? row.fixing_date ...
    mid_rate: row.mid_rate, // used as row.mid ?? row.mid_rate ...
    source_label: row.source_label ?? null,
    is_manual_override: row.is_manual_override ?? false,
  }));

  const summary = {
    window,
    from,
    today,
    count: history.length,
    base: "USD",
    quote: "SSP",
  };

  const debug = {
    window,
    from,
    today,
    source: "fx_daily_rates_default",
  };

  return NextResponse.json(
    {
      history,
      summary,
      debug,
    },
    { status: 200 },
  );
}
