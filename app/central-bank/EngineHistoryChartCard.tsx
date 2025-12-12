"use client";

import React, { useEffect, useMemo, useState } from "react";

const WINDOWS = ["15d", "30d", "90d", "365d", "all"] as const;
type WindowKey = (typeof WINDOWS)[number];

type PairOption = {
  base: string;
  quote: string;
  label: string; // e.g. "USD/SSP"
  value: string; // e.g. "USDSSP" (storagePairKey)
};

type HistoryPoint = { date: string; mid: number };

type EngineHistoryResponse = {
  source?: string;
  window: string;
  pair: string;
  label?: string;
  storagePair?: { base: string; quote: string };
  minDate?: string;
  maxDate?: string;
  rawMinDate?: string;
  rawMaxDate?: string;
  pairs?: PairOption[];
  history?: HistoryPoint[];
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatNumber(n: number) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function buildPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) d += ` L ${points[i].x} ${points[i].y}`;
  return d;
}

function buildAreaPath(points: Array<{ x: number; y: number }>, height: number, bottomY: number) {
  if (points.length === 0) return "";
  const line = buildPath(points);
  const last = points[points.length - 1];
  const first = points[0];
  // Close area to baseline
  return `${line} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;
}

export default function EngineHistoryChartCard() {
  const [activePair, setActivePair] = useState<string>("USDSSP");
  const [windowKey, setWindowKey] = useState<WindowKey>("all");
  const [resp, setResp] = useState<EngineHistoryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/engine-history?window=${encodeURIComponent(windowKey)}&pair=${encodeURIComponent(
          activePair
        )}`;
        const r = await fetch(url, { method: "GET" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as EngineHistoryResponse;
        if (cancelled) return;
        setResp(j);
      } catch (e: any) {
        if (cancelled) return;
        setResp(null);
        setError(e?.message ?? "Failed to load history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [activePair, windowKey]);

  const pairs: PairOption[] = useMemo(() => {
    if (resp?.pairs?.length) return resp.pairs;
    // Safe fallback so the UI is not empty if the API doesn't include pairs.
    return [
      { value: "EURSSP", base: "SSP", quote: "EUR", label: "EUR/SSP" },
      { value: "GBPSSP", base: "SSP", quote: "GBP", label: "GBP/SSP" },
      { value: "KESSSP", base: "SSP", quote: "KES", label: "KES/SSP" },
      { value: "USDSSP", base: "SSP", quote: "USD", label: "USD/SSP" },
    ];
  }, [resp]);

  const pairLabel = useMemo(() => {
    const match = pairs.find((p) => p.value === activePair);
    return match?.label ?? resp?.label ?? "FX history";
  }, [pairs, activePair, resp]);

  const history: HistoryPoint[] = useMemo(() => {
    const raw = resp?.history ?? [];
    // Ensure chronological order for the SVG path.
    return [...raw].sort((a, b) => a.date.localeCompare(b.date));
  }, [resp]);

  const minDate = resp?.minDate ?? (history.length ? history[0].date : undefined);
  const maxDate = resp?.maxDate ?? (history.length ? history[history.length - 1].date : undefined);

  // --- SVG geometry (mirrors the simple chart component style) ---
  const width = 1000;
  const height = 260;
  const padding = 24;
  const topY = padding;
  const bottomY = height - padding;
  const leftX = padding;
  const rightX = width - padding;

  const values = useMemo(() => history.map((p) => p.mid).filter((n) => Number.isFinite(n)), [history]);
  const minV = values.length ? Math.min(...values) : 0;
  const maxV = values.length ? Math.max(...values) : 1;
  const span = maxV - minV || 1;

  const svgPoints = useMemo(() => {
    if (history.length === 0) return [] as Array<{ x: number; y: number }>;
    return history.map((p, i) => {
      const x = leftX + (history.length === 1 ? 0 : (i / (history.length - 1)) * (rightX - leftX));
      const y = bottomY - ((p.mid - minV) / span) * (bottomY - topY);
      return { x, y };
    });
  }, [history, leftX, rightX, bottomY, topY, minV, span]);

  const linePath = useMemo(() => buildPath(svgPoints), [svgPoints]);
  const areaPath = useMemo(() => buildAreaPath(svgPoints, height, bottomY), [svgPoints, height, bottomY]);

  const latest = history.length ? history[history.length - 1] : null;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-lg font-semibold">Engine history</div>
          <div className="text-xs text-white/60">
            {pairLabel} history{minDate && maxDate ? ` • Range: ${minDate} → ${maxDate}` : ""}
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 md:items-end">
          <div className="inline-flex rounded-full border border-zinc-800 bg-zinc-950 p-1">
            {WINDOWS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setWindowKey(k)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs transition",
                  windowKey === k ? "bg-zinc-100 text-black" : "text-zinc-300 hover:text-white"
                )}
              >
                {k}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-white/60">Pair</div>
            <select
              value={activePair}
              onChange={(e) => setActivePair(e.target.value)}
              className="rounded-full border border-white/10 bg-black px-3 py-2 text-xs text-white outline-none"
            >
              {pairs.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-3">
        {error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
            Failed to load history: {error}
          </div>
        ) : null}

        <div className="relative">
          <div className="flex items-center justify-between pb-2">
            <div className="text-xs text-white/60">
              {loading ? "Loading…" : latest ? `Latest: ${latest.date} • Mid: ${formatNumber(latest.mid)}` : "No data"}
            </div>
            <div className="text-xs text-white/50">Source: {resp?.source ?? "fx_daily_rates_default"}</div>
          </div>

          <div className="h-[260px] w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
            {history.length < 2 ? (
              <div className="flex h-full items-center justify-center text-xs text-white/60">No history available.</div>
            ) : (
              <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
                <defs>
                  <linearGradient id="fxArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="white" stopOpacity="0.22" />
                    <stop offset="90%" stopColor="white" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* subtle baseline */}
                <line
                  x1={leftX}
                  y1={bottomY}
                  x2={rightX}
                  y2={bottomY}
                  stroke="white"
                  strokeOpacity={0.12}
                  strokeWidth={2}
                />

                {/* area */}
                <path d={areaPath} fill="url(#fxArea)" />

                {/* line */}
                <path
                  d={linePath}
                  fill="none"
                  stroke="white"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {/* end-point dot */}
                {svgPoints.length ? (
                  <circle cx={svgPoints[svgPoints.length - 1].x} cy={svgPoints[svgPoints.length - 1].y} r={5} fill="white" />
                ) : null}
              </svg>
            )}
          </div>
        </div>

        <div className="mt-3 text-[11px] text-white/45">
          Note: This view mirrors the simplified FX history chart (single series, line + light area fill). Window selection is calendar-based.
        </div>
      </div>
    </div>
  );
}
