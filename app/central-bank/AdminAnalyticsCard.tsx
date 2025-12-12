// app/central-bank/AdminAnalyticsCard.tsx
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
  Filler
);

const WINDOW_OPTIONS = ["90d", "365d", "all"] as const;
type WindowKey = (typeof WINDOW_OPTIONS)[number];

type AnchorHistoryPoint = {
  date: string; // YYYY-MM-DD
  mid: number; // SSP per USD (or whichever pair the backend returns)
};

type OverridePoint = {
  date: string; // YYYY-MM-DD
  mid: number;
};

type AnchorHistoryResponse = {
  pair: string; // e.g. "SSPUSD"
  window: WindowKey;
  minDate: string;
  maxDate: string;
  history: AnchorHistoryPoint[];
  overrides: OverridePoint[];
};

function formatWindowLabel(key: WindowKey) {
  if (key === "90d") return "90d";
  if (key === "365d") return "365d";
  return "All";
}

function formatRange(minDate?: string, maxDate?: string) {
  if (!minDate || !maxDate) return "";
  if (minDate === maxDate) return minDate;
  return `${minDate} → ${maxDate}`;
}

function parsePairLabel(pair: string) {
  // Backend default is "SSPUSD" meaning base=SSP, quote=USD.
  // Your existing UI copy calls it "USD/SSP". We keep that UX, but also show the raw pair.
  const clean = (pair ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
  if (clean.length >= 6) {
    const base = clean.slice(0, 3);
    const quote = clean.slice(3, 6);
    return { base, quote, raw: `${base}${quote}` };
  }
  return { base: "SSP", quote: "USD", raw: "SSPUSD" };
}

export default function AdminAnalyticsCard() {
  const [activeWindow, setActiveWindow] = useState<WindowKey>("365d");
  const [data, setData] = useState<AnchorHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If you later want to support multiple pairs, we can expose this as a selector.
  const pairParam = "SSPUSD";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/admin/anchor-history?window=${activeWindow}&pair=${pairParam}`,
          { method: "GET", cache: "no-store" }
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Request failed with status ${res.status}`);
        }

        const body = (await res.json()) as AnchorHistoryResponse;

        if (!cancelled) setData(body);
      } catch (err: any) {
        console.error("Failed to load admin analytics chart:", err);
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
  }, [activeWindow, pairParam]);

  const derived = useMemo(() => {
    const pair = parsePairLabel(data?.pair ?? pairParam);
    const label = `${pair.quote}/${pair.base}`; // keeps your “USD/SSP” style label
    return { pair, label };
  }, [data?.pair, pairParam]);

  const overridesByDate = useMemo(() => {
    const m = new Map<string, number>();
    (data?.overrides ?? []).forEach((o) => m.set(o.date, o.mid));
    return m;
  }, [data?.overrides]);

  const historyByDate = useMemo(() => {
    const m = new Map<string, number>();
    (data?.history ?? []).forEach((h) => m.set(h.date, h.mid));
    return m;
  }, [data?.history]);

  const chartData = useMemo(() => {
    if (!data || !data.history || data.history.length === 0) return null;

    const labels = data.history.map((p) => p.date);

    const mainSeries = data.history.map((p) => p.mid);

    // Plot overrides as markers on top of the engine line
    const overrideMarkers = labels.map((d) =>
      overridesByDate.has(d) ? overridesByDate.get(d)! : null
    );

    return {
      labels,
      datasets: [
        {
          label: `${derived.label} mid`,
          data: mainSeries,
          borderWidth: 1.5,
          tension: 0.2,
          pointRadius: 0,
          borderColor: "rgba(255,255,255,0.85)",
          backgroundColor: "rgba(255,255,255,0.04)",
          fill: true,
        },
        {
          label: "Manual override",
          data: overrideMarkers,
          borderWidth: 0,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: "rgba(255,196,0,1)",
          pointBorderColor: "rgba(0,0,0,0.9)",
          pointBorderWidth: 1,
          showLine: false,
        },
      ],
    };
  }, [data, overridesByDate, derived.label]);

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

              // Dataset 1 = overrides
              if (item.datasetIndex === 1) {
                const date = item.label;
                const engineMid = date ? historyByDate.get(date) : undefined;
                const delta =
                  typeof engineMid === "number" ? y - engineMid : undefined;

                const base = `Manual fixing: ${y.toLocaleString(undefined, {
                  maximumFractionDigits: 3,
                })}`;

                if (delta == null || !Number.isFinite(delta)) return base;

                const sign = delta >= 0 ? "+" : "–";
                return `${base} (${sign}${Math.abs(delta).toLocaleString(undefined, {
                  maximumFractionDigits: 3,
                })} vs engine)`;
              }

              return `Mid: ${y.toLocaleString(undefined, {
                maximumFractionDigits: 3,
              })}`;
            },
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
    [historyByDate]
  );

  const overrideCount = data?.overrides?.length ?? 0;
  const rangeText = formatRange(data?.minDate, data?.maxDate);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-black/40 px-5 pb-4 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-zinc-200">
            Admin analytics
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Anchor-pair history for {derived.label} ({derived.pair.raw}), using live engine data.
          </p>
          {rangeText ? (
            <p className="mt-1 text-[11px] text-zinc-600">Range: {rangeText}</p>
          ) : null}
        </div>

        {/* Window selector */}
        <div className="inline-flex items-center gap-1 rounded-full bg-zinc-900/70 p-1 text-[11px]">
          {WINDOW_OPTIONS.map((w) => {
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
      </div>

      <div className="mt-2 h-56 w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2">
        {loading && (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            Loading {formatWindowLabel(activeWindow)} history…
          </div>
        )}

        {!loading && error && (
          <div className="flex h-full items-center justify-center text-xs text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && chartData && (
          <Line data={chartData} options={chartOptions} />
        )}

        {!loading && !error && !chartData && (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            No data available for this window.
          </div>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
        In this window, the system has{" "}
        <span className="font-semibold text-zinc-300">{overrideCount}</span>{" "}
        manual overrides captured in{" "}
        <span className="font-mono text-zinc-400">manual_fixings</span>. Days with overrides are
        highlighted as amber markers.
      </p>
    </section>
  );
}
