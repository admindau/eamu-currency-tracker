// app/api/v1/summary/market/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const VERSION_HEADERS = { "X-FX-API-Version": "v1" };

type FxDailyRow = {
  as_of_date: string;
  rate_mid: number | string | null;
};

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const supabase = supabaseServer;
  const url = new URL(req.url);

  const baseCurrency = url.searchParams.get("base") ?? "SSP";
  const quoteCurrency = (url.searchParams.get("quote") ?? "USD").toUpperCase();

  // 1) Latest fixing
  const { data: latestRow, error: latestError } = await supabase
    .from("fx_daily_rates")
    .select("as_of_date, rate_mid")
    .eq("base_currency", baseCurrency)
    .eq("quote_currency", quoteCurrency)
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: latestError.message } },
      { status: 500, headers: VERSION_HEADERS }
    );
  }

  if (!latestRow) {
    return NextResponse.json(
      {
        error: {
          code: "NO_DATA",
          message: `No FX data for pair ${baseCurrency}/${quoteCurrency}.`,
        },
      },
      { status: 404, headers: VERSION_HEADERS }
    );
  }

  const asOfDate = latestRow.as_of_date;
  const latestMid = toNumber(latestRow.rate_mid);

  if (latestMid == null) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_DATA",
          message: "Latest FX record has no valid mid rate.",
        },
      },
      { status: 500, headers: VERSION_HEADERS }
    );
  }

  // 2) Change vs previous fixing
  const { data: prevRow } = await supabase
    .from("fx_daily_rates")
    .select("as_of_date, rate_mid")
    .eq("base_currency", baseCurrency)
    .eq("quote_currency", quoteCurrency)
    .lt("as_of_date", asOfDate)
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  let changePct: number | null = null;
  if (prevRow && prevRow.rate_mid != null) {
    const prevMid = toNumber(prevRow.rate_mid);
    if (prevMid && prevMid !== 0) {
      changePct = ((latestMid - prevMid) / prevMid) * 100;
    }
  }

  // 3) History window – last 30 days (for 7d range, 3d trend, 30d vol)
  const latestDateObj = new Date(asOfDate);
  const from30Date = new Date(latestDateObj);
  from30Date.setDate(from30Date.getDate() - 29); // inclusive window

  const from30Str = from30Date.toISOString().slice(0, 10);

  const { data: historyRows, error: historyError } = await supabase
    .from("fx_daily_rates")
    .select("as_of_date, rate_mid")
    .eq("base_currency", baseCurrency)
    .eq("quote_currency", quoteCurrency)
    .gte("as_of_date", from30Str)
    .lte("as_of_date", asOfDate)
    .order("as_of_date", { ascending: true });

  if (historyError) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: historyError.message } },
      { status: 500, headers: VERSION_HEADERS }
    );
  }

  const series: number[] = (historyRows ?? [])
    .map((row: FxDailyRow) => toNumber(row.rate_mid))
    .filter((n): n is number => n != null);

  // --- 7-day range ---
  const last7 = series.slice(-7);
  let rangeHigh = latestMid;
  let rangeLow = latestMid;

  if (last7.length > 0) {
    rangeHigh = Math.max(...last7);
    rangeLow = Math.min(...last7);
  }

  // --- 3-day trend ---
  const last3 = series.slice(-3);
  let trendLabel: "Range-Bound" | "Uptrend" | "Downtrend" = "Range-Bound";

  if (last3.length >= 2) {
    const start = last3[0];
    const end = last3[last3.length - 1];
    if (start !== 0) {
      const pctChange3d = ((end - start) / start) * 100;
      if (Math.abs(pctChange3d) < 0.1) {
        trendLabel = "Range-Bound";
      } else if (pctChange3d > 0) {
        trendLabel = "Uptrend";
      } else {
        trendLabel = "Downtrend";
      }
    }
  }

  // --- 30-day volatility: avg abs daily move % ---
  let volatilityAvgDailyMovePct: number | null = null;
  if (series.length >= 2) {
    let sum = 0;
    let count = 0;
    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1];
      const curr = series[i];
      if (prev !== 0) {
        const movePct = Math.abs((curr - prev) / prev) * 100;
        sum += movePct;
        count += 1;
      }
    }
    if (count > 0) {
      volatilityAvgDailyMovePct = sum / count;
    }
  }

  return NextResponse.json(
    {
      base: baseCurrency,
      quote: quoteCurrency,
      as_of_date: asOfDate,
      mid_rate: latestMid,
      change_pct_vs_previous: changePct,
      range: {
        window_days: 7,
        high: rangeHigh,
        low: rangeLow,
      },
      trend: {
        window_days: 3,
        label: trendLabel,
      },
      volatility: {
        window_days: 30,
        avg_daily_move_pct: volatilityAvgDailyMovePct,
      },
    },
    { status: 200, headers: VERSION_HEADERS }
  );
}
