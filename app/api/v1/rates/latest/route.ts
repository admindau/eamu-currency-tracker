// app/api/v1/rates/latest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const VERSION_HEADERS = { "X-FX-API-Version": "v1" };

export async function GET(req: NextRequest) {
  const supabase = supabaseServer;
  const url = new URL(req.url);
  const baseCurrency = url.searchParams.get("base") ?? "SSP";

  // 1) Find latest as_of_date in fx_daily_rates for this base
  const { data: latestDateRow, error: latestDateError } = await supabase
    .from("fx_daily_rates")
    .select("as_of_date")
    .eq("base_currency", baseCurrency)
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestDateError) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: latestDateError.message } },
      { status: 500, headers: VERSION_HEADERS }
    );
  }

  let asOfDate = latestDateRow?.as_of_date as string | null;

  let liveRates: any[] = [];
  if (asOfDate) {
    const { data, error } = await supabase
      .from("fx_daily_rates")
      .select(
        "as_of_date, base_currency, quote_currency, rate_mid, is_official, is_manual_override, source_id"
      )
      .eq("base_currency", baseCurrency)
      .eq("as_of_date", asOfDate)
      .order("quote_currency", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: error.message } },
        { status: 500, headers: VERSION_HEADERS }
      );
    }

    liveRates = data ?? [];
  }

  // 2) Fallback to fx_daily_rates_default if we have no liveRates
  if (!asOfDate || liveRates.length === 0) {
    const { data: defaultDateRow, error: defaultDateError } = await supabase
      .from("fx_daily_rates_default")
      .select("as_of_date")
      .eq("base_currency", baseCurrency)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (defaultDateError) {
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: defaultDateError.message } },
        { status: 500, headers: VERSION_HEADERS }
      );
    }

    asOfDate = defaultDateRow?.as_of_date as string | null;

    if (!asOfDate) {
      return NextResponse.json(
        {
          error: {
            code: "NO_DATA",
            message: `No FX data found for base currency ${baseCurrency}.`,
          },
        },
        { status: 404, headers: VERSION_HEADERS }
      );
    }

    const { data, error } = await supabase
      .from("fx_daily_rates_default")
      .select(
        "as_of_date, base_currency, quote_currency, rate_mid, is_official, is_manual_override, source_code, source_label"
      )
      .eq("base_currency", baseCurrency)
      .eq("as_of_date", asOfDate)
      .order("quote_currency", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: error.message } },
        { status: 500, headers: VERSION_HEADERS }
      );
    }

    const rates: Record<string, number> = {};
    for (const row of data ?? []) {
      rates[row.quote_currency] = Number(row.rate_mid);
    }

    return NextResponse.json(
      {
        base: baseCurrency,
        as_of_date: asOfDate,
        source: "fx_daily_rates_default",
        rates,
      },
      { status: 200, headers: VERSION_HEADERS }
    );
  }

  // If we’re here, we have live fx_daily_rates
  const rates: Record<string, number> = {};
  for (const row of liveRates) {
    rates[row.quote_currency] = Number(row.rate_mid);
  }

  return NextResponse.json(
    {
      base: baseCurrency,
      as_of_date: asOfDate,
      source: "fx_daily_rates",
      rates,
    },
    { status: 200, headers: VERSION_HEADERS }
  );
}
