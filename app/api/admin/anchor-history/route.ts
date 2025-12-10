import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const WINDOW_OPTIONS = ["90d", "365d", "all"] as const;
type WindowKey = (typeof WINDOW_OPTIONS)[number];

const WINDOW_TO_DAYS: Record<Exclude<WindowKey, "all">, number> = {
  "90d": 90,
  "365d": 365,
};

const DEFAULT_PAIR = "SSPUSD";

export async function GET(req: NextRequest) {
  try {
    // supabaseServer is already a client
    const supabase = supabaseServer;

    const { searchParams } = new URL(req.url);
    const rawWindow = (searchParams.get("window") ?? "365d") as string;
    const rawPair = (searchParams.get("pair") ?? DEFAULT_PAIR) as string;

    const windowParam: WindowKey = (["90d", "365d", "all"] as WindowKey[]).includes(
      rawWindow as WindowKey,
    )
      ? (rawWindow as WindowKey)
      : "365d";

    // Expect something like SSPUSD, SSPKES, etc.
    const safePair =
      /^[A-Z]{6}$/.test(rawPair) && rawPair.startsWith("SSP")
        ? rawPair
        : DEFAULT_PAIR;

    const baseCurrency = safePair.slice(0, 3); // "SSP"
    const quoteCurrency = safePair.slice(3);   // "USD", "KES", etc.

    // =====================================================
    // 1) FULL ENGINE HISTORY (NO LIMIT, NO DATE FILTER)
    // =====================================================
    const { data: engineRows, error: engineError } = await supabase
      .from("fx_daily_rates_default")
      .select("as_of_date, base_currency, quote_currency, rate_mid")
      .eq("base_currency", baseCurrency)
      .eq("quote_currency", quoteCurrency)
      .order("as_of_date", { ascending: true });

    if (engineError) {
      console.error("anchor-history: engine query error", engineError);
      return NextResponse.json(
        { error: "Failed to load anchor history" },
        { status: 500 },
      );
    }

    let history =
      engineRows?.map((row) => ({
        date: String(row.as_of_date),
        mid: Number((row as any).rate_mid ?? 0),
      })) ?? [];

    // Apply the 90d / 365d filter IN MEMORY only
    if (windowParam !== "all" && history.length) {
      const daysBack = WINDOW_TO_DAYS[windowParam];
      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - daysBack);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      history = history.filter((p) => p.date >= cutoffStr);
    }

    // Defensive sort, oldest → newest
    history.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // =====================================================
    // 2) MANUAL OVERRIDES (ALSO FULL RANGE, THEN WINDOWED)
    // =====================================================
    const { data: manualRows, error: manualError } = await supabase
      .from("manual_fixings")
      .select("fixing_date, base_currency, quote_currency, rate_mid")
      .eq("base_currency", baseCurrency)
      .eq("quote_currency", quoteCurrency)
      .order("fixing_date", { ascending: true });

    if (manualError) {
      console.error("anchor-history: manual query error", manualError);
      return NextResponse.json(
        { error: "Failed to load overrides" },
        { status: 500 },
      );
    }

    let overrides =
      manualRows?.map((row) => ({
        date: String((row as any).fixing_date),
        mid: Number((row as any).rate_mid ?? 0),
      })) ?? [];

    if (windowParam !== "all" && overrides.length) {
      const daysBack = WINDOW_TO_DAYS[windowParam];
      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - daysBack);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      overrides = overrides.filter((p) => p.date >= cutoffStr);
    }

    overrides.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    return NextResponse.json({
      pair: safePair,
      window: windowParam,
      history,
      overrides,
    });
  } catch (err) {
    console.error("Anchor history route crashed:", err);
    return NextResponse.json({ error: "Server crashed" }, { status: 500 });
  }
}
