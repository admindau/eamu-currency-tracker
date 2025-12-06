// app/api/admin/check/route.ts
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";

export async function GET() {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
