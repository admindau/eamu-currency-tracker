import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("currencies")
    .select("code")
    .limit(1);

  if (error) {
    return NextResponse.json(
      { status: "error", message: "Database check failed", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      status: "ok",
      db: !!data,
      message: "Savvy Rilla FX API is online",
    },
    { status: 200 }
  );
}
