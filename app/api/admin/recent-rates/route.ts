// app/api/admin/recent-rates/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = supabaseServer;

    const { data, error } = await supabase
      .from("fx_daily_rates")
      .select(
        "id, as_of_date, base_currency, quote_currency, rate_mid, is_official, is_manual_override, created_at"
      )
      .order("as_of_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Error loading recent FX rates:", error);
      return NextResponse.json(
        {
          error: "Failed to load recent FX rates",
          details: error.message,
        },
        { status: 500 }
      );
    }

    const mapped = (data ?? []).map((row: any) => ({
      id: row.id,
      asOfDate: row.as_of_date,
      baseCurrency: row.base_currency,
      quoteCurrency: row.quote_currency,
      rateMid: row.rate_mid,
      isOfficial: row.is_official,
      isManualOverride: row.is_manual_override,
      created_at: row.created_at,
    }));

    return NextResponse.json({ data: mapped }, { status: 200 });
  } catch (err: any) {
    console.error("Unexpected error loading recent FX rates:", err);
    return NextResponse.json(
      {
        error: "Unexpected error while loading recent FX rates",
        details: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}
