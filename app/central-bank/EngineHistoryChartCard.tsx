"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
import zoomPlugin from "chartjs-plugin-zoom";

ChartJS.register(
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
  zoomPlugin
);

// ✅ Removed "all"
const WINDOWS = ["15d", "30d", "90d", "365d"] as const;
type WindowKey = (typeof WINDOWS)[number];

type PairOption = {
  base: string;
  quote: string;
  label: string; // e.g. "USD/SSP"
  value: string; // e.g. "SSPUSD" (base+quote)
};

type HistoryPoint = { date: string; mid: number };

type EngineHistoryResponse = {
  source: string; // detected table/view name
  window: WindowKey;
  pair: string; // base+quote, e.g. "SSPUSD"
  minDate: string;
  maxDate: string;
  pairs: PairOption[];
  history: HistoryPoint[];
};

function formatWindowLabel(key: WindowKey) {
  return key;
}

function toPairLabel(base: string, quote: string) {
  // UX label: quote/base (USD/SSP)
  return `${quote}/${base}`;
}

function safeDateRange(minDate?: string, maxDate?: string) {
  if (!minDate || !maxDate) return "";
  if (minDate === maxDate) return minDate;
  return `${minDate} → ${maxDate}`;
}

export default function EngineHistoryChartCard() {
  const chartRef = useRef<any>(null);

  const [activeWindow, setActiveWindow] = useState<WindowKey>("90d");
  const [activePair, setActivePair] = useState<string>("SSPUSD"); // base+quote
  const [data, setData] = useState<EngineHistoryResponse | null>(null);
  const [pairs, setPairs] = useState<PairOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch data
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/admin/engine-history?window=${encodeURIComponent(
            activeWindow
          )}&pair=${encodeURIComponent(activePair)}`,
          { method: "GET", cache: "no-store" }
        );

        const body = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(body?.error || `Request failed (${res.status})`);
        }

        if (!cancelled) {
          const parsed = body as EngineHistoryResponse;
          setData(parsed);
          setPairs(parsed.pairs ?? []);
        }
      } catch (e: any) {
        console.error("Engine history chart load failed:", e);
        if (!cancelled) {
          setError(e?.message || "Failed to load engine history");
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
  }, [activeWindow, activePair]);

  // If pairs arrive and current activePair is not present, fall back to first.
  useEffect(() => {
    if (!pairs.length) return;
    if (pairs.some((p) => p.value === activePair)) return;
    setActivePair(pairs[0].value);
  }, [pairs, activePair]);

  const activePairLabel = useMemo(() => {
    const found = pairs.find((p) => p.value === activePair);
    if (found) return found.label;
    // best-effort label if not yet loaded
    const clean = (activePair || "").replace(/[^A-Za-z]/g, "").toUpperCase();
    const base = clean.slice(0, 3) || "SSP";
    const quote = clean.slice(3, 6) || "USD";
    return toPairLabel(base, quote);
  }, [pairs, activePair]);

  const chartData = useMemo(() => {
    if (!data || !data.history || data.history.length === 0) return null;

    const labels = data.history.map((p) => p.date);
    const series = data.history.map((p) => p.mid);

    return {
      labels,
      datasets: [
        {
          label: `${activePairLabel} mid`,
          data: series,
          borderWidth: 1.6,
          tension: 0.2,
          pointRadius: 0,
          borderColor: "rgba(255,255,255,0.85)",
          backgroundColor: "rgba(255,255,255,0.04)",
          fill: true,
        },
      ],
    };
  }, [data, activePairLabel]);

  const chartOptions: ChartOptions<"line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: "index",
          intersect: false,
          displayColors: false,
          callbacks: {
            title: (items) => (items?.length ? items[0].label || "" : ""),
            label: (item) => {
              const y = item.parsed?.y;
              if (y == null) return "";
              return `Mid: ${y.toLocaleString(undefined, {
                maximumFractionDigits: 3,
              })}`;
            },
          },
        },
        zoom: {
          // Recommendation: wheel zoom + drag pan (best desktop UX)
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: "x",
          },
          pan: {
            enabled: true,
            mode: "x",
          },
          limits: {
            x: { min: "original", max: "original" },
            y: { min: "original", max: "original" },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: { maxTicksLimit: 6, color: "rgba(255,255,255,0.6)" },
        },
        y: {
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: {
            color: "rgba(255,255,255,0.6)",
            callback: (value) =>
              typeof value === "number"
                ? value.toLocaleString(undefined, { maximumFractionDigits: 0 })
                : value,
          },
        },
      },
      elements: { point: { hitRadius: 8 } },
    }),
    []
  );

  const rangeText = safeDateRange(data?.minDate, data?.maxDate);

  function handleResetZoom() {
    const chart = chartRef.current;
    if (chart && typeof chart.resetZoom === "function") {
      chart.resetZoom();
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-black/40 px-5 pb-4 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-wide text-zinc-200">
            Engine history
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Select a pair and window. Zoom with mouse wheel; pan by dragging.
          </p>
          {rangeText ? (
            <p className="mt-1 text-[11px] text-zinc-600">Range: {rangeText}</p>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Window selector */}
          <div className="inline-flex items-center gap-1 rounded-full bg-zinc-900/70 p-1 text-[11px]">
            {WINDOWS.map((w) => {
              const isActive = activeWindow === w;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => setActiveWindow(w)}
                  className={[
                    "rounded-full px-3 py-1 transition",
                    isActive
                      ? "bg-emerald-500 text-black shadow-sm"
                      : "text-zinc-400 hover:text-zinc-100",
                  ].join(" ")}
                >
                  {formatWindowLabel(w)}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleResetZoom}
            className="rounded-full border border-zinc-700 bg-black px-3 py-1.5 text-[11px] text-zinc-100 hover:bg-zinc-900"
          >
            Reset zoom
          </button>
        </div>
      </div>

      {/* Pair selector */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[11px] text-zinc-500">Pair</span>
          <select
            value={activePair}
            onChange={(e) => setActivePair(e.target.value)}
            className="max-w-[260px] truncate rounded-xl border border-zinc-800 bg-black px-3 py-2 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
          >
            {(pairs.length
              ? pairs
              : [{ base: "SSP", quote: "USD", label: "USD/SSP", value: "SSPUSD" }]
            ).map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {data?.source ? (
          <span className="text-[11px] text-zinc-600">
            Source:{" "}
            <span className="font-mono text-zinc-500">{data.source}</span>
          </span>
        ) : null}
      </div>

      <div className="mt-1 h-56 w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2">
        {loading && (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            Loading {formatWindowLabel(activeWindow)}…
          </div>
        )}

        {!loading && error && (
          <div className="flex h-full items-center justify-center text-xs text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && chartData && (
          <Line ref={chartRef} data={chartData} options={chartOptions} />
        )}

        {!loading && !error && !chartData && (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            No data available for this pair/window.
          </div>
        )}
      </div>

      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
        Windows are calendar-based (e.g., 30d = latestDate minus 29 days).
      </p>
    </section>
  );
}
