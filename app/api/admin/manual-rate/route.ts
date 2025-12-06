// app/api/admin/manual-rate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";

export async function POST(req: NextRequest) {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const asOfDate = body.asOfDate as string | undefined;
    const quoteCurrency = (body.quoteCurrency as string | undefined)?.toUpperCase();
    const rateMid = Number(body.rateMid);
    const isOfficial = Boolean(body.isOfficial ?? true);

    if (!asOfDate || !quoteCurrency || !rateMid || Number.isNaN(rateMid)) {
      return NextResponse.json(
        {
          error: "Missing or invalid fields",
          details: "asOfDate, quoteCurrency, and numeric rateMid are required",
        },
        { status: 400 }
      );
    }

    const baseCurrency = "SSP";

    const { data: sourceData, error: sourceError } = await supabaseServer
      .from("fx_sources")
      .select("id")
      .eq("code", "SAVVY_FEED")
      .single();

    if (sourceError || !sourceData) {
      return NextResponse.json(
        {
          error: "Could not find FX source 'SAVVY_FEED'. Ensure it exists in fx_sources.",
          details: sourceError?.message,
        },
        { status: 500 }
      );
    }

    const sourceId = sourceData.id;

    const { error: upsertError } = await supabaseServer
      .from("fx_daily_rates")
      .upsert(
        [
          {
            as_of_date: asOfDate,
            base_currency: baseCurrency,
            quote_currency: quoteCurrency,
            rate_mid: rateMid,
            source_id: sourceId,
            is_official: isOfficial,
            is_manual_override: true,
          },
        ],
        {
          onConflict:
            "as_of_date,base_currency,quote_currency,source_id,is_manual_override",
        }
      );

    if (upsertError) {
      return NextResponse.json(
        { error: "Failed to save FX rate", details: upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        status: "ok",
        message: "FX rate saved successfully",
        record: {
          asOfDate,
          baseCurrency,
          quoteCurrency,
          rateMid,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Unexpected error while saving FX rate",
        details: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}
