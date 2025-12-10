import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import FxHistoryChart from "@/components/fx-history-chart";
import {
  buildInsightsFromSummary,
  type MarketSummary,
} from "@/lib/fx/insights";
import { CurrencyOverviewCard } from "@/components/CurrencyOverviewCard";

export const metadata: Metadata = {
  title:
    "Savvy Rilla FX API – Real-time FX infrastructure for SSP & key global currencies",
  description:
    "Public, read-only FX API for South Sudanese Pound (SSP) market data, built by Savvy Gorilla Technologies. Track USD/SSP, GBP/SSP, EUR/SSP and more, and integrate FX data into your applications with a clean, versioned API.",
  openGraph: {
    title:
      "Savvy Rilla FX API – Real-time FX infrastructure for SSP & key global currencies",
    description:
      "Regional FX infrastructure powering Savvy Rilla FX, EAMU FX, and related dashboards. Built by Savvy Gorilla Technologies.",
    url: "https://fx.savvyrilla.tech",
    siteName: "Savvy Rilla FX API",
    type: "website",
    images: [
      {
        url: "/og-fx-api.png",
        width: 1200,
        height: 630,
        alt: "Savvy Rilla FX API – Real-time FX infrastructure",
      },
    ],
  },
};

type HistoryPoint = {
  date: string;
  mid: number;
};

type HistoryResponse = {
  pair: string;
  base: string;
  quote: string;
  points: HistoryPoint[];
  meta: {
    from: string;
    to: string;
    count: number;
  };
};

type RecentRate = {
  id: number;
  as_of_date: string;
  base_currency: string;
  quote_currency: string;
  rate_mid: number;
  is_official: boolean | null;
  is_manual_override: boolean | null;
  source_id: number | null;
};

type RecentRatesResponse = {
  data: RecentRate[];
  meta: {
    limit: number;
    base: string;
  };
};

type CurrencyOverview = {
  code: string;
  name: string;
  region: string;
  latest_mid: number | null;
  latest_date: string | null;
  day_change_pct: number | null;
};

type SummaryMarketResponse = MarketSummary;

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

function buildEamuOverview(summary: SummaryMarketResponse | null): {
  anchor: CurrencyOverview;
  members: CurrencyOverview[];
} {
  const dummy: CurrencyOverview = {
    code: "USD",
    name: "United States Dollar",
    region: "Anchor",
    latest_mid: null,
    latest_date: null,
    day_change_pct: null,
  };

  if (!summary) {
    return {
      anchor: dummy,
      members: [
        {
          code: "KES",
          name: "Kenyan Shilling",
          region: "Kenya",
          latest_mid: null,
          latest_date: null,
          day_change_pct: null,
        },
        {
          code: "UGX",
          name: "Ugandan Shilling",
          region: "Uganda",
          latest_mid: null,
          latest_date: null,
          day_change_pct: null,
        },
        {
          code: "TZS",
          name: "Tanzanian Shilling",
          region: "Tanzania",
          latest_mid: null,
          latest_date: null,
          day_change_pct: null,
        },
        {
          code: "RWF",
          name: "Rwandan Franc",
          region: "Rwanda",
          latest_mid: null,
          latest_date: null,
          day_change_pct: null,
        },
        {
          code: "BIF",
          name: "Burundian Franc",
          region: "Burundi",
          latest_mid: null,
          latest_date: null,
          day_change_pct: null,
        },
        {
          code: "CDF",
          name: "Congolese Franc",
          region: "DR Congo",
          latest_mid: null,
          latest_date: null,
          day_change_pct: null,
        },
        {
          code: "SOS",
          name: "Somali Shilling",
          region: "Somalia",
          latest_mid: null,
          latest_date: null,
          day_change_pct: null,
        },
      ],
    };
  }

  const anchor: CurrencyOverview = {
    code: summary.quote,
    name: "United States Dollar",
    region: "Anchor",
    latest_mid: summary.mid_rate ?? null,
    latest_date: summary.as_of_date ?? null,
    day_change_pct: summary.change_pct_vs_previous ?? null,
  };

  const members: CurrencyOverview[] = [
    {
      code: "KES",
      name: "Kenyan Shilling",
      region: "Kenya",
      latest_mid: null,
      latest_date: null,
      day_change_pct: null,
    },
    {
      code: "UGX",
      name: "Ugandan Shilling",
      region: "Uganda",
      latest_mid: null,
      latest_date: null,
      day_change_pct: null,
    },
    {
      code: "TZS",
      name: "Tanzanian Shilling",
      region: "Tanzania",
      latest_mid: null,
      latest_date: null,
      day_change_pct: null,
    },
    {
      code: "RWF",
      name: "Rwandan Franc",
      region: "Rwanda",
      latest_mid: null,
      latest_date: null,
      day_change_pct: null,
    },
    {
      code: "BIF",
      name: "Burundian Franc",
      region: "Burundi",
      latest_mid: null,
      latest_date: null,
      day_change_pct: null,
    },
    {
      code: "CDF",
      name: "Congolese Franc",
      region: "DR Congo",
      latest_mid: null,
      latest_date: null,
      day_change_pct: null,
    },
    {
      code: "SOS",
      name: "Somali Shilling",
      region: "Somalia",
      latest_mid: null,
      latest_date: null,
      day_change_pct: null,
    },
  ];

  return { anchor, members };
}

function buildDailyCommentary(summary: SummaryMarketResponse | null): string {
  if (!summary || !summary.as_of_date || summary.mid_rate == null) {
    return "USD/SSP commentary will appear here once enough fixing history is available from the FX engine.";
  }

  const { as_of_date: date, mid_rate: mid, change_pct_vs_previous: change } =
    summary;

  const midStr = mid.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

  let sentence1: string;

  if (change == null || Number.isNaN(change)) {
    sentence1 = `On ${date}, USD/SSP fixed at ${midStr}.`;
  } else {
    const changeAbs = Math.abs(change);
    const changeStr = `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;

    if (changeAbs < 0.05) {
      sentence1 = `On ${date}, USD/SSP was broadly unchanged, fixing at ${midStr} (${changeStr} vs the previous fixing).`;
    } else if (changeAbs < 0.3) {
      sentence1 =
        `On ${date}, USD/SSP eased ` +
        `${change >= 0 ? "higher" : "lower"}, fixing at ${midStr} ` +
        `(${changeStr} vs the previous fixing).`;
    } else {
      sentence1 =
        `On ${date}, USD/SSP moved ` +
        `${change >= 0 ? "sharply higher" : "sharply lower"}, fixing at ${midStr} ` +
        `(${changeStr} vs the previous fixing).`;
    }
  }

  const trend = summary.trend;
  let sentence2 = "";

  if (trend?.label) {
    const label = trend.label;
    sentence2 = ` The current trend signal is “${label}”, summarising recent price action over the configured window.`;
  }

  return (
    sentence1 +
    sentence2 +
    " This commentary is generated automatically from the underlying fixing history and may be updated as new data arrives."
  );
}

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [history, recent, summary] = await Promise.all([
    fetchJson<HistoryResponse>(
      "/api/v1/rates/history?base=SSP&quote=USD&days=365"
    ),
    fetchJson<RecentRatesResponse>("/api/v1/rates/recent?base=SSP&limit=50"),
    fetchJson<SummaryMarketResponse>(
      "/api/v1/summary/market?base=SSP&quote=USD"
    ),
  ]);

  const points = history?.points ?? [];
  const summaryInsights = summary ? buildInsightsFromSummary(summary) : null;
  const primaryInsight =
    summaryInsights && summaryInsights.length > 0 ? summaryInsights[0] : null;
  const hintText =
    summaryInsights && summaryInsights.length > 1 ? summaryInsights[1] : null;

  const commentary = buildDailyCommentary(summary);

  const { anchor, members } = buildEamuOverview(summary);

  const series =
    points.length > 0
      ? [
          {
            label: "365d",
            days: 365,
            points,
          },
        ]
      : [];

  const recentRows = recent?.data ?? [];

  // ----------------------------------------
  // EAMU member snapshot for CurrencyOverviewCard
  // ----------------------------------------

  const EAMU_COUNTRIES: { code: string; name: string; flag: string }[] = [
    { code: "KES", name: "Kenyan Shilling", flag: "🇰🇪" },
    { code: "UGX", name: "Ugandan Shilling", flag: "🇺🇬" },
    { code: "TZS", name: "Tanzanian Shilling", flag: "🇹🇿" },
    { code: "RWF", name: "Rwandan Franc", flag: "🇷🇼" },
    { code: "BIF", name: "Burundian Franc", flag: "🇧🇮" },
    { code: "CDF", name: "Congolese Franc", flag: "🇨🇩" },
    { code: "SOS", name: "Somali Shilling", flag: "🇸🇴" },
  ];

  const latestBase = "SSP";

  const latestDate: string | null =
    summary?.as_of_date ??
    (recentRows.length > 0 ? recentRows[0].as_of_date : null);

  // Build per-pair history from recent rows for EAMU quotes
  const eamuCodeSet = new Set(EAMU_COUNTRIES.map((c) => c.code));

  const perPair: Record<string, RecentRate[]> = {};

  for (const row of recentRows) {
    if (row.base_currency !== "SSP") continue;
    if (!eamuCodeSet.has(row.quote_currency)) continue;

    if (!perPair[row.quote_currency]) {
      perPair[row.quote_currency] = [];
    }
    perPair[row.quote_currency].push(row);
  }

  // Sort each pair's history by date descending (latest first)
  for (const code of Object.keys(perPair)) {
    perPair[code].sort((a, b) =>
      a.as_of_date < b.as_of_date ? 1 : a.as_of_date > b.as_of_date ? -1 : 0
    );
  }

  const eamuRates = EAMU_COUNTRIES.map((country) => {
    const historyRows = perPair[country.code] ?? [];
    const latestRow = historyRows[0];
    const previousRow = historyRows[1];

    const latestRate = latestRow?.rate_mid ?? null;
    const previousRate = previousRow?.rate_mid ?? null;

    let changePct: number | null = null;
    if (
      typeof latestRate === "number" &&
      typeof previousRate === "number" &&
      previousRate !== 0
    ) {
      changePct = (latestRate - previousRate) / previousRate;
    }

    // sparkline history: up to last 7 mid rates, oldest -> newest
    const history =
      historyRows.length > 0
        ? historyRows
            .slice(0, 7)
            .map((row) => row.rate_mid)
            .reverse()
        : undefined;

    let sourceLabel: string | null = null;
    if (latestRow) {
      if (latestRow.is_official) {
        sourceLabel = "Official fixing";
      } else if (latestRow.is_manual_override) {
        sourceLabel = "Manual override";
      } else {
        sourceLabel = "Savvy Rilla FX – public read-only";
      }
    }

    return {
      code: country.code,
      name: country.name,
      flag: country.flag,
      rate: latestRate,
      changePct,
      history,
      sourceLabel,
    };
  });


  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-16 pt-10">
        {/* Top bar / logo */}
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative h-8 w-8">
                <Image
                  src="/savvy-gorilla-logo-white.png"
                  alt="Savvy Gorilla Technologies"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <div className="leading-tight">
                <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                  Savvy Gorilla Technologies™
                </p>
                <p className="text-xs text-zinc-500">
                  EAMU FX · East African Monetary Union
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <Link
                href="/central-bank"
                className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 hover:border-amber-400 transition"
              >
                Switch to Central Bank Mode
              </Link>
              <Link
                href="/docs"
                className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800 transition"
              >
                View API docs
              </Link>
            </div>
          </div>

          <div className="h-1 w-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500" />
        </header>

        {/* Hero + key stat */}
        <section className="grid gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
          <div className="space-y-5">
            <p className="text-[0.7rem] uppercase tracking-[0.25em] text-zinc-500">
              Savvy Rilla FX API
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Real-time FX dashboard for East African Monetary Union currencies.
            </h1>
            <p className="max-w-xl text-sm text-zinc-400">
              A regional FX view built on the same infrastructure that powers
              Savvy Rilla FX. Track key pairs, monitor volatility, and generate
              insights across EAMU currencies in a single, public interface.
            </p>

            <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Live from v1 API
              </span>
              <span>Base currency: SSP</span>
              <span className="hidden sm:inline text-zinc-600">•</span>
              <span>Anchor pair: USD/SSP</span>
            </div>

            {/* Anchor pair card */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                    Regional anchor
                  </p>
                  <p className="text-sm font-medium">USD / SSP</p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[0.7rem] font-medium text-emerald-400">
                  Public read-only
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-4 border-t border-zinc-800 pt-3 text-sm">
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                    Mid rate
                  </p>
                  <p className="text-lg font-semibold">
                    {anchor.latest_mid != null
                      ? anchor.latest_mid.toLocaleString("en-US", {
                          maximumFractionDigits: 3,
                        })
                      : "—"}
                  </p>
                  <p className="text-[0.7rem] text-zinc-500">
                    {anchor.latest_date ?? "No recent fixing"}
                  </p>
                </div>

                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                    Day change
                  </p>
                  <p
                    className={
                      anchor.day_change_pct == null
                        ? "text-sm"
                        : anchor.day_change_pct >= 0
                        ? "text-sm font-medium text-emerald-400"
                        : "text-sm font-medium text-red-400"
                    }
                  >
                    {anchor.day_change_pct == null
                      ? "—"
                      : `${anchor.day_change_pct >= 0 ? "+" : ""}${anchor.day_change_pct.toFixed(
                          2
                        )}%`}
                  </p>
                  <p className="text-[0.7rem] text-zinc-500">
                    vs previous fixing
                  </p>
                </div>

                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                    Trend (experimental)
                  </p>
                  <p className="text-sm">
                    {primaryInsight ?? "Range-bound"}
                  </p>
                  <p className="text-[0.7rem] text-zinc-500">
                    {hintText ?? "Waiting for more history."}
                  </p>
                </div>
              </div>
            </div>

            {/* Call-to-actions */}
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/api"
                className="rounded-full bg-white text-black px-4 py-2 text-sm font-medium hover:bg-zinc-200 transition"
              >
                Get started with the API
              </Link>
              <Link
                href="#recent"
                className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-900 transition"
              >
                View recent USD/SSP history
              </Link>
            </div>
          </div>

          {/* History chart */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-xs">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                  USD/SSP history
                </p>
                <p className="text-sm font-medium">
                  365-day anchor pair trajectory
                </p>
              </div>
            </div>

            <div className="mt-3">
              {series.length > 0 ? (
                <FxHistoryChart series={series} />
              ) : (
                <div className="flex h-40 items-center justify-center text-[0.8rem] text-zinc-500">
                  USD/SSP history will appear here once enough data is
                  available.
                </div>
              )}
            </div>

            <p className="mt-2 text-[0.7rem] text-zinc-500">
              This view uses the same history endpoint that powers the EAMU FX
              dashboard and widget integrations. Use it to contextualise
              short-term moves against the broader regime.
            </p>
          </div>
        </section>

        {/* EAMU overview */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.25em] text-zinc-500">
                EAMU currency snapshot
              </p>
              <p className="text-sm text-zinc-400">
                High-level view of EAMU and related currencies, anchored on
                USD/SSP.
              </p>
            </div>
            <Link
              href="/widget/usd-ssp"
              className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[0.7rem] font-medium text-zinc-200 hover:border-zinc-600 hover:bg-zinc-900 transition"
            >
              View embeddable widget
            </Link>
          </div>

          {/* Slim commentary (380px) + wide EAMU cards */}
          <div className="grid gap-4 md:grid-cols-[380px_minmax(0,1.6fr)] items-start">
      {/* Anchor + commentary (ultra-compact) */}
      <div className="rounded-xl border border-zinc-900 bg-zinc-950/60 p-2 text-[0.65rem] space-y-1 max-h-[160px] overflow-hidden">
        <div>
          <p className="text-[0.55rem] uppercase tracking-[0.18em] text-zinc-500">
            Anchor commentary (beta)
         </p>
        <p className="text-[0.68rem] font-medium text-zinc-200 leading-tight">
        USD/SSP daily note
    </p>
  </div>

  <p className="text-[0.63rem] leading-snug text-zinc-300 line-clamp-4">
    {commentary}
  </p>

  <p className="text-[0.56rem] text-zinc-600">
    Auto-generated from daily fixing data.
  </p>
</div>


            {/* Members grid extracted to component */}
            <CurrencyOverviewCard
              commentary={commentary}
              eamuRates={eamuRates}
              latestBase={latestBase}
              latestDate={latestDate}
            />
          </div>
        </section>

        {/* Recent table */}
        <section id="recent" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.25em] text-zinc-500">
                Recent USD/SSP records
              </p>
              <p className="text-sm text-zinc-400">
                The same recent dataset used by the widget and commentary
                engine.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[0.7rem] text-zinc-500">
              <code className="rounded-full bg-zinc-950 px-2.5 py-1 border border-zinc-800">
                GET /api/v1/rates/recent?base=SSP&amp;limit=50
              </code>
              <span>•</span>
              <span>Sorted by most recent fixing first</span>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 overflow-hidden text-xs">
            <div className="grid grid-cols-[1.2fr_0.9fr_0.9fr_0.9fr] border-b border-zinc-800 bg-zinc-950/90 text-[0.7rem] text-zinc-400">
              <div className="px-3 py-2">Date &amp; pair</div>
              <div className="px-3 py-2 text-right">Mid rate</div>
              <div className="px-3 py-2 text-right">Flags</div>
              <div className="px-3 py-2 text-right">Source</div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {recentRows.length > 0 ? (
                recentRows.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[1.2fr_0.9fr_0.9fr_0.9fr] border-t border-zinc-900/80 px-3 py-2"
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
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          Official fixing
                        </span>
                      )}
                      {row.is_manual_override && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                          Manual override
                        </span>
                      )}
                      {!row.is_official && !row.is_manual_override && (
                        <span className="text-zinc-600">—</span>
                      )}
                    </div>
                    <div className="text-right text-[0.7rem] text-zinc-500">
                      {row.source_id != null ? `Source #${row.source_id}` : "—"}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-3 py-4 text-zinc-500 text-[0.8rem]">
                  No recent records available.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-4 border-t border-zinc-900 pt-4 text-[0.7rem] text-zinc-500">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p>
                Built on the same FX engine behind{" "}
                <a
                  href="https://fx.savvyrilla.tech"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-300 hover:text-white transition"
                >
                  fx.savvyrilla.tech
                </a>{" "}
                and{" "}
                <a
                  href="https://eamu.savvyrilla.tech"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-300 hover:text-white transition"
                >
                  EAMU FX
                </a>
                . This interface is public and read-only.
              </p>
              <p>
                Data is provided as-is, without warranty, and should be used
                alongside official publications and professional judgement.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-zinc-600">Savvy Gorilla Technologies™</span>
              <span className="hidden sm:inline text-zinc-600">•</span>

              <span className="text-zinc-400">
                Made in Juba <span className="ml-0.5">🇸🇸</span>
              </span>

              <span className="hidden sm:inline text-zinc-600">•</span>

              <a
                href="https://savvyrilla.tech"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-300 hover:text-white transition"
              >
                savvyrilla.tech
              </a>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
