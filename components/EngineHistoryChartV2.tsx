"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  bucketVolPct,
  computeSeriesAnalytics,
  formatSigned,
} from "@/lib/fx/seriesAnalytics";
import {
  buildRegimeSegments,
  classifyRegimes,
  regimeStrokeFor,
} from "@/lib/fx/regimeDetection";
import {
  confidenceStyle,
  scoreConfidence,
  type ConfidenceResult,
} from "@/lib/fx/confidenceScoring";

type WindowKey = "15d" | "30d" | "90d" | "365d" | "all";
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

function volLabelFromBucket(v: ReturnType<typeof bucketVolPct>) {
  if (v === "low") return "Low (7d)";
  if (v === "elevated") return "Elevated (7d)";
  if (v === "high") return "High (7d)";
  return "Insufficient history";
}

export default function EngineHistoryChartV2() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const commentaryAbortRef = useRef<AbortController | null>(null);

  const [pair, setPair] = useState<string>("SSPUSD");
  const [windowKey, setWindowKey] = useState<WindowKey>("all");
  const [mode, setMode] = useState<Mode>("both");

  // Overlays
  const [showRegimes, setShowRegimes] = useState<boolean>(true);
  const [showVolatility, setShowVolatility] = useState<boolean>(false);
  const [showConfidence, setShowConfidence] = useState<boolean>(true);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [lockedIdx, setLockedIdx] = useState<number | null>(null);

  // Optional: retained for “locked metadata”
  const [selectedManual, setSelectedManual] = useState<ManualFixing | null>(
    null
  );

  // Phase 4 commentary state
  const [commentaryText, setCommentaryText] = useState<string | null>(null);
  const [commentaryLoading, setCommentaryLoading] = useState<boolean>(false);
  const [commentaryError, setCommentaryError] = useState<string | null>(null);
  const commentaryCacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);
      setHoverIdx(null);
      setLockedIdx(null);
      setSelectedManual(null);

      // Reset commentary when series changes
      setCommentaryText(null);
      setCommentaryError(null);
      setCommentaryLoading(false);
      commentaryAbortRef.current?.abort();
      commentaryAbortRef.current = null;

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

  const officialByDate = useMemo(() => {
    const m = new Map<string, number>();
    (data?.official ?? []).forEach((x) => m.set(x.date, x.mid));
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

  // Phase 1 analytics
  const analytics = useMemo(() => {
    if (!hasSeries) return [];
    return computeSeriesAnalytics(snapSeries, {
      volWindow: 7,
      jumpThresholdPct: 5,
      flatEpsilon: 0,
    });
  }, [hasSeries, snapSeries]);

  const maxVol = useMemo(() => {
    if (!analytics.length) return 0;
    return analytics.reduce((acc, a) => Math.max(acc, a.volPct ?? 0), 0);
  }, [analytics]);

  const volOverlayH = 28;

  // Phase 2 regimes
  const volBucketByIdx = (idx: number) =>
    bucketVolPct(analytics[idx]?.volPct ?? null);

  const hasManualOverrideByIdx = (idx: number) => {
    const pt = snapSeries[idx];
    if (!pt) return false;
    const mf = manualByDate.get(pt.date);
    return Boolean(mf?.isManualOverride);
  };

  const regimes = useMemo(() => {
    if (!hasSeries || analytics.length !== snapSeries.length) return [];
    return classifyRegimes(analytics, volBucketByIdx, hasManualOverrideByIdx, {
      slopeWindow: 14,
      driftSlopeAbsPctPerDay: 0.06,
      shockJumpThresholdPct: 5,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSeries, analytics, snapSeries, manualByDate]);

  const regimeSegments = useMemo(() => {
    if (!regimes.length) return [];
    return buildRegimeSegments(regimes);
  }, [regimes]);

  // Phase 3 confidence scoring
  const confidenceByIdx: ConfidenceResult[] = useMemo(() => {
    if (!hasSeries || analytics.length !== snapSeries.length) return [];

    return snapSeries.map((pt, idx) => {
      const mf = manualByDate.get(pt.date);
      const a = analytics[idx];
      const vb = volBucketByIdx(idx);
      const hasVolHistory = a?.volPct !== null && a?.volPct !== undefined;

      return scoreConfidence({
        idx,
        total: snapSeries.length,
        hasManualFixing: Boolean(mf),
        hasManualOverride: Boolean(mf?.isManualOverride),
        isJump: Boolean(a?.isJump),
        volBucket: vb,
        regimeKey: regimes[idx]?.key ?? "unknown",
        hasVolHistory,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSeries, analytics, snapSeries, manualByDate, regimes]);

  const confidenceDotIdxs = useMemo(() => {
    const n = snapSeries.length;
    if (!hasSeries || n < 2) return [];
    const step = Math.max(1, Math.ceil(n / 260)); // ~260 dots max
    const idxs: number[] = [];
    for (let i = 0; i < n; i += step) idxs.push(i);
    if (idxs[idxs.length - 1] !== n - 1) idxs.push(n - 1);
    return idxs;
  }, [hasSeries, snapSeries.length]);

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

  const activeA =
    activeIdx !== null && analytics.length > activeIdx
      ? analytics[activeIdx]
      : null;

  const activeRegime =
    activeIdx !== null && regimes.length > activeIdx ? regimes[activeIdx] : null;

  const activeConfidence =
    activeIdx !== null && confidenceByIdx.length > activeIdx
      ? confidenceByIdx[activeIdx]
      : null;

  // Styling
  const gridStroke = "rgba(255,255,255,0.08)";
  const axisStroke = "rgba(255,255,255,0.12)";
  const officialStroke = "rgba(255,255,255,0.92)";
  const effectiveStroke = "rgba(16,185,129,0.95)";
  const tooltipBg = "rgba(0,0,0,0.92)";

  // Regime rail geometry
  const regimeRailY = paddingY + 2;
  const regimeRailH = 6;

  // Phase 4: auto-generate AI commentary (debounced + cached + abortable)
  // Enhancement: when a manual fixing/override exists on the active date, generate a focused
  // "Official vs Manual" comparison analysis using deterministic deltas.
  useEffect(() => {
    if (!hasSeries || activeIdx === null || !activePoint) return;

    const modeLabel = formatMode(mode) as "Official" | "Effective" | "Both";

    const mf = activeManual;
    const officialMidRaw = officialByDate.get(activePoint.date) ?? null;

    const kind: "point_summary" | "official_vs_manual" =
      mf && officialMidRaw !== null ? "official_vs_manual" : "point_summary";

    // Deterministic comparison metrics (only used for official_vs_manual)
    const officialMid = kind === "official_vs_manual" ? officialMidRaw : null;
    const manualMid = kind === "official_vs_manual" ? mf!.mid : null;
    const absDiff =
      kind === "official_vs_manual" && officialMid !== null && manualMid !== null
        ? manualMid - officialMid
        : null;
    const pctDiff =
      kind === "official_vs_manual" &&
      officialMid !== null &&
      manualMid !== null &&
      officialMid !== 0
        ? (manualMid / officialMid - 1) * 100
        : null;

    const cacheKey = [
      "v2",
      kind,
      pair,
      windowKey,
      mode,
      activePoint.date,
      // round to reduce cache fragmentation
      String(Math.round(activePoint.mid * 1e6) / 1e6),
      officialMid !== null ? String(Math.round(officialMid * 1e6) / 1e6) : "na",
      manualMid !== null ? String(Math.round(manualMid * 1e6) / 1e6) : "na",
    ].join("|");

    const cached = commentaryCacheRef.current.get(cacheKey);
    if (cached) {
      setCommentaryText(cached);
      setCommentaryError(null);
      setCommentaryLoading(false);
      return;
    }

    commentaryAbortRef.current?.abort();
    const controller = new AbortController();
    commentaryAbortRef.current = controller;

    setCommentaryLoading(true);
    setCommentaryError(null);

    const vb = bucketVolPct(activeA?.volPct ?? null);
    const volLabel = volLabelFromBucket(vb);

    const manualLabel: "Manual override" | "Manual fixing" | "None" = mf
      ? mf.isManualOverride
        ? "Manual override"
        : "Manual fixing"
      : "None";

    const payload: any = {
      kind,
      pairLabel: data?.displayPair ?? "—",
      date: activePoint.date,
      mid: activePoint.mid,
      modeLabel,

      delta: activeA?.delta ?? null,
      pctDelta: activeA?.pctDelta ?? null,

      volPct: activeA?.volPct ?? null,
      volLabel,

      regimeLabel: activeRegime?.label ?? null,
      regimeReason: activeRegime?.reason ?? null,

      confidenceLabel: activeConfidence?.label ?? null,
      confidenceReasons: activeConfidence?.reasons ?? null,

      manualLabel,
    };

    if (kind === "official_vs_manual") {
      payload.officialMid = officialMid;
      payload.manualMid = manualMid;
      payload.absDiff = absDiff;
      payload.pctDiff = pctDiff;
    }

    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/engine-commentary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body?.error || `Request failed (${res.status})`);
        }

        const text = String(body?.text ?? "").trim();
        const finalText = text.length
          ? text
          : "No commentary generated for this point.";

        commentaryCacheRef.current.set(cacheKey, finalText);
        setCommentaryText(finalText);
        setCommentaryError(null);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        console.error("engine-commentary failed:", e);
        setCommentaryError(e?.message || "Failed to generate commentary");
        setCommentaryText(null);
      } finally {
        setCommentaryLoading(false);
      }
    }, 350);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasSeries,
    activeIdx,
    activePoint?.date,
    activePoint?.mid,
    pair,
    windowKey,
    mode,
    data?.displayPair,
    activeA?.delta,
    activeA?.pctDelta,
    activeA?.volPct,
    activeRegime?.label,
    activeRegime?.reason,
    activeConfidence?.label,
    activeManual?.id,
    // include official series presence for comparison
    official.length,
  ]);

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

          <div className="inline-flex items-center gap-1 rounded-full bg-zinc-900/70 p-1 text-[11px]">
            <button
              type="button"
              onClick={() => setShowRegimes((v) => !v)}
              className={[
                "rounded-full px-3 py-1 transition",
                showRegimes
                  ? "bg-zinc-100 text-black shadow-sm"
                  : "text-zinc-400 hover:text-zinc-100",
              ].join(" ")}
              title="Toggle regime rail"
            >
              Regimes
            </button>

            <button
              type="button"
              onClick={() => setShowVolatility((v) => !v)}
              className={[
                "rounded-full px-3 py-1 transition",
                showVolatility
                  ? "bg-zinc-100 text-black shadow-sm"
                  : "text-zinc-400 hover:text-zinc-100",
              ].join(" ")}
              title="Toggle volatility overlay"
            >
              Volatility
            </button>

            <button
              type="button"
              onClick={() => setShowConfidence((v) => !v)}
              className={[
                "rounded-full px-3 py-1 transition",
                showConfidence
                  ? "bg-zinc-100 text-black shadow-sm"
                  : "text-zinc-400 hover:text-zinc-100",
              ].join(" ")}
              title="Toggle confidence overlay"
            >
              Confidence
            </button>
          </div>
        </div>
      </div>

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
              viewBox={`0 0 ${width} ${height}`}
              className="h-56 w-full"
              onMouseMove={(e) => onMove(e.clientX)}
              onMouseLeave={() => setHoverIdx(null)}
              onClick={() => onSelect(hoverIdx ?? snapSeries.length - 1)}
              onTouchStart={(e) => onMove(e.touches[0].clientX)}
              onTouchEnd={() => onSelect(hoverIdx ?? snapSeries.length - 1)}
            >
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

              {/* Regime rail */}
              {showRegimes &&
                regimeSegments.length > 0 &&
                snapSeries.length >= 2 && (
                  <g aria-label="regime-rail">
                    {regimeSegments.map((seg, si) => {
                      const x1 = paddingX + seg.fromIdx * stepX;
                      const x2 = paddingX + seg.toIdx * stepX;
                      const w = Math.max(1, x2 - x1);
                      return (
                        <rect
                          key={`reg-${si}-${seg.fromIdx}-${seg.toIdx}`}
                          x={x1}
                          y={regimeRailY}
                          width={w}
                          height={regimeRailH}
                          rx={2}
                          fill={regimeStrokeFor(seg.key)}
                        />
                      );
                    })}
                  </g>
                )}

              {/* Volatility overlay */}
              {showVolatility &&
                maxVol > 0 &&
                analytics.length === snapSeries.length && (
                  <g aria-label="volatility-overlay">
                    {analytics.map((a, i) => {
                      if (i === 0) return null;
                      const v = a.volPct ?? 0;
                      if (!Number.isFinite(v) || v <= 0) return null;
                      const x = paddingX + i * stepX;
                      const h = (v / maxVol) * volOverlayH;
                      const y2 = height - paddingY;
                      const y1 = y2 - h;
                      return (
                        <line
                          key={`vol-${i}`}
                          x1={x}
                          y1={y1}
                          x2={x}
                          y2={y2}
                          stroke="rgba(255,255,255,0.18)"
                          strokeWidth={1}
                        />
                      );
                    })}
                  </g>
                )}

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

              {/* Confidence dots */}
              {showConfidence &&
                confidenceByIdx.length === snapSeries.length &&
                confidenceDotIdxs.length > 0 && (
                  <g aria-label="confidence-overlay">
                    {confidenceDotIdxs.map((i) => {
                      const pt = snapSeries[i];
                      const conf = confidenceByIdx[i];
                      if (!pt || !conf) return null;
                      const { x, y } = toXY(pt, i);
                      const style = confidenceStyle(conf.level);
                      return (
                        <circle
                          key={`c-${i}`}
                          cx={x}
                          cy={y}
                          r={style.r}
                          fill={style.fill}
                          stroke={style.stroke}
                          strokeWidth={1}
                          opacity={style.opacity}
                        />
                      );
                    })}
                  </g>
                )}

              {/* Manual markers */}
              {markerIdxs.map((i) => {
                const pt = snapSeries[i];
                const { x, y } = toXY(pt, i);
                const mm = manualByDate.get(pt.date)!;
                const r = mm.isManualOverride ? 4.5 : 3.5;
                const fill = mm.isManualOverride
                  ? "rgba(245,158,11,0.95)"
                  : "rgba(212,212,216,0.9)";
                return (
                  <circle key={pt.date} cx={x} cy={y} r={r} fill={fill} />
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

                {activeA?.pctDelta !== null &&
                activeA?.pctDelta !== undefined &&
                Number.isFinite(activeA.pctDelta) ? (
                  <div className="text-zinc-400 tabular-nums">
                    {formatSigned(activeA.pctDelta, 2)}%
                  </div>
                ) : null}

                {activeRegime ? (
                  <div className="text-zinc-400">{activeRegime.label}</div>
                ) : null}

                {activeConfidence ? (
                  <div className="text-zinc-400">
                    Confidence: {activeConfidence.label}
                  </div>
                ) : null}

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

          {/* AI Commentary */}
          <div className="mt-3 rounded-2xl border border-zinc-900 bg-black/30 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              AI Commentary
            </div>

            {activeManual && officialByDate.has(activePoint.date)
              ? (() => {
                  const om = officialByDate.get(activePoint.date)!;
                  const mm = activeManual.mid;
                  const abs = mm - om;
                  const pct = om !== 0 ? (mm / om - 1) * 100 : null;
                  return (
                    <div className="mt-2 rounded-xl border border-zinc-900 bg-black/20 px-3 py-2">
                      <div className="grid gap-1 sm:grid-cols-2">
                        <div className="text-[11px] text-zinc-500">Official</div>
                        <div className="text-[12px] text-zinc-200 tabular-nums">
                          {om.toLocaleString()}
                        </div>

                        <div className="text-[11px] text-zinc-500">
                          {activeManual.isManualOverride
                            ? "Manual override"
                            : "Manual fixing"}
                        </div>
                        <div className="text-[12px] text-zinc-200 tabular-nums">
                          {mm.toLocaleString()}
                        </div>

                        <div className="text-[11px] text-zinc-500">Deviation</div>
                        <div className="text-[12px] text-zinc-200 tabular-nums">
                          {abs > 0 ? "+" : abs < 0 ? "−" : ""}
                          {Math.abs(abs).toLocaleString("en-US", {
                            maximumFractionDigits: 6,
                          })}
                          {pct !== null && Number.isFinite(pct) ? (
                            <span className="ml-2 text-[11px] text-zinc-500">
                              ({formatSigned(pct, 2)}%)
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })()
              : null}

            {commentaryLoading ? (
              <div className="mt-2 text-[12px] text-zinc-500">
                Generating commentary…
              </div>
            ) : commentaryError ? (
              <div className="mt-2 text-[12px] text-red-400">
                {commentaryError}
              </div>
            ) : commentaryText ? (
              <div className="mt-2 text-[12px] leading-relaxed text-zinc-200">
                {commentaryText}
                <div className="mt-2 text-[11px] text-zinc-600">
                  Based on engine signals (regime, confidence, volatility, deltas,
                  and manual entries).
                </div>
              </div>
            ) : (
              <div className="mt-2 text-[12px] text-zinc-500">
                No commentary available.
              </div>
            )}
          </div>

          {/* Regime */}
          {activeRegime ? (
            <div className="mt-3 rounded-xl border border-zinc-900 bg-black/30 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                Regime
              </div>
              <div className="mt-1 text-[12px] text-zinc-200">
                {activeRegime.label}
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-500">
                {activeRegime.reason}
              </div>
            </div>
          ) : null}

          {/* Confidence */}
          {activeConfidence ? (
            <div className="mt-2 rounded-xl border border-zinc-900 bg-black/30 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                Confidence
              </div>
              <div className="mt-1 text-[12px] text-zinc-200">
                {activeConfidence.label}
              </div>
              {activeConfidence.reasons.length ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-zinc-500">
                  {activeConfidence.reasons.slice(0, 4).map((r, i) => (
                    <li key={`${r}-${i}`}>{r}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {/* Analytics */}
          {activeA ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-zinc-900 bg-black/30 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  Δ Day
                </div>
                <div className="mt-1 text-[12px] text-zinc-200 tabular-nums">
                  {activeA.delta === null || !Number.isFinite(activeA.delta)
                    ? "—"
                    : `${activeA.delta > 0 ? "+" : activeA.delta < 0 ? "−" : ""}${Math.abs(
                        activeA.delta
                      ).toLocaleString("en-US", { maximumFractionDigits: 6 })}`}
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-500 tabular-nums">
                  {activeA.pctDelta === null ||
                  !Number.isFinite(activeA.pctDelta)
                    ? ""
                    : `${formatSigned(activeA.pctDelta, 2)}%`}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-900 bg-black/30 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  Volatility
                </div>
                <div className="mt-1 text-[12px] text-zinc-200 tabular-nums">
                  {activeA.volPct === null || !Number.isFinite(activeA.volPct)
                    ? "—"
                    : `${activeA.volPct.toFixed(3)}%`}
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-500">
                  {volLabelFromBucket(bucketVolPct(activeA.volPct))}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-900 bg-black/30 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  Flags
                </div>
                <div className="mt-1 text-[12px] text-zinc-200">
                  {activeA.isJump ? "Discontinuity" : "—"}
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-500">
                  {activeA.flatRun > 0 ? `Flat run: ${activeA.flatRun}` : ""}
                </div>
              </div>
            </div>
          ) : null}

          {/* Manual details (activeManual) */}
          {activeManual ? (
            <div className="mt-3 space-y-1 text-[12px] text-zinc-300">
              <div>
                <span className="text-zinc-500">Type:</span>{" "}
                {activeManual.isManualOverride
                  ? "Manual override"
                  : "Manual fixing"}
              </div>
              <div>
                <span className="text-zinc-500">Created:</span>{" "}
                <span className="tabular-nums">
                  {new Date(activeManual.createdAt).toLocaleString()}
                </span>
              </div>
              {activeManual.createdEmail && (
                <div>
                  <span className="text-zinc-500">By:</span>{" "}
                  {activeManual.createdEmail}
                </div>
              )}
              <div>
                <span className="text-zinc-500">Notes:</span>{" "}
                {activeManual.notes ?? "—"}
              </div>

              {selectedManual && activeManual.id !== selectedManual.id ? (
                <div className="pt-1 text-[11px] text-zinc-500">
                  Note: a different manual entry is currently locked via click
                  selection.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-2 text-[12px] text-zinc-500">
              No manual fixing/override for this date.
            </div>
          )}
        </div>
      ) : null}

      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
        Phase 4 adds auto-generated AI commentary via a server route using the
        OpenAI Responses API. When a manual entry exists, the model compares
        Official vs Manual using deterministic deviation metrics.
      </p>
    </section>
  );
}
