import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const WINDOW_OPTIONS = ["90d", "365d", "all"] as const;
type WindowKey = (typeof WINDOW_OPTIONS)[number];

const WINDOW_TO_DAYS: Record<Exclude<WindowKey, "all">, number> = {
  "90d": 90,
  "365d": 365,
};

const DEFAULT_PAIR = "SSPUSD";

type FxDailyRow = {
  as_of_date: string;
  rate_mid: number | null;
};

type ManualFixingRow = {
  as_of_date: string;
  rate_mid: number | null;
};

type HistoryPoint = {
  date: string; // YYYY-MM-DD
  mid: number;
};

type OverridePoint = HistoryPoint;

function dateToString(d: Date): string {
  // Always UTC; we only care about the calendar date.
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = supabaseServer;
    const { searchParams } = new URL(req.url);

    // -----------------------------------------------------------------------
    // Pair handling
    // -----------------------------------------------------------------------
    const pairParamRaw = (searchParams.get("pair") ?? DEFAULT_PAIR).toUpperCase();
    const pairSanitised = pairParamRaw.replace(/[^A-Z]/g, "");
    const pair = pairSanitised.length === 6 ? pairSanitised : DEFAULT_PAIR;

    const baseCurrency = pair.slice(0, 3); // SSP
    const quoteCurrency = pair.slice(3);   // USD

    // -----------------------------------------------------------------------
    // Window handling
    // -----------------------------------------------------------------------
    const windowRaw = (searchParams.get("window") ?? "all") as WindowKey;
    const windowParam: WindowKey = WINDOW_OPTIONS.includes(windowRaw)
      ? windowRaw
      : "all";

    // -----------------------------------------------------------------------
    // Fetch FULL history from fx_daily_rates_default
    // (no LIMIT – we want the entire history; windowing happens in code)
    // -----------------------------------------------------------------------
    const { data: historyRows, error: historyError } = await supabase
      .from("fx_daily_rates_default")
      .select("as_of_date, rate_mid")
      .eq("base_currency", baseCurrency)
      .eq("quote_currency", quoteCurrency)
      .order("as_of_date", { ascending: true });

    if (historyError) {
      console.error("anchor-history: history query failed", historyError);
      return NextResponse.json(
        { error: "Failed to load anchor history" },
        { status: 500 },
      );
    }

    const historyBase: HistoryPoint[] =
      (historyRows as FxDailyRow[] | null)?.map((row) => ({
        date: row.as_of_date,
        mid: Number(row.rate_mid ?? 0),
      })) ?? [];

    if (historyBase.length === 0) {
      return NextResponse.json<{
        pair: string;
        window: WindowKey;
        history: HistoryPoint[];
        overrides: OverridePoint[];
      }>({
        pair,
        window: windowParam,
        history: [],
        overrides: [],
      });
    }

    // Ensure sorted oldest -> newest (query already does this, but keep it explicit)
    historyBase.sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );

    // -----------------------------------------------------------------------
    // Apply window on the server side, anchored to the latest fixing date
    // (the client will *also* window, but this keeps the payload tight if used
    //  elsewhere with 90d / 365d directly).
    // -----------------------------------------------------------------------
    let history = historyBase;
    if (windowParam !== "all") {
      const daysBack = WINDOW_TO_DAYS[windowParam];
      const latestDateStr = historyBase[historyBase.length - 1]!.date;
      const latest = new Date(`${latestDateStr}T00:00:00Z`);

      const cutoff = new Date(latest);
      cutoff.setUTCDate(cutoff.getUTCDate() - daysBack);

      const cutoffStr = dateToString(cutoff);
      history = historyBase.filter((p) => p.date >= cutoffStr);
    }

    // -----------------------------------------------------------------------
    // Fetch overrides from manual_fixings
    // -----------------------------------------------------------------------
    const { data: overrideRows, error: overrideError } = await supabase
      .from("manual_fixings")
      .select("as_of_date, rate_mid")
      .eq("base_currency", baseCurrency)
      .eq("quote_currency", quoteCurrency)
      .order("as_of_date", { ascending: true });

    if (overrideError) {
      console.error("anchor-history: overrides query failed", overrideError);
      // Do not fail the whole request – we can still show the baseline history
    }

    const overrides: OverridePoint[] =
      (overrideRows as ManualFixingRow[] | null)?.map((row) => ({
        date: row.as_of_date,
        mid: Number(row.rate_mid ?? 0),
      })) ?? [];

    return NextResponse.json({
      pair,
      window: windowParam,
      history,
      overrides,
    });
  } catch (err) {
    console.error("Anchor history route crashed:", err);
    return NextResponse.json({ error: "Server crashed" }, { status: 500 });
  }
}
