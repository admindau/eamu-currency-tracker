// app/api/admin/anchor-history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const WINDOW_OPTIONS = ["90d", "365d", "all"] as const;
type WindowKey = (typeof WINDOW_OPTIONS)[number];

const WINDOW_TO_DAYS: Record<Exclude<WindowKey, "all">, number> = {
  "90d": 90,
  "365d": 365,
};

// Default anchor pair: SSP base, USD quote
const DEFAULT_PAIR = "SSPUSD";

function parsePair(pair: string) {
  const clean = pair.replace(/[^A-Za-z]/g, "").toUpperCase();
  if (clean.length < 6) return { base: "SSP", quote: "USD" };
  return { base: clean.slice(0, 3), quote: clean.slice(3, 6) };
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Safe “YYYY-MM-DD” → UTC timestamp
function toUtcTs(d: string) {
  return new Date(`${d}T00:00:00Z`).getTime();
}

// UTC timestamp → YYYY-MM-DD
function tsToDate(ts: number) {
  return new Date(ts).toISOString().slice(0, 10);
}

type HistoryPoint = { date: string; mid: number };

type ManualFixingPoint = {
  id: string;
  date: string;
  mid: number;
  isOfficial: boolean;
  isManualOverride: boolean;
  notes: string | null;
  createdAt: string;
  createdEmail: string | null;
};

async function getPairMinMax(params: { base: string; quote: string }) {
  const supabase = supabaseServer;

  const { data: maxRows, error: maxErr } = await supabase
    .from("fx_daily_rates_default")
    .select("as_of_date")
    .eq("base_currency", params.base)
    .eq("quote_currency", params.quote)
    .order("as_of_date", { ascending: false })
    .limit(1);

  if (maxErr) throw maxErr;
  if (!maxRows || maxRows.length === 0) return null;

  const { data: minRows, error: minErr } = await supabase
    .from("fx_daily_rates_default")
    .select("as_of_date")
    .eq("base_currency", params.base)
    .eq("quote_currency", params.quote)
    .order("as_of_date", { ascending: true })
    .limit(1);

  if (minErr) throw minErr;
  if (!minRows || minRows.length === 0) return null;

  return {
    minDate: String(minRows[0].as_of_date),
    maxDate: String(maxRows[0].as_of_date),
  };
}

/**
 * PostgREST default page size behavior is a common source of truncation.
 * We paginate explicitly with range() for "all" windows.
 */
async function fetchHistoryAll(params: { base: string; quote: string }) {
  const supabase = supabaseServer;
  const pageSize = 1000;

  const out: { as_of_date: string; rate_mid: number | null }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("fx_daily_rates_default")
      .select("as_of_date, rate_mid")
      .eq("base_currency", params.base)
      .eq("quote_currency", params.quote)
      .order("as_of_date", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as { as_of_date: string; rate_mid: number | null }[];
    out.push(...batch);

    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return out;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const rawWindow = (url.searchParams.get("window") ?? "365d").toLowerCase();
    const windowParam: WindowKey = WINDOW_OPTIONS.includes(rawWindow as WindowKey)
      ? (rawWindow as WindowKey)
      : "365d";

    const pairParamRaw = (url.searchParams.get("pair") ?? DEFAULT_PAIR).toUpperCase();
    const { base, quote } = parsePair(pairParamRaw);

    const bounds = await getPairMinMax({ base, quote });
    if (!bounds) {
      return NextResponse.json({ error: "No anchor history available for this pair" }, { status: 404 });
    }

    const earliestDate = bounds.minDate;
    const latestDate = bounds.maxDate;
    const latestTs = toUtcTs(latestDate);

    // Decide the effective min date (calendar window inclusive)
    let minTs: number;
    let minDateStr: string;

    if (windowParam === "all") {
      minTs = toUtcTs(earliestDate);
      minDateStr = earliestDate;
    } else {
      const days = WINDOW_TO_DAYS[windowParam];
      minTs = latestTs - (days - 1) * DAY_MS;
      minDateStr = tsToDate(minTs);
    }

    const maxDateStr = latestDate;

    const supabase = supabaseServer;

    // Fetch history for the requested window
    let rows: { as_of_date: string; rate_mid: number | null }[] = [];

    if (windowParam === "all") {
      // MUST paginate or it will truncate around 1000 rows (~May 2025 from Aug 2022)
      rows = await fetchHistoryAll({ base, quote });
    } else {
      const { data, error } = await supabase
        .from("fx_daily_rates_default")
        .select("as_of_date, rate_mid")
        .eq("base_currency", base)
        .eq("quote_currency", quote)
        .gte("as_of_date", minDateStr)
        .lte("as_of_date", maxDateStr)
        .order("as_of_date", { ascending: true });

      if (error) {
        console.error("Error fetching anchor history window:", error);
        return NextResponse.json({ error: "Failed to fetch anchor history" }, { status: 500 });
      }
      rows = (data ?? []) as { as_of_date: string; rate_mid: number | null }[];
    }

    const history: HistoryPoint[] = rows
      .filter((row) => toUtcTs(row.as_of_date) >= minTs)
      .filter((row) => row.rate_mid !== null && Number.isFinite(Number(row.rate_mid)))
      .map((row) => ({
        date: row.as_of_date,
        mid: Number(row.rate_mid),
      }));

    // Manual fixings (includes manual overrides) within the same date range
    // Manual fixings table is typically small, but we still query by range.
    const { data: manualRows, error: manualErr } = await supabase
      .from("manual_fixings")
      .select("id, as_of_date, rate_mid, is_official, is_manual_override, notes, created_at, created_email")
      .eq("base_currency", base)
      .eq("quote_currency", quote)
      .gte("as_of_date", minDateStr)
      .lte("as_of_date", maxDateStr)
      .order("as_of_date", { ascending: true });

    if (manualErr) {
      console.error("Error fetching manual fixings:", manualErr);
      return NextResponse.json({ error: "Failed to fetch manual fixings" }, { status: 500 });
    }

    const manualFixings: ManualFixingPoint[] = (manualRows ?? [])
      .filter((row: any) => row.rate_mid !== null && Number.isFinite(Number(row.rate_mid)))
      .map((row: any) => ({
        id: String(row.id),
        date: String(row.as_of_date),
        mid: Number(row.rate_mid),
        isOfficial: Boolean(row.is_official),
        isManualOverride: Boolean(row.is_manual_override),
        notes: (row.notes ?? null) as string | null,
        createdAt: String(row.created_at),
        createdEmail: (row.created_email ?? null) as string | null,
      }));

    return NextResponse.json({
      pair: pairParamRaw,
      window: windowParam,
      minDate: minDateStr,
      maxDate: maxDateStr,
      history,
      manualFixings,
      meta: {
        rawMinDate: earliestDate,
        rawMaxDate: latestDate,
        count: history.length,
        manualCount: manualFixings.length,
      },
    });
  } catch (err) {
    console.error("Anchor history route crashed:", err);
    return NextResponse.json({ error: "Server crashed" }, { status: 500 });
  }
}
