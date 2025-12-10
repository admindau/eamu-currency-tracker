"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
);

type HistoryPoint = {
  date: string; // YYYY-MM-DD
  mid: number;
};

type OverridePoint = HistoryPoint;

type AnchorHistoryResponse = {
  pair: string;
  window: string;
  history: HistoryPoint[];
  overrides: OverridePoint[];
};

type WindowKey = "90d" | "365d" | "all";

const WINDOW_OPTIONS: Array<{ key: WindowKey; label: string }> = [
  { key: "90d", label: "90d" },
  { key: "365d", label: "365d" },
  { key: "all", label: "All" },
];

const WINDOW_TO_DAYS: Record<Exclude<WindowKey, "all">, number> = {
  "90d": 90,
  "365d": 365,
};

const PAIR_OPTIONS = [
  {
    key: "SSPUSD", // SSP base, USD quote – matches fx_daily_rates_default
    label: "USD/SSP mid",
    description: "Anchor pair used across the EAMU FX dashboard",
  },
];

function formatDateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function formatRange(start?: string, end?: string): string | null {
  if (!start || !end) return null;
  if (start === end) return formatDateLabel(start);
  return `${formatDateLabel(start)} – ${formatDateLabel(end)}`;
}

export default function AdminAnalyticsCard() {
  const [activePairKey, setActivePairKey] = useState(PAIR_OPTIONS[0]!.key);
  const [windowKey, setWindowKey] = useState<WindowKey>("365d");
  const [data, setData] = useState<AnchorHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // Fetch: always request FULL history from the API (window=all).
  // Windowing is done purely on the client so "All" really means all rows.
  // --------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          pair: activePairKey,
          window: "all",
        });

        const res = await fetch(`/api/admin/anchor-history?${params.toString()}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }

        const json = (await res.json()) as AnchorHistoryResponse;

        if (!cancelled) {
          setData(json);
        }
      } catch (err: any) {
        console.error("Failed to load admin anchor history", err);
        if (!cancelled) {
          setError("Could not load history. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [activePairKey]);

  const fullHistory = useMemo(() => {
    const history = data?.history ?? [];
    const sorted = [...history];
    sorted.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return sorted;
  }, [data?.history]);

  const fullStartDate = fullHistory[0]?.date;
  const fullEndDate = fullHistory[fullHistory.length - 1]?.date;

  const filteredHistory = useMemo<HistoryPoint[]>(() => {
    if (!fullHistory.length) return [];

    if (windowKey === "all") return fullHistory;

    const daysBack = WINDOW_TO_DAYS[windowKey];
    const latestStr = fullHistory[fullHistory.length - 1]!.date;
    const latest = new Date(`${latestStr}T00:00:00Z`);

    const cutoff = new Date(latest);
    cutoff.setUTCDate(cutoff.getUTCDate() - daysBack);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    return fullHistory.filter((p) => p.date >= cutoffStr);
  }, [fullHistory, windowKey]);

  const overrideMarkers = useMemo<OverridePoint[]>(() => {
    const overrides = data?.overrides ?? [];
    if (!overrides.length || !filteredHistory.length) return [];

    const byDate = new Map<string, OverridePoint>();
    overrides.forEach((o) => byDate.set(o.date, o));

    return filteredHistory
      .filter((p) => byDate.has(p.date))
      .map((p) => {
        const o = byDate.get(p.date)!;
        return { date: p.date, mid: o.mid ?? p.mid };
      });
  }, [data?.overrides, filteredHistory]);

  const overrideCount = overrideMarkers.length;
  const activePairLabel =
    PAIR_OPTIONS.find((p) => p.key === activePairKey)?.label ?? activePairKey;

  const windowRangeLabel = useMemo(() => {
    if (!filteredHistory.length) return null;
    const start = filteredHistory[0]!.date;
    const end = filteredHistory[filteredHistory.length - 1]!.date;
    return formatRange(start, end);
  }, [filteredHistory]);

  const chartData = useMemo(() => {
    const labels = filteredHistory.map((p) => formatDateLabel(p.date));
    const values = filteredHistory.map((p) => p.mid);

    const overrideIndices = new Map<string, number>();
    overrideMarkers.forEach((o) => {
      const idx = filteredHistory.findIndex((p) => p.date === o.date);
      if (idx >= 0) overrideIndices.set(o.date, idx);
    });

    const overridePoints = Array(labels.length).fill(null) as (number | null)[];
    overrideMarkers.forEach((o) => {
      const idx = filteredHistory.findIndex((p) => p.date === o.date);
      if (idx >= 0) {
        overridePoints[idx] = o.mid;
      }
    });

    return {
      labels,
      datasets: [
        {
          label: "Mid rate",
          data: values,
          borderColor: "rgba(255,255,255,0.9)",
          backgroundColor: "rgba(255,255,255,0.08)",
          borderWidth: 1.6,
          pointRadius: 0,
          pointHitRadius: 6,
          tension: 0.3,
          fill: true,
        },
        {
          label: "Manual overrides",
          data: overridePoints,
          borderColor: "rgba(251,191,36,1)", // amber
          backgroundColor: "rgba(251,191,36,1)",
          pointRadius: 3,
          pointHitRadius: 7,
          borderWidth: 0,
          showLine: false,
        },
      ],
    };
  }, [filteredHistory, overrideMarkers]);

  const chartOptions: ChartOptions<"line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            title(items) {
              const item = items[0];
              const rawDate =
                filteredHistory[item.dataIndex]?.date ?? item.label;
              return formatDateLabel(rawDate as string);
            },
            label(context) {
              const value = context.parsed.y;
              if (value == null) return "";
              return `Mid: ${value.toLocaleString("en-KE", {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            maxTicksLimit: 6,
            color: "rgba(161,161,170,0.85)",
            font: {
              size: 10,
            },
          },
        },
        y: {
          grid: {
            color: "rgba(39,39,42,0.8)",
          },
          ticks: {
            color: "rgba(161,161,170,0.85)",
            font: {
              size: 10,
            },
          },
        },
      },
    }),
    [filteredHistory],
  );

  const activeWindowLabel =
    windowKey === "all"
      ? "Viewing full available history."
      : windowKey === "90d"
      ? "Viewing last 90 days."
      : "Viewing last 365 days.";

  return (
    <section className="rounded-3xl border border-zinc-800 bg-black/40 px-6 py-5 shadow-lg shadow-black/60">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-emerald-400">
            ADMIN ANALYTICS
          </p>
          <h2 className="mt-1 text-sm font-semibold text-zinc-50">
            Volatility and anchor-pair history for USD/SSP, using live engine
            data.
          </h2>
          <p className="mt-1 text-[11px] text-zinc-500">
            {activeWindowLabel}{" "}
            {windowRangeLabel && (
              <span className="text-zinc-400">({windowRangeLabel})</span>
            )}
          </p>
          {fullStartDate && fullEndDate && (
            <p className="mt-0.5 text-[10px] text-zinc-500">
              Full dataset: {formatRange(fullStartDate, fullEndDate)}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Pair selector (only one for now, but ready for future pairs) */}
          <div className="inline-flex rounded-full border border-zinc-700 bg-black/60 p-0.5">
            {PAIR_OPTIONS.map((pair) => (
              <button
                key={pair.key}
                type="button"
                onClick={() => setActivePairKey(pair.key)}
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                  activePairKey === pair.key
                    ? "bg-zinc-100 text-black"
                    : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {pair.label}
              </button>
            ))}
          </div>

          {/* Window selector */}
          <div className="inline-flex rounded-full border border-zinc-700 bg-black/60 p-0.5">
            {WINDOW_OPTIONS.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => setWindowKey(w.key)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  windowKey === w.key
                    ? "bg-zinc-100 text-black"
                    : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mt-3 h-56 w-full overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/80 to-black/80 px-3 pb-3 pt-2">
        {loading ? (
          <div className="flex h-full items-center justify-center text-[11px] text-zinc-500">
            Loading history…
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-[11px] text-red-400">
            {error}
          </div>
        ) : !filteredHistory.length ? (
          <div className="flex h-full items-center justify-center text-[11px] text-zinc-500">
            No history available for this pair yet.
          </div>
        ) : (
          <Line data={chartData} options={chartOptions} />
        )}
      </div>

      {/* Footnote */}
      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
        In this window, the system has{" "}
        <span className="font-semibold text-zinc-300">{overrideCount}</span>{" "}
        manual {activePairLabel} overrides captured in{" "}
        <span className="font-mono text-zinc-400">manual_fixings</span>. Days
        with overrides are highlighted as amber markers on the chart so you can
        see where policy actions intersect with market moves.
      </p>
    </section>
  );
}
