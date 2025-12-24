// app/api/admin/engine-commentary/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

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

/**
 * AI commentary is strictly based on supplied "engine signals".
 * No external assumptions, no causal claims, no geopolitics.
 */
function buildPrompt(d: CommentaryRequest) {
  const lines: string[] = [];

  lines.push("Write a short, institutional commentary based ONLY on the signals below.");
  lines.push("Do not introduce external causes, speculation, or real-world events.");
  lines.push("Use cautious language: 'suggests', 'consistent with', 'indicates'.");
  lines.push("Output exactly 2–3 sentences. No bullets. No emojis. No headings.");
  lines.push("");
  lines.push(`PAIR: ${d.pairLabel}`);
  lines.push(`DATE: ${d.date}`);
  lines.push(`MODE: ${d.modeLabel}`);
  lines.push(`MID: ${d.mid.toLocaleString()}`);

  if (d.delta !== null && d.delta !== undefined) {
    lines.push(`Δ DAY: ${d.delta}`);
  }
  if (d.pctDelta !== null && d.pctDelta !== undefined) {
    lines.push(`%Δ DAY: ${d.pctDelta}%`);
  }

  if (d.volPct !== null && d.volPct !== undefined) {
    lines.push(`VOLATILITY(7d): ${d.volPct}%`);
  }
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

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const body = (await req.json().catch(() => null)) as any;

    const payload: CommentaryRequest = {
      pairLabel: cleanStr(body?.pairLabel) ?? "—",
      date: cleanStr(body?.date) ?? "—",
      mid: Number(body?.mid),

      modeLabel:
        body?.modeLabel === "Official" ||
        body?.modeLabel === "Effective" ||
        body?.modeLabel === "Both"
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
        body?.manualLabel === "Manual override" ||
        body?.manualLabel === "Manual fixing" ||
        body?.manualLabel === "None"
          ? body.manualLabel
          : "None",
    };

    if (!Number.isFinite(payload.mid)) {
      return NextResponse.json({ error: "Invalid mid" }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });

    // Using the Responses API (recommended for new projects). :contentReference[oaicite:3]{index=3}
    const r = await openai.responses.create({
      model,
      input: buildPrompt(payload),
      // keep output short + consistent
      max_output_tokens: 120,
    });

    const text =
      (r.output_text ?? "").trim() ||
      "No commentary generated for this point.";

    return NextResponse.json({
      text,
      model,
    });
  } catch (e: any) {
    console.error("engine-commentary crashed:", e);
    return NextResponse.json(
      { error: "Server crashed" },
      { status: 500 }
    );
  }
}
