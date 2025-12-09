import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type ManualFixingPayload = {
  id?: string;
  as_of_date: string;
  base_currency: string;
  quote_currency: string;
  rate_mid: number;
  is_official: boolean;
  is_manual_override: boolean;
  notes?: string | null;
};

const SELECT_COLUMNS = `
  id,
  as_of_date,
  base_currency,
  quote_currency,
  rate_mid,
  is_official,
  is_manual_override,
  notes,
  created_email,
  created_at
`;

// GET /api/admin/manual-fixings
// Optional query params:
//   limit=50 (default)
//   base=SSP
//   quote=USD
export async function GET(req: NextRequest) {
  const supabase = supabaseServer;
  const url = new URL(req.url);
  const search = url.searchParams;

  const limit = Number(search.get("limit") ?? "50") || 50;
  const base = search.get("base");
  const quote = search.get("quote");

  let query = supabase.from("manual_fixings").select(SELECT_COLUMNS).order("as_of_date", {
    ascending: false,
  });

  if (base) query = query.eq("base_currency", base);
  if (quote) query = query.eq("quote_currency", quote);

  const { data, error } = await query.limit(limit);

  if (error) {
    console.error("GET manual_fixings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch manual fixings." },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}

// POST /api/admin/manual-fixings
// Body: ManualFixingPayload (without id)
export async function POST(req: NextRequest) {
  const supabase = supabaseServer;

  let body: ManualFixingPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    !body.as_of_date ||
    !body.base_currency ||
    !body.quote_currency ||
    !Number.isFinite(body.rate_mid)
  ) {
    return NextResponse.json(
      { error: "Missing or invalid required fields." },
      { status: 400 }
    );
  }

  const insertPayload: any = {
    as_of_date: body.as_of_date,
    base_currency: body.base_currency,
    quote_currency: body.quote_currency,
    rate_mid: body.rate_mid,
    is_official: body.is_official ?? true,
    is_manual_override: body.is_manual_override ?? false,
    notes: body.notes ?? null,
  };

  const { data, error } = await supabase
    .from("manual_fixings")
    .insert([insertPayload])
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    console.error("POST manual_fixings error:", error);
    return NextResponse.json(
      { error: "Failed to create manual fixing." },
      { status: 500 }
    );
  }

  return NextResponse.json({ data }, { status: 201 });
}

// PUT /api/admin/manual-fixings
// Body: ManualFixingPayload including id
export async function PUT(req: NextRequest) {
  const supabase = supabaseServer;

  let body: ManualFixingPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "Missing id for update." }, { status: 400 });
  }

  const updatePayload: any = {
    as_of_date: body.as_of_date,
    base_currency: body.base_currency,
    quote_currency: body.quote_currency,
    rate_mid: body.rate_mid,
    is_official: body.is_official,
    is_manual_override: body.is_manual_override,
    notes: body.notes ?? null,
  };

  const { data, error } = await supabase
    .from("manual_fixings")
    .update(updatePayload)
    .eq("id", body.id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    console.error("PUT manual_fixings error:", error);
    return NextResponse.json(
      { error: "Failed to update manual fixing." },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}

// DELETE /api/admin/manual-fixings?id=...
export async function DELETE(req: NextRequest) {
  const supabase = supabaseServer;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id for delete." }, { status: 400 });
  }

  const { error } = await supabase
    .from("manual_fixings")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("DELETE manual_fixings error:", error);
    return NextResponse.json(
      { error: "Failed to delete manual fixing." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
