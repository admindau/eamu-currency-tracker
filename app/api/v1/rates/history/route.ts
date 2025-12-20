// app/api/v1/rates/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const VERSION_HEADERS = { "X-FX-API-Version": "v1" };

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function toYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function getPairMaxDate(base: string, quote: string): Promise<string | null> {
  const supabase = supabaseServer;

  const { data, error } = await supabase
    .from("fx_daily_rates_default")
    .select("as_of_date")
    .eq("base_currency", base)
    .eq("quote_currency", quote)
    .order("as_of_date", { ascending: false })
    .limit(1);

  if (error) throw error;
  if (!data || data.length === 0) return null;
  return String(data[0].as_of_date);
}

export async function GET(req: NextRequest) {
  const supabase = supabaseServer;
  const url = new URL(req.url);

  const baseCurrency = (url.searchParams.get("base") ?? "SSP").toUpperCase();
  const quoteCurrency = (url.searchParams.get("quote") ?? "USD").toUpperCase();

  const daysParam = url.searchParams.get("days");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  let fromDate = fromParam ?? null;
  let toDate = toParam ?? null;

  try {
    // If days is provided, anchor to DB max date (not "today")
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

      const maxDate = await getPairMaxDate(baseCurrency, quoteCurrency);
      if (!maxDate) {
        return NextResponse.json(
          {
            error: {
              code: "NO_DATA",
              message: `No history available for ${baseCurrency}/${quoteCurrency}.`,
            },
          },
          { status: 404, headers: VERSION_HEADERS }
        );
      }

      toDate = maxDate;
      const to = new Date(`${toDate}T00:00:00Z`);
      const from = addDays(to, -(days - 1));
      fromDate = toYmd(from);
    }

    if (!fromDate || !toDate) {
      return NextResponse.json(
        {
          error: {
            code: "MISSING_PARAMETER",
            message: "Provide either days or both from/to (YYYY-MM-DD).",
          },
        },
        { status: 400, headers: VERSION_HEADERS }
      );
    }

    if (!isYmd(fromDate) || !isYmd(toDate)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_PARAMETER",
            message: "from/to must be YYYY-MM-DD.",
          },
        },
        { status: 400, headers: VERSION_HEADERS }
      );
    }

    // Use default view for consistent source selection.
    const { data, error } = await supabase
      .from("fx_daily_rates_default")
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
      data?.map((row: any) => ({
        date: String(row.as_of_date),
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
  } catch (e: any) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: e?.message ?? "Unexpected error" } },
      { status: 500, headers: VERSION_HEADERS }
    );
  }
}
