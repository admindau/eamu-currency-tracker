// app/api/v1/rates/recent/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const VERSION_HEADERS = { "X-FX-API-Version": "v1" };

export async function GET(req: NextRequest) {
  const supabase = supabaseServer;
  const url = new URL(req.url);

  const baseCurrency = url.searchParams.get("base") ?? "SSP";
  const quoteFilter = url.searchParams.get("quote");
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(
    Math.max(parseInt(limitParam ?? "20", 10) || 20, 1),
    100
  );

  let query = supabase
    .from("fx_daily_rates")
    .select(
      "id, as_of_date, base_currency, quote_currency, rate_mid, is_official, is_manual_override, source_id"
    )
    .eq("base_currency", baseCurrency)
    .order("as_of_date", { ascending: false })
    .order("quote_currency", { ascending: true })
    .limit(limit);

  if (quoteFilter) {
    query = query.eq("quote_currency", quoteFilter.toUpperCase());
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: error.message } },
      { status: 500, headers: VERSION_HEADERS }
    );
  }

  return NextResponse.json(
    { data: data ?? [], meta: { limit, base: baseCurrency } },
    { status: 200, headers: VERSION_HEADERS }
  );
}
