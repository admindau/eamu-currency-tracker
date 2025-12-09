"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  Legend,
  ChartOptions,
  ChartData,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  Legend
);

type WindowKey = "90d" | "365d";

type AnchorHistoryPoint = {
  date: string;
  mid: number;
};

type AnchorHistoryResponse = {
  pair: string;
  window: WindowKey;
  history: AnchorHistoryPoint[];
  overrides: AnchorHistoryPoint[];
};

const WINDOW_LABELS: Record<WindowKey, string> = {
  "90d": "90d",
  "365d": "365d",
};

const WINDOW_ORDER: WindowKey[] = ["90d", "365d"];

const PAIRS = [
  { id: "SSPUSD", label: "USD/SSP" },
  { id: "SSPKES", label: "KES/SSP" },
  { id: "SSPUGX", label: "UGX/SSP" },
  { id: "SSPRWF", label: "RWF/SSP" },
  { id: "SSPBIF", label: "BIF/SSP" },
];

export default function AdminAnalyticsCard() {
  const [pair, setPair] = useState<string>("SSPUSD");
  const [windowKey, setWindowKey] = useState<WindowKey>("365d");
  const [data, setData] = useState<AnchorHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch anchor history whenever pair/window changes
  useEffect(() => {
    const controller = new AbortController();

    async function fetchHistory() {
      try {
        setIsLoading(true);
        setError(null);

        const params = new URLSearchParams({
          pair,
          window: windowKey,
        });

        const res = await fetch(`/api/admin/anchor-history?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Request failed with status ${res.status}`);
        }

        const json = (await res.json()) as AnchorHistoryResponse;
        setData(json);
      } catch (err: any) {
        if (err.name === "AbortError") return;
        console.error("Failed to load anchor history", err);
        setError(err.message ?? "Failed to load anchor history");
      } finally {
        setIsLoading(false);
      }
    }

    fetchHistory();

    return () => controller.abort();
  }, [pair, windowKey]);

  const activePairMeta = useMemo(
    () => PAIRS.find((p) => p.id === pair) ?? PAIRS[0],
    [pair]
  );

  const chartData: ChartData<"line"> | null = useMemo(() => {
    if (!data || !data.history.length) return null;

    return {
      labels: data.history.map((p) => p.date),
      datasets: [
        {
          label: `${activePairMeta.label} mid anchor`,
          data: data.history.map((p) => p.mid),
          borderColor: "rgba(255,255,255,0.9)",
          backgroundColor: "rgba(255,255,255,0.12)",
          fill: true,
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 0,
        },
      ],
    };
  }, [data, activePairMeta.label]);

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
          mode: "index",
          intersect: false,
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y;
              if (v == null) return "";
              return `${activePairMeta.label}: ${v.toLocaleString("en-US", {
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
            color: "rgba(148,163,184,0.9)", // zinc-400
            maxTicksLimit: 6,
          },
        },
        y: {
          grid: {
            color: "rgba(39,39,42,0.7)", // zinc-800-ish
          },
          ticks: {
            color: "rgba(148,163,184,0.9)",
          },
        },
      },
    }),
    [activePairMeta.label]
  );

  const overrideCount = data?.overrides?.length ?? 0;

  return (
    <section className="flex flex-col rounded-2xl border border-zinc-800 bg-black/40 p-6 shadow-lg shadow-black/40">
      {/* Header: title + segmented controls */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Admin analytics
          </p>
          <p className="max-w-xl text-sm text-zinc-200">
            Volatility and anchor-pair history for{" "}
            <span className="font-semibold">{activePairMeta.label}</span>, using live
            engine data.
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          {/* Pair selector */}
          <div className="inline-flex rounded-full bg-zinc-900 p-1 text-[11px]">
            {PAIRS.map((p) => {
              const isActive = p.id === pair;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPair(p.id)}
                  className={[
                    "rounded-full px-3 py-1 transition",
                    isActive
                      ? "bg-zinc-100 text-black shadow-sm"
                      : "text-zinc-400 hover:text-zinc-100",
                  ].join(" ")}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Window selector – ONLY 90d & 365d */}
          <div className="inline-flex rounded-full bg-zinc-900 p-1 text-[11px]">
            {WINDOW_ORDER.map((w) => {
              const isActive = w === windowKey;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWindowKey(w)}
                  className={[
                    "rounded-full px-3 py-1 transition",
                    isActive
                      ? "bg-zinc-100 text-black shadow-sm"
                      : "text-zinc-400 hover:text-zinc-100",
                  ].join(" ")}
                >
                  {WINDOW_LABELS[w]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chart body */}
      <div className="h-56 sm:h-64">
        {isLoading && (
          <div className="flex h-full items-center justify-center text-xs text-zinc-400">
            Loading anchor history…
          </div>
        )}

        {!isLoading && error && (
          <div className="flex h-full items-center justify-center text-xs text-red-400">
            {error}
          </div>
        )}

        {!isLoading && !error && chartData && (
          <Line data={chartData} options={chartOptions} />
        )}

        {!isLoading && !error && !chartData && (
          <div className="flex h-full items-center justify-center text-xs text-zinc-400">
            No data available for this window.
          </div>
        )}
      </div>

      {/* Footnote */}
      <p className="mt-3 text-[11px] leading-snug text-zinc-500">
        In this window, the system has{" "}
        <span className="font-semibold text-zinc-300">
          {overrideCount} manual {activePairMeta.label} override
          {overrideCount === 1 ? "" : "s"}
        </span>{" "}
        captured in{" "}
        <code className="rounded bg-zinc-900 px-1 py-0.5 text-[10px] text-zinc-200">
          manual_fixings
        </code>
        . Use this together with the manual fixings table to see how policy actions
        intersect with market moves.
      </p>
    </section>
  );
}
