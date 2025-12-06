// app/api/admin/chart-data/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

type FxDailyRow = {
  as_of_date: string;
  rate_mid: number | string | null;
};

type FxChartPoint = {
  date: string;
  rateMid: number;
};

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: Request) {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const quote = (url.searchParams.get("quote") || "USD").toUpperCase();

    // Respect a limit param, but keep it sensible
    const rawLimit = Number(url.searchParams.get("limit") ?? "365");
    let limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 365;
    const HARD_MAX = 5000; // safety cap – way below anything you'll ever need
    if (limit > HARD_MAX) limit = HARD_MAX;

    const supabase = supabaseServer;
    const CHUNK_SIZE = 1000; // Supabase max rows per request

    let allRows: FxDailyRow[] = [];
    let offset = 0;

    while (true) {
      const { data, error } = await supabase
        .from("fx_daily_rates")
        .select("as_of_date, rate_mid")
        .eq("base_currency", "SSP")
        .eq("quote_currency", quote)
        .order("as_of_date", { ascending: true }) // oldest → newest
        .range(offset, offset + CHUNK_SIZE - 1);   // paginated

      if (error) {
        console.error("Error loading FX chart data:", error);
        return NextResponse.json(
          {
            error: "Failed to load FX chart data",
            details: error.message,
          },
          { status: 500 }
        );
      }

      const rows = (data ?? []) as FxDailyRow[];
      allRows = allRows.concat(rows);

      // If we got less than a full page, we're at the end.
      if (rows.length < CHUNK_SIZE) {
        break;
      }

      offset += CHUNK_SIZE;

      // If we already have more than we need, stop early.
      if (allRows.length >= limit) {
        break;
      }
    }

    // If caller asked for fewer points than total, keep the latest `limit`.
    if (allRows.length > limit) {
      allRows = allRows.slice(allRows.length - limit);
    }

    const points: FxChartPoint[] = allRows
      .map((row) => {
        const mid = toNumber(row.rate_mid);
        if (mid == null) return null;
        return {
          date: row.as_of_date,
          rateMid: mid,
        };
      })
      .filter((p): p is FxChartPoint => p !== null);

    return NextResponse.json(
      {
        currency: quote,
        base: "SSP",
        points,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Unexpected error loading FX chart data:", err);
    return NextResponse.json(
      {
        error: "Unexpected error while loading FX chart data",
        details: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}
