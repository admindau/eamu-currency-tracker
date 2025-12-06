import type { Metadata } from "next";
import Link from "next/link";
import FxHistoryChart from "@/components/fx-history-chart";

export const metadata: Metadata = {
  title: "EAMU FX – Central Bank Mode",
  description:
    "Analytical FX view for East African Monetary Union currencies, with volatility, override activity, and stability indicators built on the Savvy Rilla FX engine.",
};

export const dynamic = "force-dynamic";

type HistoryResponse = {
  pair: string;
  base: string;
  quote: string;
  points: { date: string; mid: number }[];
  meta: { from: string; to: string; count: number };
};

type RecentRatesResponse = {
  data: {
    id: number;
    as_of_date: string;
    base_currency: string;
    quote_currency: string;
    rate_mid: number;
    is_official: boolean | null;
    is_manual_override: boolean | null;
    source_id: number | null;
  }[];
  meta: {
    limit: number;
    base: string;
  };
};

type MarketSummary = {
  as_of_date: string | null;
  base: string;
  quote: string;
  mid_rate: number | null;
  change_pct_vs_previous: number | null;
  trend?: {
    label: string;
    score: number;
  } | null;
};

function getApiBaseUrl() {
  if (process.env.NEXT_PUBLIC_FX_API_ORIGIN) {
    return process.env.NEXT_PUBLIC_FX_API_ORIGIN;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const base = getApiBaseUrl();
    const url = path.startsWith("http") ? path : `${base}${path}`;

    const res = await fetch(url, {
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`FX API error for ${url}:`, res.status, await res.text());
      return null;
    }

    return (await res.json()) as T;
  } catch (err) {
    console.error(`FX API fetch failed for ${path}:`, err);
    return null;
  }
}

function computeDailyReturns(points: { mid: number }[]): number[] {
  if (points.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].mid;
    const curr = points[i].mid;
    if (!prev || !curr || prev === 0) continue;
    const r = (curr / prev - 1) * 100; // percent
    if (!Number.isNaN(r) && Number.isFinite(r)) {
      returns.push(r);
    }
  }
  return returns;
}

function computeStdDev(values: number[]): number | null {
  if (!values.length) return null;
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) /
    values.length;
  return Math.sqrt(variance);
}

type StabilityBucket = "Calm" | "Watch" | "Stressed";

function classifyStability(args: {
  vol30: number | null;
  overrideShare: number | null;
}): StabilityBucket {
  const { vol30, overrideShare } = args;

  if (vol30 == null || overrideShare == null) {
    return "Watch";
  }

  // Heuristic thresholds – tweak as needed once you see real data.
  if (vol30 < 0.4 && overrideShare < 0.1) return "Calm";
  if (vol30 < 1.0 && overrideShare < 0.25) return "Watch";
  return "Stressed";
}

function stabilityDescription(bucket: StabilityBucket): string {
  switch (bucket) {
    case "Calm":
      return "Low short-term volatility and limited manual override activity. Market appears orderly.";
    case "Watch":
      return "Moderate volatility or visible override usage. Worth monitoring but not yet signalling stress.";
    case "Stressed":
      return "Elevated volatility and/or frequent manual overrides. Indicates potential FX pressure and policy sensitivity.";
    default:
      return "";
  }
}

export default async function CentralBankPage() {
  const [history90, recentRates, usdSummary] = await Promise.all([
    fetchJson<HistoryResponse>(
      "/api/v1/rates/history?base=SSP&quote=USD&days=90"
    ),
    fetchJson<RecentRatesResponse>("/api/v1/rates/recent?base=SSP&limit=200"),
    fetchJson<MarketSummary>("/api/v1/summary/market?base=SSP&quote=USD"),
  ]);

  const points = history90?.points ?? [];
  const returns30 = computeDailyReturns(points.slice(-30));
  const vol30 = computeStdDev(returns30); // percent
  const returns90 = computeDailyReturns(points);
  const vol90 = computeStdDev(returns90);

  const rows = recentRates?.data ?? [];

  const officialFixes = rows.filter((r) => r.is_official);
  const manualOverrides = rows.filter((r) => r.is_manual_override);
  const overrideShare =
    rows.length > 0 ? manualOverrides.length / rows.length : null;

  const lastOfficial = officialFixes[0]?.as_of_date ?? null;
  const lastManual = manualOverrides[0]?.as_of_date ?? null;

  const stability = classifyStability({
    vol30,
    overrideShare,
  });

  const latestMid = usdSummary?.mid_rate ?? null;
  const changePct = usdSummary?.change_pct_vs_previous ?? null;
  const trendLabel = usdSummary?.trend?.label ?? null;
  const latestDate = usdSummary?.as_of_date ?? "-";

  const series = points.length
    ? [
        {
          label: "90d",
          days: 90,
          points,
        },
      ]
    : [];

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-16 pt-10">
        {/* Header */}
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[0.7rem] uppercase tracking-[0.25em] text-zinc-500">
                EAMU FX · Central Bank Mode
              </p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Policy-oriented FX view for East African Monetary Union.
              </h1>
              <p className="max-w-2xl text-sm text-zinc-400">
                Built on the same engine as the public EAMU FX dashboard, this
                view highlights volatility, manual override activity, and
                high-level stability signals for USD/SSP and related pairs.
              </p>
            </div>

            <div className="flex flex-col items-end gap-2 text-xs">
              <Link
                href="/"
                className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-zinc-100 hover:border-zinc-600 hover:bg-zinc-900 transition"
              >
                Back to public dashboard
              </Link>
              <p className="max-w-[220px] text-right text-[0.7rem] text-zinc-500">
                Internal analytic view. Figures are indicative and depend on
                data quality and timing.
              </p>
            </div>
          </div>

          {/* Rasta accent bar */}
          <div className="h-1 w-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500" />
        </header>

        {/* Top grid: Market health + Stability + History */}
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
          {/* Market health & stability */}
          <div className="space-y-6">
            {/* Key anchor card */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 text-sm space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                    Regional anchor
                  </p>
                  <p className="text-sm font-medium">USD / SSP</p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[0.7rem] font-medium text-emerald-400">
                  Live from v1 API
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 text-sm">
                <div className="space-y-1">
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                    Mid rate
                  </p>
                  <p className="text-lg font-semibold">
                    {latestMid != null
                      ? latestMid.toLocaleString("en-US", {
                          maximumFractionDigits: 4,
                        })
                      : "—"}
                  </p>
                  <p className="text-[0.7rem] text-zinc-500">
                    {latestDate ?? "No data"}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                    Day change
                  </p>
                  <p
                    className={
                      changePct == null
                        ? "text-sm"
                        : changePct >= 0
                        ? "text-sm font-medium text-emerald-400"
                        : "text-sm font-medium text-red-400"
                    }
                  >
                    {changePct == null
                      ? "—"
                      : `${changePct >= 0 ? "+" : ""}${changePct.toFixed(
                          2
                        )}%`}
                  </p>
                  <p className="text-[0.7rem] text-zinc-500">
                    vs previous fixing
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                    30d volatility
                  </p>
                  <p className="text-zinc-200">
                    {vol30 != null ? `${vol30.toFixed(2)}%` : "—"}
                  </p>
                  <p className="text-[0.7rem] text-zinc-500">
                    std dev of daily % moves
                  </p>
                </div>
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                    90d volatility
                  </p>
                  <p className="text-zinc-200">
                    {vol90 != null ? `${vol90.toFixed(2)}%` : "—"}
                  </p>
                  <p className="text-[0.7rem] text-zinc-500">
                    broader regime check
                  </p>
                </div>
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                    Trend signal
                  </p>
                  <p className="text-zinc-200">
                    {trendLabel ?? "Range-Bound"}
                  </p>
                  <p className="text-[0.7rem] text-zinc-500">
                    from /summary/market
                  </p>
                </div>
              </div>
            </div>

            {/* Stability + overrides */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Stability card */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                      Stability indicator
                    </p>
                    <p className="text-sm font-semibold">USD/SSP regime</p>
                  </div>
                  <span
                    className={[
                      "rounded-full px-3 py-1 text-[0.7rem] font-semibold",
                      stability === "Calm"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : stability === "Watch"
                        ? "bg-amber-500/10 text-amber-400"
                        : "bg-red-500/10 text-red-400",
                    ].join(" ")}
                  >
                    {stability}
                  </span>
                </div>
                <p className="text-[0.8rem] text-zinc-300 leading-relaxed">
                  {stabilityDescription(stability)}
                </p>
                <p className="text-[0.7rem] text-zinc-500">
                  Based on 30-day realised volatility and the share of recent
                  fixes flagged as manual overrides. Heuristic only – not a risk
                  rating.
                </p>
              </div>

              {/* Overrides card */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                      Override activity (recent sample)
                    </p>
                    <p className="text-sm font-semibold">
                      {rows.length || "No"} records analysed
                    </p>
                  </div>
                  <code className="rounded-full bg-zinc-950 px-3 py-1 text-[0.65rem] text-zinc-500 border border-zinc-800">
                    /api/v1/rates/recent
                  </code>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                      Official fixes
                    </p>
                    <p className="text-lg font-semibold text-zinc-100">
                      {officialFixes.length}
                    </p>
                    <p className="text-[0.7rem] text-zinc-500">
                      Last: {lastOfficial ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                      Manual overrides
                    </p>
                    <p className="text-lg font-semibold text-zinc-100">
                      {manualOverrides.length}
                    </p>
                    <p className="text-[0.7rem] text-zinc-500">
                      Last: {lastManual ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                    Share of sample marked manual
                  </p>
                  <p className="text-sm text-zinc-200">
                    {overrideShare != null
                      ? `${(overrideShare * 100).toFixed(1)}%`
                      : "—"}
                  </p>
                  <p className="text-[0.7rem] text-zinc-500">
                    Higher values may indicate policy intervention or data
                    adjustments.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: 90d history chart */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 text-xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                  USD/SSP history
                </p>
                <p className="text-sm font-semibold">
                  90-day anchor pair trajectory
                </p>
              </div>
              <code className="rounded-full bg-zinc-950 px-3 py-1 text-[0.65rem] text-zinc-500 border border-zinc-800">
                /api/v1/rates/history
              </code>
            </div>

            {series.length > 0 ? (
              <FxHistoryChart series={series} />
            ) : (
              <p className="text-[0.8rem] text-zinc-500">
                No history data available for USD/SSP.
              </p>
            )}

            <p className="text-[0.7rem] text-zinc-500">
              Daily mid rates sourced from the same FX engine powering the
              public EAMU dashboard. Use this view to contextualise short-term
              moves against the broader regime.
            </p>
          </div>
        </section>

        {/* Bottom: recent table */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.25em] text-zinc-500">
                Recent USD/SSP records
              </p>
              <p className="text-sm text-zinc-400">
                The same recent dataset, annotated for official fixes and manual
                overrides. Useful when explaining specific interventions or
                fixing patterns.
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70">
            <div className="grid grid-cols-[1.1fr_0.8fr_0.9fr] border-b border-zinc-800 bg-zinc-950/90 text-[0.7rem] text-zinc-400">
              <div className="px-3 py-2">Date</div>
              <div className="px-3 py-2 text-right">Mid rate</div>
              <div className="px-3 py-2 text-right">Flags</div>
            </div>
            <div className="max-h-72 overflow-y-auto text-xs">
              {rows.length === 0 ? (
                <div className="px-3 py-4 text-zinc-500 text-[0.8rem]">
                  No recent records available.
                </div>
              ) : (
                rows.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[1.1fr_0.8fr_0.9fr] border-t border-zinc-900/80 px-3 py-2"
                  >
                    <div>
                      <p className="text-zinc-100">{row.as_of_date}</p>
                      <p className="text-[0.7rem] text-zinc-500">
                        {row.base_currency}/{row.quote_currency}
                      </p>
                    </div>
                    <div className="text-right text-zinc-100">
                      {row.rate_mid.toLocaleString("en-US", {
                        maximumFractionDigits: 4,
                      })}
                    </div>
                    <div className="text-right text-[0.7rem] text-zinc-500 space-y-0.5">
                      {row.is_official && (
                        <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          Official
                        </div>
                      )}
                      {row.is_manual_override && (
                        <div className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                          Manual
                        </div>
                      )}
                      {!row.is_official && !row.is_manual_override && (
                        <span className="text-zinc-600">—</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Footer note */}
        <footer className="mt-4 border-t border-zinc-900 pt-4 text-[0.7rem] text-zinc-500">
          <p>
            This Central Bank Mode is an{" "}
            <span className="text-zinc-300">
              unofficial analytical tool built by Savvy Gorilla Technologies™
            </span>{" "}
            using the same FX infrastructure as fx.savvyrilla.tech. It does not
            represent an official position of any central bank or regional
            authority.
          </p>
        </footer>
      </div>
    </main>
  );
}
