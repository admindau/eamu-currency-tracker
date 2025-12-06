// app/api/v1/rates/[quote]/latest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const VERSION_HEADERS = { "X-FX-API-Version": "v1" };

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ quote: string }> }
) {
  const supabase = supabaseServer;
  const url = new URL(req.url);
  const baseCurrency = url.searchParams.get("base") ?? "SSP";

  // Next 16: params is a Promise
  const { quote } = await context.params;
  const quoteCurrency = quote.toUpperCase();

  const { data: latestRow, error } = await supabase
    .from("fx_daily_rates")
    .select(
      "as_of_date, base_currency, quote_currency, rate_mid, is_official, is_manual_override, source_id"
    )
    .eq("base_currency", baseCurrency)
    .eq("quote_currency", quoteCurrency)
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: error.message } },
      { status: 500, headers: VERSION_HEADERS }
    );
  }

  if (!latestRow) {
    return NextResponse.json(
      {
        error: {
          code: "NO_DATA",
          message: `No FX data found for pair ${baseCurrency}/${quoteCurrency}.`,
        },
      },
      { status: 404, headers: VERSION_HEADERS }
    );
  }

  const { data: prevRow } = await supabase
    .from("fx_daily_rates")
    .select("rate_mid, as_of_date")
    .eq("base_currency", baseCurrency)
    .eq("quote_currency", quoteCurrency)
    .lt("as_of_date", latestRow.as_of_date)
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestMid = Number(latestRow.rate_mid);
  const prevMid = prevRow ? Number(prevRow.rate_mid) : null;

  let changePct: number | null = null;
  if (prevMid && prevMid !== 0) {
    changePct = ((latestMid - prevMid) / prevMid) * 100;
  }

  return NextResponse.json(
    {
      pair: `${baseCurrency}/${quoteCurrency}`,
      base: baseCurrency,
      quote: quoteCurrency,
      as_of_date: latestRow.as_of_date,
      mid_rate: latestMid,
      change_pct_vs_previous: changePct,
      is_official: latestRow.is_official,
      is_manual_override: latestRow.is_manual_override,
      source_id: latestRow.source_id,
    },
    { status: 200, headers: VERSION_HEADERS }
  );
}
