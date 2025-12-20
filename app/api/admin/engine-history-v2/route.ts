// app/api/admin/engine-history-v2/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type WindowKey = "15d" | "30d" | "90d" | "365d" | "all";

const WINDOW_DAYS: Record<Exclude<WindowKey, "all">, number> = {
  "15d": 15,
  "30d": 30,
  "90d": 90,
  "365d": 365,
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcTs(d: string) {
  return new Date(`${d}T00:00:00Z`).getTime();
}
function tsToDate(ts: number) {
  return new Date(ts).toISOString().slice(0, 10);
}

function parsePair(pair: string) {
  const clean = pair.replace(/[^A-Za-z]/g, "").toUpperCase();
  if (clean.length < 6) return { base: "SSP", quote: "USD", label: "USD/SSP" };
  const a = clean.slice(0, 3);
  const b = clean.slice(3, 6);

  // Canonicalize to SSP base for storage conventions
  if (a === "SSP") return { base: "SSP", quote: b, label: `${b}/SSP` };
  if (b === "SSP") return { base: "SSP", quote: a, label: `${a}/SSP` };

  // Fallback: anchor on SSP
  return { base: "SSP", quote: a, label: `${a}/SSP` };
}

type Point = { date: string; mid: number };

async function fetchAllPaged<T>(
  queryBuilder: any,
  pageSize = 1000,
  hardCap = 200000
): Promise<{ rows: T[]; pages: number }> {
  const out: T[] = [];
  let from = 0;
  let pages = 0;

  while (true) {
    const to = from + pageSize - 1;
    const res = await queryBuilder.range(from, to);

    if (res.error) throw res.error;

    const batch: T[] = (res.data ?? []) as T[];
    out.push(...batch);
    pages += 1;

    if (batch.length < pageSize) break;

    from += pageSize;
    if (out.length >= hardCap) break;
  }

  return { rows: out, pages };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const windowRaw = (url.searchParams.get("window") ?? "90d").toLowerCase();
    const window: WindowKey =
      windowRaw === "15d" ||
      windowRaw === "30d" ||
      windowRaw === "90d" ||
      windowRaw === "365d" ||
      windowRaw === "all"
        ? (windowRaw as WindowKey)
        : "90d";

    const pairParam = (url.searchParams.get("pair") ?? "SSPUSD").toUpperCase();
    const { base, quote, label } = parsePair(pairParam);

    const supabase = supabaseServer;

    // 1) Fetch ALL official history (paged) for (base=SSP, quote=XYZ)
    const officialQuery = supabase
      .from("fx_daily_rates_default")
      .select("as_of_date, rate_mid")
      .eq("base_currency", base)
      .eq("quote_currency", quote)
      .order("as_of_date", { ascending: true });

    let rows: { as_of_date: string; rate_mid: number | null }[] = [];
    try {
      const paged = await fetchAllPaged<{ as_of_date: string; rate_mid: number | null }>(
        officialQuery,
        1000
      );
      rows = paged.rows ?? [];
    } catch (e: any) {
      console.error("engine-history-v2 official fetch error (paged):", e);
      return NextResponse.json({ error: "Failed to fetch official history" }, { status: 500 });
    }

    if (!rows.length) {
      return NextResponse.json({ error: "No official history for this pair" }, { status: 404 });
    }

    const earliestDate = rows[0].as_of_date;
    const latestDate = rows[rows.length - 1].as_of_date;
    const latestTs = toUtcTs(latestDate);

    let minTs: number;
    let minDate: string;

    if (window === "all") {
      minTs = toUtcTs(earliestDate);
      minDate = earliestDate;
    } else {
      const days = WINDOW_DAYS[window];
      minTs = latestTs - (days - 1) * DAY_MS;
      minDate = tsToDate(minTs);
    }

    const maxDate = latestDate;

    const official: Point[] = rows
      .filter((r) => toUtcTs(r.as_of_date) >= minTs)
      .filter((r) => r.rate_mid !== null && Number.isFinite(Number(r.rate_mid)))
      .map((r) => ({ date: r.as_of_date, mid: Number(r.rate_mid) }));

    // 2) Manual fixings for same window
    const { data: manualRows, error: manualErr } = await supabase
      .from("manual_fixings")
      .select("id, as_of_date, rate_mid, is_official, is_manual_override, notes, created_at, created_email")
      .eq("base_currency", base)
      .eq("quote_currency", quote)
      .gte("as_of_date", minDate)
      .lte("as_of_date", maxDate)
      .order("as_of_date", { ascending: true });

    if (manualErr) {
      console.error("engine-history-v2 manual fetch error:", manualErr);
      return NextResponse.json({ error: "Failed to fetch manual fixings" }, { status: 500 });
    }

    const manualFixings = (manualRows ?? [])
      .filter((r: any) => r.rate_mid !== null && Number.isFinite(Number(r.rate_mid)))
      .map((r: any) => ({
        id: String(r.id),
        date: String(r.as_of_date),
        mid: Number(r.rate_mid),
        isOfficial: Boolean(r.is_official),
        isManualOverride: Boolean(r.is_manual_override),
        notes: (r.notes ?? null) as string | null,
        createdAt: String(r.created_at),
        createdEmail: (r.created_email ?? null) as string | null,
      }));

    // 3) Effective series: apply manual overrides only
    const manualByDate = new Map<string, (typeof manualFixings)[number]>();
    for (const m of manualFixings) manualByDate.set(m.date, m);

    const effective: Point[] = official.map((p) => {
      const m = manualByDate.get(p.date);
      if (m && m.isManualOverride) return { date: p.date, mid: m.mid };
      return p;
    });

    return NextResponse.json({
      source: "fx_daily_rates_default",
      window,
      pair: `${base}${quote}`,
      displayPair: label,
      minDate,
      maxDate,
      official,
      effective,
      manualFixings,
    });
  } catch (e) {
    console.error("engine-history-v2 crashed:", e);
    return NextResponse.json({ error: "Server crashed" }, { status: 500 });
  }
}
