// app/api/v1/rates/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const VERSION_HEADERS = { "X-FX-API-Version": "v1" };

export async function GET(req: NextRequest) {
  const supabase = supabaseServer;
  const url = new URL(req.url);

  const baseCurrency = url.searchParams.get("base") ?? "SSP";
  const quoteCurrency =
    (url.searchParams.get("quote") ?? "USD").toUpperCase();

  const daysParam = url.searchParams.get("days");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  let fromDate = fromParam ?? null;
  let toDate = toParam ?? null;

  if (daysParam && !fromDate && !toDate) {
    const days = parseInt(daysParam, 10);
    if (!Number.isFinite(days) || days <= 0) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_PARAMETER",
            message: "days must be a positive integer.",
          },
        },
        { status: 400, headers: VERSION_HEADERS }
      );
    }
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - days + 1);
    fromDate = from.toISOString().slice(0, 10);
    toDate = today.toISOString().slice(0, 10);
  }

  if (!fromDate || !toDate) {
    return NextResponse.json(
      {
        error: {
          code: "MISSING_PARAMETER",
          message:
            "Provide either days or both from/to (YYYY-MM-DD).",
        },
      },
      { status: 400, headers: VERSION_HEADERS }
    );
  }

  const { data, error } = await supabase
    .from("fx_daily_rates")
    .select("as_of_date, rate_mid")
    .eq("base_currency", baseCurrency)
    .eq("quote_currency", quoteCurrency)
    .gte("as_of_date", fromDate)
    .lte("as_of_date", toDate)
    .order("as_of_date", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: error.message } },
      { status: 500, headers: VERSION_HEADERS }
    );
  }

  const points =
    data?.map((row) => ({
      date: row.as_of_date,
      mid: Number(row.rate_mid),
    })) ?? [];

  return NextResponse.json(
    {
      pair: `${baseCurrency}/${quoteCurrency}`,
      base: baseCurrency,
      quote: quoteCurrency,
      points,
      meta: { from: fromDate, to: toDate, count: points.length },
    },
    { status: 200, headers: VERSION_HEADERS }
  );
}
