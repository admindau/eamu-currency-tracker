// app/api/admin/manual-fixings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Shape sent from ManualRateForm.tsx
type ManualFixingPayload = {
  asOfDate: string; // "YYYY-MM-DD"
  quoteCurrency: string; // e.g. "USD"
  rateMid: number; // mid rate as number
  isOfficial: boolean;
};

export async function POST(req: NextRequest) {
  try {
    // NOTE: supabaseServer is already a client instance, do NOT call it.
    const supabase = supabaseServer;

    const body = (await req.json()) as ManualFixingPayload | null;

    if (!body) {
      return NextResponse.json(
        { error: "Missing request body" },
        { status: 400 }
      );
    }

    const { asOfDate, quoteCurrency, rateMid, isOfficial } = body;

    if (!asOfDate || !quoteCurrency || !Number.isFinite(rateMid)) {
      return NextResponse.json(
        {
          error:
            "asOfDate, quoteCurrency and rateMid are required for a manual fixing.",
        },
        { status: 400 }
      );
    }

    // Get the current authenticated user so we can populate created_by
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Not authenticated or unable to resolve current user." },
        { status: 401 }
      );
    }

    // Insert into public.manual_fixings
    const { data, error } = await supabase
      .from("manual_fixings")
      .insert({
        as_of_date: asOfDate,
        base_currency: "SSP", // anchor base for EAMU FX
        quote_currency: quoteCurrency,
        rate_mid: rateMid,
        is_official: isOfficial,
        is_manual_override: true,
        notes: null,
        created_by: user.id,
        created_email: user.email ?? null,
      })
      .select("*")
      .single();

    if (error) {
      console.error("[manual-fixings] insert error:", error);
      return NextResponse.json(
        { error: error.message ?? "Failed to save manual fixing." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        manualFixing: data,
        message: "Manual fixing saved successfully.",
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[manual-fixings] unexpected error:", err);
    return NextResponse.json(
      {
        error: "Unexpected error while saving manual fixing.",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = supabaseServer;

    const url = new URL(req.url);
    const pair = url.searchParams.get("pair") || "USD/SSP";

    const [quoteCurrency, baseCurrency] = pair.includes("/")
      ? pair.split("/")
      : ["USD", "SSP"];

    const { data, error } = await supabase
      .from("manual_fixings")
      .select("*")
      .eq("base_currency", baseCurrency)
      .eq("quote_currency", quoteCurrency)
      .order("as_of_date", { ascending: false });

    if (error) {
      console.error("[manual-fixings] GET error:", error);
      return NextResponse.json(
        { error: error.message ?? "Failed to load manual fixings." },
        { status: 500 }
      );
    }

    return NextResponse.json({ manualFixings: data ?? [] }, { status: 200 });
  } catch (err: any) {
    console.error("[manual-fixings] GET unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected error while loading manual fixings." },
      { status: 500 }
    );
  }
}
