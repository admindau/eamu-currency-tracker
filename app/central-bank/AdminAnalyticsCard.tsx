"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
} from "chart.js";

ChartJS.register(
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
);

type WindowKey = "90d" | "365d";

type HistoryPoint = {
  date: string; // YYYY-MM-DD
  mid: number;
};

type OverridePoint = {
  date: string; // YYYY-MM-DD
  mid: number;
};

type AnchorHistoryResponse = {
  pair: string;
  window: string;
  history: HistoryPoint[];
  overrides: OverridePoint[];
};

const WINDOW_OPTIONS: { key: WindowKey; label: string }[] = [
  { key: "90d", label: "90d" },
  { key: "365d", label: "365d" },
];

const PAIR_OPTIONS = [
  { key: "SSPUSD", label: "SSP / USD" },
  { key: "SSPKES", label: "SSP / KES" },
  { key: "SSPUGX", label: "SSP / UGX" },
  { key: "SSPRWF", label: "SSP / RWF" },
  { key: "SSPBIF", label: "SSP / BIF" },
  { key: "SSPTZS", label: "SSP / TZS" },
] as const;

const DEFAULT_PAIR = "SSPUSD";

const chartOptions: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: "index",
    intersect: false,
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        maxTicksLimit: 6,
        color: "#9ca3af",
        maxRotation: 0,
        autoSkip: true,
      },
    },
    y: {
      grid: { color: "rgba(75, 85, 99, 0.3)" },
      ticks: { color: "#9ca3af" },
    },
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        title(items) {
          if (!items.length) return "";
          return items[0].label || "";
        },
        label(item) {
          const value = item.formattedValue ?? "";
          if (item.datasetIndex === 1) return `Override: ${value}`;
          return `Mid: ${value}`;
        },
      },
    },
  },
};

function dateToString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function AdminAnalyticsCard() {
  const [windowKey, setWindowKey] = useState<WindowKey>("365d");
  const [pairKey, setPairKey] = useState<string>(DEFAULT_PAIR);
  const [data, setData] = useState<AnchorHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Always fetch FULL history for the selected pair
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          pair: pairKey,
          // Ask backend for full history; client will window to 90/365d
          window: "all",
        });

        const res = await fetch(
          `/api/admin/anchor-history?${params.toString()}`,
          { cache: "no-store" },
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Request failed with ${res.status}`);
        }

        const json = (await res.json()) as AnchorHistoryResponse;
        if (!cancelled) setData(json);
      } catch (err: any) {
        console.error("Failed to load anchor history", err);
        if (!cancelled) {
          setError(err?.message || "Failed to load chart data");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [pairKey]);

  const {
    chartData,
    fullStart,
    fullEnd,
    windowStart,
    windowEnd,
    overrideCount,
  } = useMemo(() => {
    if (!data || !data.history || data.history.length === 0) {
      return {
        chartData: null,
        fullStart: null as string | null,
        fullEnd: null as string | null,
        windowStart: null as string | null,
        windowEnd: null as string | null,
        overrideCount: 0,
      };
    }

    // 1) Sort full history oldest → newest
    const sortedFull = [...data.history].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );

    const fullStart = sortedFull[0]?.date ?? null;
    const fullEnd = sortedFull[sortedFull.length - 1]?.date ?? null;

    // 2) Determine cutoff based on selected window, anchored to latest date
    let filteredHistory: HistoryPoint[] = sortedFull;

    if (fullEnd) {
      const daysBack = windowKey === "90d" ? 90 : 365;
      const latest = new Date(fullEnd);
      latest.setUTCHours(0, 0, 0, 0);

      const cutoff = new Date(latest);
      cutoff.setUTCDate(cutoff.getUTCDate() - daysBack);

      const cutoffStr = dateToString(cutoff);
      filteredHistory = sortedFull.filter((p) => p.date >= cutoffStr);
    }

    const windowStart =
      filteredHistory.length > 0 ? filteredHistory[0].date : null;
    const windowEnd =
      filteredHistory.length > 0
        ? filteredHistory[filteredHistory.length - 1].date
        : null;

    // 3) Map overrides, filtered to same window
    const overridesByDate = new Map<string, number>();
    (data.overrides ?? []).forEach((o) => {
      overridesByDate.set(o.date, o.mid);
    });

    const labels = filteredHistory.map((p) => p.date);
    const midSeries = filteredHistory.map((p) => p.mid);
    const overrideSeries = filteredHistory.map((p) => {
      const v = overridesByDate.get(p.date);
      return typeof v === "number" ? v : NaN;
    });

    const chartData =
      labels.length === 0
        ? null
        : {
            labels,
            datasets: [
              {
                label: "Mid rate",
                data: midSeries,
                borderColor: "rgba(52, 211, 153, 1)",
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                tension: 0.25,
                borderWidth: 1.7,
                pointRadius: 0,
                pointHitRadius: 6,
                fill: true,
              },
              {
                label: "Override",
                data: overrideSeries,
                showLine: false,
                borderColor: "rgba(251, 191, 36, 1)",
                backgroundColor: "rgba(251, 191, 36, 1)",
                pointRadius: 4,
                pointHoverRadius: 6,
              },
            ],
          };

    const overrideCount = data.overrides?.length ?? 0;

    return {
      chartData,
      fullStart,
      fullEnd,
      windowStart,
      windowEnd,
      overrideCount,
    };
  }, [data, windowKey]);

  const activePair = data?.pair ?? pairKey;
  const activePairLabel = `${activePair.slice(0, 3)}/${activePair.slice(3)}`;

  return (
    <section className="flex flex-col rounded-2xl border border-zinc-800 bg-black/90 p-6 shadow-lg shadow-black/40">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400/80">
            Admin analytics
          </p>
          <h2 className="text-sm font-medium text-zinc-100">
            Volatility and anchor-pair history for {activePairLabel}, using live
            engine data.
          </h2>
          <p className="text-[11px] text-zinc-500">
            Viewing last {windowKey} from the latest fixing.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2 sm:items-end">
          {/* Window selector */}
          <div className="inline-flex rounded-full bg-zinc-900/80 p-1 text-[11px]">
            {WINDOW_OPTIONS.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => setWindowKey(w.key)}
                className={`px-3 py-1 rounded-full transition ${
                  windowKey === w.key
                    ? "bg-emerald-500 text-black shadow-sm"
                    : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>

          {/* Pair selector */}
          <div className="inline-flex max-w-full flex-wrap gap-1 text-[11px]">
            {PAIR_OPTIONS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPairKey(p.key)}
                className={`rounded-full border px-3 py-1 transition ${
                  pairKey === p.key
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="mt-1 h-[260px] w-full">
        {loading && (
          <div className="flex h-full items-center justify-center text-xs text-zinc-400">
            Loading anchor history…
          </div>
        )}

        {!loading && error && (
          <div className="flex h-full items-center justify-center text-xs text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && (!chartData || !chartData.labels.length) && (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            No history data returned yet.
          </div>
        )}

        {!loading && !error && chartData && chartData.labels.length > 0 && (
          <Line data={chartData} options={chartOptions} />
        )}
      </div>

      {/* Diagnostics / Footnote */}
      <div className="mt-3 space-y-1 text-[11px] leading-relaxed text-zinc-500">
        <p>
          In this window, the system has{" "}
            <span className="font-semibold text-zinc-300">
              {overrideCount}
            </span>{" "}
          manual {activePairLabel} overrides captured in{" "}
          <span className="font-mono text-zinc-400">manual_fixings</span>.
          Overrides are highlighted as amber markers on the chart where they
          intersect engine fixings.
        </p>

        {fullStart && fullEnd && (
          <p className="text-[10px] text-zinc-600">
            Dataset range:{" "}
            <span className="font-mono text-zinc-300">
              {fullStart} → {fullEnd}
            </span>{" "}
            | Current window:{" "}
            {windowStart && windowEnd ? (
              <span className="font-mono text-zinc-300">
                {windowStart} → {windowEnd}
              </span>
            ) : (
              "no points in window"
            )}
          </p>
        )}
      </div>
    </section>
  );
}
