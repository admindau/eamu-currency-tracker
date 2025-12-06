// app/api/v1/summary/insights/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  buildInsightsFromSummary,
  type MarketSummary,
} from "@/lib/fx/insights";

export const dynamic = "force-dynamic";

function getApiBaseUrl() {
  if (process.env.NEXT_PUBLIC_FX_API_ORIGIN) {
    return process.env.NEXT_PUBLIC_FX_API_ORIGIN;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const base = url.searchParams.get("base") ?? "SSP";
  const quote = url.searchParams.get("quote") ?? "USD";

  const apiBase = getApiBaseUrl();
  const summaryUrl = `${apiBase}/api/v1/summary/market?base=${encodeURIComponent(
    base
  )}&quote=${encodeURIComponent(quote)}`;

  try {
    const res = await fetch(summaryUrl, { cache: "no-store" });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        {
          error: {
            code: "SUMMARY_UPSTREAM_ERROR",
            message: `Upstream /summary/market call failed with ${res.status}`,
            details: text,
          },
        },
        { status: 502, headers: { "X-FX-API-Version": "v1" } }
      );
    }

    const summary = (await res.json()) as MarketSummary;
    const insights = buildInsightsFromSummary(summary);

    return NextResponse.json(
      {
        pair: `${summary.quote}/${summary.base}`,
        base: summary.base,
        quote: summary.quote,
        as_of_date: summary.as_of_date,
        insights,
        meta: {
          version: "v1",
          source: "/api/v1/summary/market",
        },
      },
      {
        status: 200,
        headers: {
          "X-FX-API-Version": "v1",
        },
      }
    );
  } catch (error: any) {
    console.error("[FX] /summary/insights error", error);
    return NextResponse.json(
      {
        error: {
          code: "SUMMARY_INSIGHTS_ERROR",
          message: "Failed to generate FX insights.",
        },
      },
      { status: 500, headers: { "X-FX-API-Version": "v1" } }
    );
  }
}
