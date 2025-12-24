// app/api/admin/engine-commentary/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Ensure we run in Node runtime (best compatibility with SDK + Vercel)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CommentaryRequest = {
  pairLabel: string; // e.g. USD/SSP (display label)
  date: string; // YYYY-MM-DD
  mid: number;

  modeLabel: "Official" | "Effective" | "Both";

  delta?: number | null;
  pctDelta?: number | null;

  volPct?: number | null;
  volLabel?: string | null; // "Low (7d)" etc

  regimeLabel?: string | null;
  regimeReason?: string | null;

  confidenceLabel?: string | null; // High/Medium/Low
  confidenceReasons?: string[] | null;

  manualLabel?: "Manual override" | "Manual fixing" | "None";
};

function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function clampReasons(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function buildPrompt(d: CommentaryRequest) {
  const lines: string[] = [];

  lines.push("Write a short, institutional commentary based ONLY on the signals below.");
  lines.push("Do not introduce external causes, speculation, or real-world events.");
  lines.push("Do not mention politics, conflict, or stakeholders.");
  lines.push("Use cautious language: 'suggests', 'consistent with', 'indicates'.");
  lines.push("Output exactly 2–3 sentences. No bullets. No headings. No emojis.");
  lines.push("");

  lines.push(`PAIR: ${d.pairLabel}`);
  lines.push(`DATE: ${d.date}`);
  lines.push(`MODE: ${d.modeLabel}`);
  lines.push(`MID: ${Number(d.mid).toLocaleString()}`);

  if (d.delta !== null && d.delta !== undefined) lines.push(`Δ DAY: ${d.delta}`);
  if (d.pctDelta !== null && d.pctDelta !== undefined) lines.push(`%Δ DAY: ${d.pctDelta}%`);

  if (d.volPct !== null && d.volPct !== undefined) lines.push(`VOLATILITY(7d): ${d.volPct}%`);
  if (d.volLabel) lines.push(`VOL BUCKET: ${d.volLabel}`);

  if (d.regimeLabel) lines.push(`REGIME: ${d.regimeLabel}`);
  if (d.regimeReason) lines.push(`REGIME REASON: ${d.regimeReason}`);

  if (d.confidenceLabel) lines.push(`CONFIDENCE: ${d.confidenceLabel}`);
  if (d.confidenceReasons?.length) {
    lines.push(`CONFIDENCE REASONS: ${d.confidenceReasons.join(" | ")}`);
  }

  lines.push(`MANUAL: ${d.manualLabel ?? "None"}`);

  return lines.join("\n");
}

// Optional: handle preflight cleanly
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  try {
    const body = (await req.json().catch(() => null)) as any;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const payload: CommentaryRequest = {
      pairLabel: cleanStr(body?.pairLabel) ?? "—",
      date: cleanStr(body?.date) ?? "—",
      mid: Number(body?.mid),

      modeLabel:
        body?.modeLabel === "Official" || body?.modeLabel === "Effective" || body?.modeLabel === "Both"
          ? body.modeLabel
          : "Both",

      delta: toNum(body?.delta),
      pctDelta: toNum(body?.pctDelta),

      volPct: toNum(body?.volPct),
      volLabel: cleanStr(body?.volLabel),

      regimeLabel: cleanStr(body?.regimeLabel),
      regimeReason: cleanStr(body?.regimeReason),

      confidenceLabel: cleanStr(body?.confidenceLabel),
      confidenceReasons: clampReasons(body?.confidenceReasons),

      manualLabel:
        body?.manualLabel === "Manual override" || body?.manualLabel === "Manual fixing" || body?.manualLabel === "None"
          ? body.manualLabel
          : "None",
    };

    if (!Number.isFinite(payload.mid)) {
      return NextResponse.json({ error: "Invalid mid" }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });

    const r = await openai.responses.create({
      model,
      input: buildPrompt(payload),
      max_output_tokens: 140,
    });

    const text = (r.output_text ?? "").trim();
    return NextResponse.json({
      text: text.length ? text : "No commentary generated for this point.",
      model,
    });
  } catch (e: any) {
    // IMPORTANT: Return actionable error info (without leaking secrets)
    const status = Number(e?.status) || 500;

    const message =
      e?.message ||
      e?.error?.message ||
      e?.response?.data?.error?.message ||
      "Unknown error";

    // Some OpenAI SDK errors include additional fields
    const code = e?.code || e?.error?.code || null;
    const type = e?.type || e?.error?.type || null;

    console.error("engine-commentary error:", {
      status,
      message,
      code,
      type,
    });

    return NextResponse.json(
      {
        error: "OpenAI request failed",
        status,
        message,
        code,
        type,
      },
      { status }
    );
  }
}
