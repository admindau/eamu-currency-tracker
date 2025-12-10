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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const rawWindow = (url.searchParams.get("window") ?? "365d").toLowerCase();
    const windowParam: WindowKey = WINDOW_OPTIONS.includes(
      rawWindow as WindowKey
    )
      ? (rawWindow as WindowKey)
      : "365d";

    const pairParamRaw = (url.searchParams.get("pair") ?? DEFAULT_PAIR).toUpperCase();
    const { base, quote } = parsePair(pairParamRaw);

    // In your project supabaseServer is already a client instance
    const supabase = supabaseServer;

    // 1) Get latest available date for this pair
    const { data: latestRow, error: latestErr } = await supabase
      .from("fx_daily_rates_default")
      .select("as_of_date")
      .eq("base_currency", base)
      .eq("quote_currency", quote)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestErr) {
      console.error("Error fetching latest anchor date:", latestErr);
      return NextResponse.json(
        { error: "Failed to fetch latest anchor date" },
        { status: 500 }
      );
    }

    if (!latestRow?.as_of_date) {
      return NextResponse.json(
        { error: "No anchor history available for this pair" },
        { status: 404 }
      );
    }

    const maxDateStr = latestRow.as_of_date as string;

    // 2) Figure out minDate depending on window
    let minDateStr: string;

    if (windowParam === "all") {
      // Get earliest date in table → true "All" history
      const { data: earliestRow, error: earliestErr } = await supabase
        .from("fx_daily_rates_default")
        .select("as_of_date")
        .eq("base_currency", base)
        .eq("quote_currency", quote)
        .order("as_of_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (earliestErr) {
        console.error("Error fetching earliest anchor date:", earliestErr);
        return NextResponse.json(
          { error: "Failed to fetch earliest anchor date" },
          { status: 500 }
        );
      }

      if (!earliestRow?.as_of_date) {
        // Should not happen if latestRow exists, but just in case
        minDateStr = maxDateStr;
      } else {
        minDateStr = earliestRow.as_of_date as string;
      }
    } else {
      const days = WINDOW_TO_DAYS[windowParam];
      const maxDate = new Date(maxDateStr + "T00:00:00Z");
      const minDate = new Date(maxDate);
      // We want N calendar days inclusive → subtract (N - 1)
      minDate.setUTCDate(minDate.getUTCDate() - (days - 1));
      minDateStr = minDate.toISOString().slice(0, 10);
    }

    // 3) Fetch daily history in that [minDate, maxDate] range
    const { data: historyRows, error: historyErr } = await supabase
      .from("fx_daily_rates_default")
      .select("as_of_date, rate_mid")
      .eq("base_currency", base)
      .eq("quote_currency", quote)
      .gte("as_of_date", minDateStr)
      .lte("as_of_date", maxDateStr)
      .order("as_of_date", { ascending: true });

    if (historyErr) {
      console.error("Error fetching anchor history:", historyErr);
      return NextResponse.json(
        { error: "Failed to fetch anchor history" },
        { status: 500 }
      );
    }

    // 4) Fetch manual overrides within the same range
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
        { status: 500 }
      );
    }

    const history = (historyRows ?? []).map((row) => ({
      date: row.as_of_date as string,
      mid: Number(row.rate_mid ?? 0),
    }));

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
