import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const WINDOW_OPTIONS = ["90d", "365d", "all"] as const;
type WindowKey = (typeof WINDOW_OPTIONS)[number];

const WINDOW_TO_DAYS: Record<Exclude<WindowKey, "all">, number> = {
  "90d": 90,
  "365d": 365,
};

// Anchor pair is SSP as base, USD as quote by default
const DEFAULT_PAIR = "SSPUSD";

export async function GET(req: NextRequest) {
  try {
    // NOTE: supabaseServer is already a client, do NOT call it
    const supabase = supabaseServer;

    const { searchParams } = new URL(req.url);
    const rawWindow = (searchParams.get("window") ?? "365d") as string;
    const rawPair = (searchParams.get("pair") ?? DEFAULT_PAIR) as string;

    // validate window
    const windowParam: WindowKey = WINDOW_OPTIONS.includes(
      rawWindow as WindowKey,
    )
      ? (rawWindow as WindowKey)
      : "365d";

    // expect pairs like SSPUSD, SSPKES, etc.
    const safePair =
      /^[A-Z]{6}$/.test(rawPair) && rawPair.startsWith("SSP")
        ? rawPair
        : DEFAULT_PAIR;

    const base_currency = safePair.slice(0, 3); // "SSP"
    const quote_currency = safePair.slice(3); // "USD", "KES", etc.

    // Compute sinceDate only for 90d / 365d.
    // For "all" we leave sinceDate = null → no lower bound filter.
    let sinceDate: string | null = null;
    if (windowParam !== "all") {
      const daysBack = WINDOW_TO_DAYS[windowParam];
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - daysBack);
      sinceDate = d.toISOString().slice(0, 10); // YYYY-MM-DD
    }

    // =====================================================
    // 1) Engine history from fx_daily_rates_default
    // =====================================================

    let ratesQuery = supabase
      .from("fx_daily_rates_default")
      .select(
        `
        as_of_date,
        base_currency,
        quote_currency,
        rate_mid
      `,
      )
      .eq("base_currency", base_currency)
      .eq("quote_currency", quote_currency)
      .order("as_of_date", { ascending: true });

    if (sinceDate) {
      ratesQuery = ratesQuery.gte("as_of_date", sinceDate);
    }

    const { data: engineRates, error: engineError } = await ratesQuery;

    if (engineError) {
      console.error("Anchor history: engine fetch error", engineError);
      return NextResponse.json(
        { error: "Failed to fetch engine history" },
        { status: 500 },
      );
    }

    const history =
      engineRates?.map((row) => ({
        date: String(row.as_of_date),
        mid: Number((row as any).rate_mid ?? 0),
      })) ?? [];

    // Defensive: make sure it’s always oldest → newest
    history.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // =====================================================
    // 2) Manual overrides from manual_fixings
    // =====================================================

    let overridesQuery = supabase
      .from("manual_fixings")
      .select(
        `
        fixing_date,
        base_currency,
        quote_currency,
        rate_mid
      `,
      )
      .eq("base_currency", base_currency)
      .eq("quote_currency", quote_currency)
      .order("fixing_date", { ascending: true });

    if (sinceDate) {
      overridesQuery = overridesQuery.gte("fixing_date", sinceDate);
    }

    const { data: overrideRows, error: overridesError } = await overridesQuery;

    if (overridesError) {
      console.error("Anchor history: overrides fetch error", overridesError);
      return NextResponse.json(
        { error: "Failed to fetch overrides" },
        { status: 500 },
      );
    }

    const overrideMarkers =
      overrideRows?.map((o) => ({
        date: String((o as any).fixing_date),
        mid: Number((o as any).rate_mid ?? 0),
      })) ?? [];

    // Final payload consumed by AdminAnalyticsCard
    return NextResponse.json({
      pair: safePair,
      window: windowParam,
      history,
      overrides: overrideMarkers,
    });
  } catch (err) {
    console.error("Anchor history route crashed:", err);
    return NextResponse.json({ error: "Server crashed" }, { status: 500 });
  }
}
