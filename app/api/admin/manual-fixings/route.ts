// app/api/admin/manual-fixings/route.ts

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type Action = "create" | "update" | "delete";

type ManualFixingPayload = {
  id?: string | null;

  as_of_date: string; // "YYYY-MM-DD"
  base_currency: string; // e.g. "SSP"
  quote_currency: string; // e.g. "USD"

  rate_mid: number;

  is_official?: boolean;
  is_manual_override?: boolean;

  notes?: string | null;

  action?: Action;
};

function normalizePayload(raw: ManualFixingPayload): {
  payload: ManualFixingPayload;
  error?: string;
} {
  if (!raw.as_of_date) return { payload: raw, error: "Missing as_of_date" };
  if (!raw.base_currency || !raw.quote_currency) {
    return { payload: raw, error: "Missing base_currency or quote_currency" };
  }
  if (typeof raw.rate_mid !== "number" || Number.isNaN(raw.rate_mid)) {
    return { payload: raw, error: "Invalid rate_mid" };
  }

  const payload: ManualFixingPayload = {
    ...raw,
    as_of_date: raw.as_of_date,
    base_currency: raw.base_currency.toUpperCase(),
    quote_currency: raw.quote_currency.toUpperCase(),
    rate_mid: Number(raw.rate_mid),
    is_official: raw.is_official ?? true,
    is_manual_override: raw.is_manual_override ?? false,
    notes: raw.notes ?? null,
  };

  return { payload };
}

export async function POST(req: NextRequest) {
  const supabase = supabaseServer;

  try {
    const body = (await req.json()) as ManualFixingPayload;

    const action: Action =
      body.action ??
      (body.id ? "update" : "create"); // default: create if no ID, update if ID

    const { payload, error: validationError } = normalizePayload(body);
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 },
      );
    }

    // Ensure we have an authenticated user (admin mode)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("manual-fixings auth error:", authError);
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }

    if (action === "delete") {
      if (!payload.id) {
        return NextResponse.json(
          { error: "Missing id for delete" },
          { status: 400 },
        );
      }

      const { error: deleteError } = await supabase
        .from("manual_fixings")
        .delete()
        .eq("id", payload.id);

      if (deleteError) {
        console.error("manual-fixings delete error:", deleteError);
        return NextResponse.json(
          { error: "Failed to delete manual fixing" },
          { status: 500 },
        );
      }

      return NextResponse.json({ ok: true, action: "delete" });
    }

    if (action === "create") {
      const { data, error: insertError } = await supabase
        .from("manual_fixings")
        .insert({
          as_of_date: payload.as_of_date,
          base_currency: payload.base_currency,
          quote_currency: payload.quote_currency,
          rate_mid: payload.rate_mid,
          is_official: payload.is_official,
          is_manual_override: payload.is_manual_override,
          notes: payload.notes,
          created_by: user.id,
          created_email: user.email ?? null,
        })
        .select("*")
        .single();

      if (insertError) {
        console.error("manual-fixings insert error:", insertError);
        return NextResponse.json(
          { error: "Failed to create manual fixing" },
          { status: 500 },
        );
      }

      return NextResponse.json({ ok: true, action: "create", row: data });
    }

    // UPDATE
    if (!payload.id) {
      return NextResponse.json(
        { error: "Missing id for update" },
        { status: 400 },
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("manual_fixings")
      .update({
        as_of_date: payload.as_of_date,
        base_currency: payload.base_currency,
        quote_currency: payload.quote_currency,
        rate_mid: payload.rate_mid,
        is_official: payload.is_official,
        is_manual_override: payload.is_manual_override,
        notes: payload.notes,
      })
      .eq("id", payload.id)
      .select("*")
      .single();

    if (updateError) {
      console.error("manual-fixings update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update manual fixing" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, action: "update", row: updated });
  } catch (err) {
    console.error("manual-fixings POST crashed:", err);
    return NextResponse.json(
      { error: "Server crashed while handling manual-fixings" },
      { status: 500 },
    );
  }
}
