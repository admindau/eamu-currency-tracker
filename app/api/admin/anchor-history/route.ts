// app/api/admin/anchor-history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const WINDOW_OPTIONS = ["90d", "365d", "all"] as const;
type WindowKey = (typeof WINDOW_OPTIONS)[number];

const WINDOW_TO_DAYS: Record<Exclude<WindowKey, "all">, number> = {
  "90d": 90,
  "365d": 365,
};

// Default anchor pair: SSP base, USD quote
const DEFAULT_PAIR = "SSPUSD";

function parsePair(pair: string) {
  const clean = pair.replace(/[^A-Za-z]/g, "").toUpperCase();
  if (clean.length < 6) {
    return { base: "SSP", quote: "USD" };
  }
  return {
    base: clean.slice(0, 3),
    quote: clean.slice(3, 6),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const toTs = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const rawWindow = (url.searchParams.get("window") ?? "365d").toLowerCase();
    const windowParam: WindowKey = WINDOW_OPTIONS.includes(
      rawWindow as WindowKey,
    )
      ? (rawWindow as WindowKey)
      : "365d";

    const pairParamRaw = (url.searchParams.get("pair") ?? DEFAULT_PAIR).toUpperCase();
    const { base, quote } = parsePair(pairParamRaw);

    // In this project supabaseServer is already a client instance
    const supabase = supabaseServer;

    // 1) Pull full history for this pair (no windowing yet)
    const { data: allRows, error: allErr } = await supabase
      .from("fx_daily_rates_default")
      .select("as_of_date, rate_mid")
      .eq("base_currency", base)
      .eq("quote_currency", quote)
      .order("as_of_date", { ascending: true });

    if (allErr) {
      console.error("Error fetching full anchor history:", allErr);
      return NextResponse.json(
        { error: "Failed to fetch anchor history" },
        { status: 500 },
      );
    }

    const rows =
      (allRows as { as_of_date: string; rate_mid: number | null }[]) ?? [];

    if (!rows.length) {
      return NextResponse.json(
        { error: "No anchor history available for this pair" },
        { status: 404 },
      );
    }

    const earliestDate = rows[0].as_of_date;
    const latestDate = rows[rows.length - 1].as_of_date;

    const latestTs = toTs(latestDate);

    // 2) Decide the effective min date based on the window
    let minTs: number;
    let minDateStr: string;

    if (windowParam === "all") {
      // True ALL: from very first date in the table
      minTs = toTs(earliestDate);
      minDateStr = earliestDate;
    } else {
      const days = WINDOW_TO_DAYS[windowParam];
      // N calendar days inclusive → subtract (N - 1)
      minTs = latestTs - (days - 1) * DAY_MS;
      const minDate = new Date(minTs);
      minDateStr = minDate.toISOString().slice(0, 10);
    }

    const maxDateStr = latestDate;

    // 3) Apply windowing in memory
    const history = rows
      .filter((row) => toTs(row.as_of_date) >= minTs)
      .map((row) => ({
        date: row.as_of_date,
        mid: Number(row.rate_mid ?? 0),
      }));

    // 4) Fetch manual overrides within the same date range
    const { data: overrideRows, error: overridesErr } = await supabase
      .from("manual_fixings")
      .select("as_of_date, rate_mid")
      .eq("base_currency", base)
      .eq("quote_currency", quote)
      .gte("as_of_date", minDateStr)
      .lte("as_of_date", maxDateStr)
      .order("as_of_date", { ascending: true });

    if (overridesErr) {
      console.error("Error fetching manual overrides:", overridesErr);
      return NextResponse.json(
        { error: "Failed to fetch overrides" },
        { status: 500 },
      );
    }

    const overrides = (overrideRows ?? []).map((row) => ({
      date: row.as_of_date as string,
      mid: Number(row.rate_mid ?? 0),
    }));

    return NextResponse.json({
      pair: pairParamRaw,
      window: windowParam,
      minDate: minDateStr,
      maxDate: maxDateStr,
      history,
      overrides,
    });
  } catch (err) {
    console.error("Anchor history route crashed:", err);
    return NextResponse.json({ error: "Server crashed" }, { status: 500 });
  }
}
