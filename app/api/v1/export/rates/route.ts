// app/api/v1/export/rates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const VERSION = "v1";

export async function GET(req: NextRequest) {
  const supabase = supabaseServer;
  const url = new URL(req.url);

  const baseCurrency = url.searchParams.get("base") ?? "SSP";
  const quoteCurrency =
    url.searchParams.get("quote")?.toUpperCase() ?? null;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();

  if (!from || !to) {
    return NextResponse.json(
      {
        error: {
          code: "MISSING_PARAMETER",
          message: "from and to (YYYY-MM-DD) are required.",
        },
      },
      {
        status: 400,
        headers: { "X-FX-API-Version": VERSION },
      }
    );
  }

  let query = supabase
    .from("fx_daily_rates")
    .select(
      "as_of_date, base_currency, quote_currency, rate_mid, is_official, is_manual_override, source_id"
    )
    .eq("base_currency", baseCurrency)
    .gte("as_of_date", from)
    .lte("as_of_date", to)
    .order("as_of_date", { ascending: true })
    .order("quote_currency", { ascending: true });

  if (quoteCurrency) {
    query = query.eq("quote_currency", quoteCurrency);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: error.message } },
      {
        status: 500,
        headers: { "X-FX-API-Version": VERSION },
      }
    );
  }

  if (format === "json") {
    return NextResponse.json(
      { data: data ?? [], meta: { base: baseCurrency, from, to } },
      {
        status: 200,
        headers: { "X-FX-API-Version": VERSION },
      }
    );
  }

  const rows = data ?? [];
  const header = [
    "as_of_date",
    "base_currency",
    "quote_currency",
    "rate_mid",
    "is_official",
    "is_manual_override",
    "source_id",
  ];

  const csvLines = [
    header.join(","),
    ...rows.map((row) =>
      [
        row.as_of_date,
        row.base_currency,
        row.quote_currency,
        row.rate_mid,
        row.is_official,
        row.is_manual_override,
        row.source_id,
      ]
        .map((value) =>
          value === null || value === undefined ? "" : String(value)
        )
        .join(",")
    ),
  ];

  const csv = csvLines.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fx_rates_${baseCurrency}_${from}_to_${to}.csv"`,
      "X-FX-API-Version": VERSION,
    },
  });
}
