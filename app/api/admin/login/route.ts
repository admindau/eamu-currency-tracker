// app/api/admin/login/route.ts
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/admin/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const password = body?.password as string | undefined;

    const secret = process.env.FX_ADMIN_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "FX_ADMIN_SECRET is not configured on the server" },
        { status: 500 }
      );
    }

    if (!password) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    if (password !== secret) {
      return NextResponse.json(
        { error: "Invalid admin password" },
        { status: 401 }
      );
    }

    const res = NextResponse.json({ ok: true });

    res.cookies.set(ADMIN_COOKIE_NAME, "ok", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/", // needed so APIs also see it
      maxAge: 60 * 60 * 8, // 8 hours
    });

    return res;
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Unexpected error during admin login",
        details: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}
