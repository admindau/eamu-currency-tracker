// app/api/v1/currencies/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const VERSION_HEADERS = { "X-FX-API-Version": "v1" };

export async function GET(req: NextRequest) {
  const supabase = supabaseServer;
  const url = new URL(req.url);

  const search = url.searchParams.get("search") ?? "";
  const activeParam = url.searchParams.get("active");
  const activeOnly = activeParam === null ? true : activeParam === "true";

  let query = supabase
    .from("currencies")
    .select("code, name, symbol, decimals, created_at", { count: "exact" });

  if (search) {
    query = query.or(
      `code.ilike.%${search}%,name.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query.order("code", {
    ascending: true,
  });

  if (error) {
    return NextResponse.json(
      {
        error: {
          code: "DB_ERROR",
          message: error.message,
        },
      },
      { status: 500, headers: VERSION_HEADERS }
    );
  }

  return NextResponse.json(
    {
      data,
      meta: { count: count ?? data?.length ?? 0, activeOnly },
    },
    { status: 200, headers: VERSION_HEADERS }
  );
}
