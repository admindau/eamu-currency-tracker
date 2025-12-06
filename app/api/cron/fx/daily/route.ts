import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TODO: ingest from your private SSP source (UPLOAD or URL mode)

  return NextResponse.json(
    {
      status: "ok",
      message: "FX daily cron stub reached. Ingestion logic not yet implemented.",
    },
    { status: 200 }
  );
}
