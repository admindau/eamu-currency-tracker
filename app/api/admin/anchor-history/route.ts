import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type WindowKey = "90d" | "365d" | "all";

const WINDOW_DEFAULT: WindowKey = "365d";

const WINDOW_TO_DAYS: Record<Exclude<WindowKey, "all">, number> = {
  "90d": 90,
  "365d": 365,
};

export async function GET(req: NextRequest) {
  // IMPORTANT: supabaseServer is already a client, do NOT call it
  const supabase = supabaseServer;

  // Parse URL params
  const url = new URL(req.url);
  const searchParams = url.searchParams;

  const base = (searchParams.get("base") ?? "USD").toUpperCase();
  const quote = (searchParams.get("quote") ?? "SSP").toUpperCase();

  let windowParam = (searchParams.get("window") ?? WINDOW_DEFAULT) as WindowKey;

  if (!["90d", "365d", "all"].includes(windowParam)) {
    windowParam = WINDOW_DEFAULT;
  }

  console.log(">> API WINDOW:", windowParam);

  // Compute date filter ONLY for 90d / 365d
  let sinceDate: string | null = null;

  if (windowParam !== "all") {
    const key = windowParam as Exclude<WindowKey, "all">;
    const days = WINDOW_TO_DAYS[key];

    const now = new Date();
    now.setDate(now.getDate() - days);
    sinceDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  // Query FULL history from raw table fx_daily_rates
  const query = supabase
    .from("fx_daily_rates")
    .select(
      `
        as_of_date,
        rate_mid,
        base_currency,
        quote_currency
      `
    )
    .eq("base_currency", base)
    .eq("quote_currency", quote)
    .order("as_of_date", { ascending: true });

  if (sinceDate) {
    query.gte("as_of_date", sinceDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error("ANCHOR HISTORY ERROR:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transform into chart-ready array of { x, y }
  const series = (data ?? []).map((row) => ({
    x: row.as_of_date,
    y: Number(row.rate_mid),
  }));

  const response = {
    base,
    quote,
    window: windowParam,
    count: series.length,
    series,
  };

  return NextResponse.json(response);
}
