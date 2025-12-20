"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type WindowKey = "15d" | "30d" | "30d" | "90d" | "365d" | "all";
type Mode = "official" | "effective" | "both";

type Point = { date: string; mid: number };

type ManualFixing = {
  id: string;
  date: string;
  mid: number;
  isOfficial: boolean;
  isManualOverride: boolean;
  notes: string | null;
  createdAt: string;
  createdEmail: string | null;
};

type ApiResponse = {
  source: string;
  window: WindowKey;
  pair: string; // base+quote e.g. SSPUSD
  displayPair: string; // e.g. USD/SSP
  minDate: string;
  maxDate: string;
  official: Point[];
  effective: Point[];
  manualFixings: ManualFixing[];
};

const WINDOWS: WindowKey[] = ["15d", "30d", "90d", "365d", "all"];
const MODES: Mode[] = ["official", "effective", "both"];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeRangeText(minDate?: string, maxDate?: string) {
  if (!minDate || !maxDate) return "";
  if (minDate === maxDate) return minDate;
  return `${minDate} → ${maxDate}`;
}

function formatMode(m: Mode) {
  if (m === "official") return "Official";
  if (m === "effective") return "Effective";
  return "Both";
}

export default function EngineHistoryChartV2() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Keep value convention consistent with baseline chart: base+quote (SSPUSD)
  const [pair, setPair] = useState<string>("SSPUSD");
  const [windowKey, setWindowKey] = useState<WindowKey>("all");
  const [mode, setMode] = useState<Mode>("both");

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [lockedIdx, setLockedIdx] = useState<number | null>(null);
  const [selectedManual, setSelectedManual] = useState<ManualFixing | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);
      setHoverIdx(null);
      setLockedIdx(null);
      setSelectedManual(null);

      try {
        const res = await fetch(
          `/api/admin/engine-history-v2?window=${encodeURIComponent(
            windowKey
          )}&pair=${encodeURIComponent(pair)}`,
          { method: "GET", cache: "no-store" }
        );

        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body?.error || `Request failed (${res.status})`);
        }

        if (!cancelled) setData(body as ApiResponse);
      } catch (e: any) {
        console.error("Engine history v2 load failed:", e);
        if (!cancelled) {
          setErr(e?.message || "Failed to load engine history (v2)");
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
  }, [pair, windowKey]);

  const manualByDate = useMemo(() => {
    const m = new Map<string, ManualFixing>();
    (data?.manualFixings ?? []).forEach((x) => m.set(x.date, x));
    return m;
  }, [data]);

  const official = data?.official ?? [];
  const effective = data?.effective ?? [];

  const primarySeries = useMemo(() => {
    if (mode === "effective") return effective;
    return official;
  }, [mode, official, effective]);

  // For snapping/inspection: prefer effective when showing both
  const snapSeries = useMemo(() => {
    if (mode === "both") return effective.length ? effective : official;
    return primarySeries;
  }, [mode, primarySeries, official, effective]);

  const hasSeries = snapSeries.length >= 2;

  // SVG layout
  const width = 920;
  const height = 260;
  const paddingX = 14;
  const paddingY = 14;
  const innerW = width - paddingX * 2;
  const innerH = height - paddingY * 2;

  const mids = hasSeries ? snapSeries.map((p) => p.mid) : [];
  const min = mids.length ? Math.min(...mids) : 0;
  const max = mids.length ? Math.max(...mids) : 1;
  const range = max - min || 1;

  const stepX = hasSeries ? innerW / (snapSeries.length - 1) : innerW;

  const toXY = (p: Point, idx: number) => {
    const x = paddingX + idx * stepX;
    const t = (p.mid - min) / range;
    const y = paddingY + innerH - t * innerH;
    return { x, y };
  };

  const pathFor = (pts: Point[]) => {
    if (pts.length < 2) return "";
    return pts
      .map((p, i) => {
        const { x, y } = toXY(p, i);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  };

  const pathOfficial = hasSeries ? pathFor(official) : "";
  const pathEffective = hasSeries ? pathFor(effective) : "";

  function clientXToIndex(clientX: number) {
    const el = wrapperRef.current;
    if (!el || !hasSeries) return 0;
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    const x = (px / rect.width) * width;
    const idx = Math.round((x - paddingX) / stepX);
    return clamp(idx, 0, Math.max(0, snapSeries.length - 1));
  }

  function onMove(clientX: number) {
    if (!hasSeries) return;
    setHoverIdx(clientXToIndex(clientX));
  }

  function onSelect(idx: number) {
    if (!hasSeries) return;
    const safeIdx = clamp(idx, 0, snapSeries.length - 1);
    setLockedIdx(safeIdx);

    const p = snapSeries[safeIdx];
    const m = p ? manualByDate.get(p.date) ?? null : null;
    setSelectedManual(m);
  }

  const rangeText = safeRangeText(data?.minDate, data?.maxDate);

  const markerIdxs = hasSeries
    ? snapSeries
        .map((pt, i) => ({ pt, i }))
        .filter(({ pt }) => manualByDate.has(pt.date))
        .map(({ i }) => i)
    : [];

  const activeIdx = hasSeries
    ? lockedIdx ?? hoverIdx ?? snapSeries.length - 1
    : null;

  const activePoint = activeIdx !== null ? snapSeries[activeIdx] : null;
  const activeXY =
    activePoint && activeIdx !== null ? toXY(activePoint, activeIdx) : null;
  const activeManual = activePoint
    ? manualByDate.get(activePoint.date) ?? null
    : null;

  // Styling tuned for black UI
  const gridStroke = "rgba(255,255,255,0.08)";
  const axisStroke = "rgba(255,255,255,0.12)";
  const officialStroke = "rgba(255,255,255,0.92)";
  const effectiveStroke = "rgba(16,185,129,0.95)"; // emerald
  const tooltipBg = "rgba(0,0,0,0.92)";

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-black/40 px-5 pb-4 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-wide text-zinc-200">
            Engine history (v2: overlays + inspection)
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Hover to view values. Click/tap to lock a point and inspect manual
            fixings and overrides.
          </p>
          {rangeText ? (
            <p className="mt-1 text-[11px] text-zinc-600">Range: {rangeText}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-full bg-zinc-900/70 p-1 text-[11px]">
            {WINDOWS.map((w) => {
              const isActive = windowKey === w;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWindowKey(w)}
                  className={[
                    "rounded-full px-3 py-1 transition",
                    isActive
                      ? "bg-emerald-500 text-black shadow-sm"
                      : "text-zinc-400 hover:text-zinc-100",
                  ].join(" ")}
                >
                  {w === "all" ? "All" : w}
                </button>
              );
            })}
          </div>

          <div className="inline-flex items-center gap-1 rounded-full bg-zinc-900/70 p-1 text-[11px]">
            {MODES.map((mm) => {
              const isActive = mode === mm;
              return (
                <button
                  key={mm}
                  type="button"
                  onClick={() => setMode(mm)}
                  className={[
                    "rounded-full px-3 py-1 transition",
                    isActive
                      ? "bg-zinc-100 text-black shadow-sm"
                      : "text-zinc-400 hover:text-zinc-100",
                  ].join(" ")}
                >
                  {formatMode(mm)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pair selector */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[11px] text-zinc-500">Pair</span>
          <select
            value={pair}
            onChange={(e) => setPair(e.target.value)}
            className="max-w-[260px] truncate rounded-xl border border-zinc-800 bg-black px-3 py-2 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
          >
            {[
              { label: "USD/SSP", value: "SSPUSD" },
              { label: "EUR/SSP", value: "SSPEUR" },
              { label: "KES/SSP", value: "SSPKES" },
              { label: "UGX/SSP", value: "SSPUGX" },
              { label: "TZS/SSP", value: "SSPTZS" },
              { label: "RWF/SSP", value: "SSPRWF" },
              { label: "BIF/SSP", value: "SSPBIF" },
            ].map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {data?.source ? (
          <span className="text-[11px] text-zinc-600">
            Source:{" "}
            <span className="font-mono text-zinc-500">
              {data.source} + manual_fixings
            </span>
          </span>
        ) : null}
      </div>

      <div
        ref={wrapperRef}
        className="mt-1 w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-3"
      >
        {loading && (
          <div className="flex h-56 items-center justify-center text-xs text-zinc-500">
            Loading {windowKey === "all" ? "All" : windowKey}…
          </div>
        )}

        {!loading && err && (
          <div className="flex h-56 items-center justify-center text-xs text-red-400">
            {err}
          </div>
        )}

        {!loading && !err && hasSeries && (
          <div className="relative">
            <svg
              // ✅ FIXED: correct viewBox
              viewBox={`0 0 ${width} ${height}`}
              className="h-56 w-full"
              onMouseMove={(e) => onMove(e.clientX)}
              onMouseLeave={() => setHoverIdx(null)}
              onClick={() => onSelect(hoverIdx ?? snapSeries.length - 1)}
              onTouchStart={(e) => onMove(e.touches[0].clientX)}
              onTouchEnd={() => onSelect(hoverIdx ?? snapSeries.length - 1)}
            >
              {/* subtle grid */}
              {Array.from({ length: 5 }).map((_, i) => {
                const y = paddingY + (innerH * i) / 4;
                return (
                  <line
                    key={`gy-${i}`}
                    x1={paddingX}
                    y1={y}
                    x2={width - paddingX}
                    y2={y}
                    stroke={gridStroke}
                    strokeWidth={1}
                  />
                );
              })}
              <line
                x1={paddingX}
                y1={height - paddingY}
                x2={width - paddingX}
                y2={height - paddingY}
                stroke={axisStroke}
                strokeWidth={1}
              />

              {(mode === "official" || mode === "both") && (
                <path
                  d={pathOfficial}
                  fill="none"
                  stroke={officialStroke}
                  strokeWidth={2.25}
                  strokeLinecap="round"
                />
              )}

              {(mode === "effective" || mode === "both") && (
                <path
                  d={pathEffective}
                  fill="none"
                  stroke={effectiveStroke}
                  strokeWidth={2.25}
                  strokeLinecap="round"
                />
              )}

              {/* Manual markers */}
              {markerIdxs.map((i) => {
                const pt = snapSeries[i];
                const { x, y } = toXY(pt, i);
                const mm = manualByDate.get(pt.date)!;
                const r = mm.isManualOverride ? 4.5 : 3.5;
                const fill = mm.isManualOverride
                  ? "rgba(245,158,11,0.95)" // amber
                  : "rgba(212,212,216,0.9)"; // zinc
                return (
                  <circle
                    key={pt.date}
                    cx={x}
                    cy={y}
                    r={r}
                    fill={fill}
                  />
                );
              })}

              {/* Crosshair */}
              {activeXY && (
                <>
                  <line
                    x1={activeXY.x}
                    y1={paddingY}
                    x2={activeXY.x}
                    y2={height - paddingY}
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth={1}
                  />
                  <circle
                    cx={activeXY.x}
                    cy={activeXY.y}
                    r={4.5}
                    fill="rgba(255,255,255,0.95)"
                  />
                </>
              )}

              <rect
                x={0}
                y={0}
                width={width}
                height={height}
                fill="transparent"
              />
            </svg>

            {/* Tooltip */}
            {activeXY && activePoint && (
              <div
                className="pointer-events-none absolute -translate-x-1/2 rounded-xl border border-zinc-800 px-3 py-2 text-[11px] text-zinc-100 shadow-lg"
                style={{
                  left: `${(activeXY.x / width) * 100}%`,
                  top: 10,
                  background: tooltipBg,
                }}
              >
                <div className="text-zinc-300">{activePoint.date}</div>
                <div className="tabular-nums">
                  {activePoint.mid.toLocaleString()}
                </div>
                {activeManual ? (
                  <div className="text-zinc-400">
                    {activeManual.isManualOverride
                      ? "Manual override"
                      : "Manual fixing"}
                  </div>
                ) : (
                  <div className="text-zinc-500">Official</div>
                )}
              </div>
            )}
          </div>
        )}

        {!loading && !err && !hasSeries && (
          <div className="flex h-56 items-center justify-center text-xs text-zinc-500">
            Not enough data to render.
          </div>
        )}
      </div>

      {/* Inspector */}
      {!loading && !err && hasSeries && activePoint ? (
        <div className="rounded-2xl border border-zinc-900 bg-black/40 p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            Inspector
          </div>

          <div className="mt-1 text-sm text-zinc-100">
            {activePoint.date} •{" "}
            <span className="tabular-nums">
              {activePoint.mid.toLocaleString()}
            </span>
          </div>

          {selectedManual ? (
            <div className="mt-2 space-y-1 text-[12px] text-zinc-300">
              <div>
                <span className="text-zinc-500">Type:</span>{" "}
                {selectedManual.isManualOverride
                  ? "Manual override"
                  : "Manual fixing"}
              </div>
              <div>
                <span className="text-zinc-500">Created:</span>{" "}
                <span className="tabular-nums">
                  {new Date(selectedManual.createdAt).toLocaleString()}
                </span>
              </div>
              {selectedManual.createdEmail && (
                <div>
                  <span className="text-zinc-500">By:</span>{" "}
                  {selectedManual.createdEmail}
                </div>
              )}
              <div>
                <span className="text-zinc-500">Notes:</span>{" "}
                {selectedManual.notes ?? "—"}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-[12px] text-zinc-500">
              No manual fixing/override for this date.
            </div>
          )}
        </div>
      ) : null}

      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
        v2 adds an “All” window and overlays from{" "}
        <span className="font-mono">manual_fixings</span>. Use “Effective” to see
        applied overrides.
      </p>
    </section>
  );
}
