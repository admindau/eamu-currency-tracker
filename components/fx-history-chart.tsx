"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type HistoryPoint = { date: string; mid: number };

type ManualFixingPoint = {
  id: string;
  date: string;
  mid: number;
  isOfficial: boolean;
  isManualOverride: boolean;
  notes: string | null;
  createdAt: string;
  createdEmail: string | null;
};

type EnrichedPoint = {
  date: string;
  mid: number;
  source: "official" | "manual_fixing" | "manual_override";
  manual?: ManualFixingPoint;
};

type Series = {
  label: string;
  days: number;
  points: HistoryPoint[];
};

type WindowKey = "90d" | "365d" | "all";

type SeriesProps = {
  series: Series[];
  base?: undefined;
  quote?: undefined;
  window?: undefined;
  interactive?: boolean;
  showTooltip?: boolean;
  onPointSelect?: (p: EnrichedPoint) => void;
};

type FetchProps = {
  series?: undefined;
  base: string;
  quote: string;
  window: WindowKey;
  interactive?: boolean;
  showTooltip?: boolean;
  onPointSelect?: (p: EnrichedPoint) => void;
};

type Props = SeriesProps | FetchProps;

type AnchorHistoryResponse = {
  pair: string;
  window: WindowKey;
  minDate: string;
  maxDate: string;
  history: { date: string; mid: number }[];
  manualFixings: ManualFixingPoint[];
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatSource(p: EnrichedPoint) {
  if (p.source === "manual_override") return "Manual override";
  if (p.source === "manual_fixing") return "Manual fixing";
  return "Official";
}

export default function FxHistoryChart(props: Props) {
  const isSeriesMode = "series" in props && props.series !== undefined;
  const isFetchMode = !isSeriesMode;
  const variant: "full" | "compact" = isFetchMode ? "compact" : "full";

  const interactive = props.interactive ?? false;
  const showTooltip = props.showTooltip ?? true;
  const onPointSelect = props.onPointSelect;

  const [fetchedSeries, setFetchedSeries] = useState<Series[] | null>(null);
  const [fetchedManualFixings, setFetchedManualFixings] = useState<ManualFixingPoint[] | null>(null);

  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState<string>(
    isSeriesMode && props.series.length > 0 ? props.series[0].label : ""
  );

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [lockedIndex, setLockedIndex] = useState<number | null>(null);

  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Fetch branch for base/quote/window mode (used by EAMU cards)
  useEffect(() => {
    if (isSeriesMode) {
      setFetchedSeries(null);
      setFetchedManualFixings(null);
      setFetchError(null);
      const series = (props as SeriesProps).series;
      const firstLabel = series && series.length > 0 ? series[0].label : "";
      setActiveLabel(firstLabel);
      return;
    }

    const { base, quote, window } = props as FetchProps;
    if (!base || !quote || !window) return;

    setLoading(true);
    setFetchError(null);

    const pair = `${base}${quote}`.toUpperCase();

    fetch(`/api/admin/anchor-history?pair=${pair}&window=${window}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }
        return (await res.json()) as AnchorHistoryResponse;
      })
      .then((json) => {
        const pts: HistoryPoint[] = (json.history ?? []).map((h) => ({
          date: h.date,
          mid: h.mid,
        }));

        const days = window === "90d" ? 90 : window === "365d" ? 365 : pts.length;

        const s: Series = {
          label: window,
          days,
          points: pts,
        };

        setFetchedSeries([s]);
        setFetchedManualFixings(json.manualFixings ?? []);
        setActiveLabel(window);

        // Reset hover/lock when series changes
        setHoverIndex(null);
        setLockedIndex(null);
      })
      .catch((err) => {
        console.error("FxHistoryChart fetch error:", err);
        setFetchError("Unable to load history.");
        setFetchedSeries(null);
        setFetchedManualFixings(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isSeriesMode, props]);

  const series: Series[] = isSeriesMode ? (props as SeriesProps).series : fetchedSeries ?? [];

  const activeSeries = useMemo(() => {
    if (!series || series.length === 0) return undefined;
    if (!activeLabel) return series[0];
    return series.find((s) => s.label === activeLabel) ?? series[0];
  }, [activeLabel, series]);

  const manualFixingsByDate = useMemo(() => {
    const map = new Map<string, ManualFixingPoint>();
    (fetchedManualFixings ?? []).forEach((m) => {
      map.set(m.date, m);
    });
    return map;
  }, [fetchedManualFixings]);

  const enrichedPoints: EnrichedPoint[] = useMemo(() => {
    // Series-mode does not carry manual metadata; treat as official.
    if (!activeSeries) return [];

    return activeSeries.points.map((p) => {
      const m = manualFixingsByDate.get(p.date);
      if (!m) return { date: p.date, mid: p.mid, source: "official" as const };

      // Effective series: manual fixing replaces official on that date.
      const src = m.isManualOverride ? ("manual_override" as const) : ("manual_fixing" as const);
      return {
        date: p.date,
        mid: m.mid,
        source: src,
        manual: m,
      };
    });
  }, [activeSeries, manualFixingsByDate]);

  const activePointIndex = lockedIndex ?? hoverIndex;

  // Utility: compute nearest index from pointer X (in SVG viewBox coords)
  function indexFromX(x: number, paddingX: number, stepX: number, count: number) {
    if (count <= 1) return 0;
    const idx = Math.round((x - paddingX) / stepX);
    return clamp(idx, 0, count - 1);
  }

  function handleMove(
    clientX: number,
    paddingX: number,
    stepX: number,
    count: number,
    width: number
  ) {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    const x = (px / rect.width) * width;
    const idx = indexFromX(x, paddingX, stepX, count);
    setHoverIndex(idx);
  }

  function handleLeave() {
    setHoverIndex(null);
  }

  function handleSelect(idx: number) {
    setLockedIndex(idx);
    const p = enrichedPoints[idx];
    if (p && onPointSelect) onPointSelect(p);
  }

  // -------------------------------
  // COMPACT MODE (cards)
  // -------------------------------
  if (variant === "compact") {
    // Skeleton while loading or before data lands
    if (loading && enrichedPoints.length < 2) {
      return (
        <div className="h-full w-full rounded-full bg-gradient-to-r from-neutral-900/80 via-neutral-800/40 to-neutral-900/80 animate-pulse" />
      );
    }

    if (fetchError || enrichedPoints.length < 2) {
      return <div className="h-full w-full rounded-full bg-neutral-900/60" />;
    }

    const points = enrichedPoints;

    const mids = points.map((p) => p.mid);
    const min = Math.min(...mids);
    const max = Math.max(...mids);
    const range = max - min || 1;

    const width = 260;
    const height = 32;
    const paddingX = 4;
    const paddingY = 6;
    const innerWidth = width - paddingX * 2;
    const innerHeight = height - paddingY * 2;

    const stepX = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;

    const svgPoints = points.map((p, index) => {
      const x = paddingX + index * stepX;
      const normalized = (p.mid - min) / range;
      const y = paddingY + innerHeight - normalized * innerHeight;
      return { x, y };
    });

    const pathData = svgPoints
      .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
      .join(" ");

    const idx = activePointIndex ?? points.length - 1;
    const active = points[idx];
    const activeXY = svgPoints[idx];

    // Only show tooltip on hover in compact mode, not locked (cards should remain light)
    const shouldShowTooltip = showTooltip && hoverIndex !== null && active && activeXY;

    const manualMarkerIdxs = points
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.source !== "official")
      .map(({ i }) => i);

    return (
      <div ref={wrapperRef} className="relative h-full w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-full w-full"
          aria-hidden="true"
          onMouseMove={(e) => handleMove(e.clientX, paddingX, stepX, points.length, width)}
          onMouseLeave={handleLeave}
        >
          <defs>
            <linearGradient id="fxCardAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fafafa" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#18181b" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path
            d={
              pathData +
              ` L ${svgPoints[svgPoints.length - 1].x} ${height - paddingY}` +
              ` L ${svgPoints[0].x} ${height - paddingY} Z`
            }
            fill="url(#fxCardAreaGradient)"
            stroke="none"
          />

          {/* Line */}
          <path d={pathData} fill="none" stroke="#f4f4f5" strokeWidth={1.4} strokeLinecap="round" />

          {/* Manual markers */}
          {manualMarkerIdxs.map((i) => (
            <circle key={i} cx={svgPoints[i].x} cy={svgPoints[i].y} r={1.6} fill="#fafafa" opacity={0.9} />
          ))}

          {/* Active hover marker */}
          {hoverIndex !== null && (
            <circle cx={activeXY.x} cy={activeXY.y} r={2.2} fill="#fafafa" />
          )}

          {/* Interaction overlay (keeps events reliable) */}
          <rect x={0} y={0} width={width} height={height} fill="transparent" />
        </svg>

        {shouldShowTooltip && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-neutral-800 bg-black/90 px-2 py-1 text-[10px] text-neutral-100 shadow-lg"
            style={{
              left: `${(activeXY.x / width) * 100}%`,
              top: `-6px`,
            }}
          >
            <div className="text-neutral-300">{active.date}</div>
            <div className="tabular-nums">{active.mid.toLocaleString()}</div>
            <div className="text-neutral-400">{formatSource(active)}</div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------
  // FULL MODE (hero chart)
  // -------------------------------
  if (!activeSeries || enrichedPoints.length < 2) {
    if (loading && series.length === 0) {
      return (
        <div className="mt-3 rounded-2xl border border-zinc-900 bg-zinc-950/80 p-4">
          <div className="h-40 w-full rounded-xl bg-gradient-to-r from-zinc-900/80 via-zinc-800/40 to-zinc-900/80 animate-pulse" />
          <div className="mt-2 flex justify-between text-[0.6rem] text-zinc-600">
            <span className="h-3 w-10 rounded bg-zinc-900/60 animate-pulse" />
            <span className="h-3 w-16 rounded bg-zinc-900/60 animate-pulse" />
            <span className="h-3 w-10 rounded bg-zinc-900/60 animate-pulse" />
          </div>
        </div>
      );
    }

    if (fetchError && series.length === 0) {
      return (
        <div className="mt-3 rounded-xl border border-zinc-900 bg-zinc-950 px-3 py-2 text-[0.75rem] text-zinc-500">
          History not available yet for this window.
        </div>
      );
    }

    return (
      <div className="mt-3 rounded-xl border border-zinc-900 bg-zinc-950 px-3 py-2 text-[0.75rem] text-zinc-500">
        Not enough historical data to render chart yet.
      </div>
    );
  }

  const points = enrichedPoints;

  const mids = points.map((p) => p.mid);
  const min = Math.min(...mids);
  const max = Math.max(...mids);
  const range = max - min || 1;

  const width = 260;
  const height = 72;
  const paddingX = 6;
  const paddingY = 6;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;

  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;

  const svgPoints = points.map((p, index) => {
    const x = paddingX + index * stepX;
    const normalized = (p.mid - min) / range;
    const y = paddingY + innerHeight - normalized * innerHeight;
    return { x, y };
  });

  const pathData = svgPoints
    .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
    .join(" ");

  const firstDate = points[0]?.date ?? "";
  const lastDate = points[points.length - 1]?.date ?? "";

  const idx = activePointIndex ?? points.length - 1;
  const active = points[idx];
  const activeXY = svgPoints[idx];

  const manualMarkerIdxs = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.source !== "official")
    .map(({ i }) => i);

  const shouldShowTooltip =
    showTooltip &&
    activePointIndex !== null &&
    active !== undefined &&
    activeXY !== undefined &&
    (hoverIndex !== null || lockedIndex !== null);

  return (
    <div className="mt-3 space-y-2">
      {series.length > 1 && (
        <div className="flex items-center justify-between gap-2 text-[0.7rem]">
          <p className="text-zinc-400">USD/SSP history</p>
          <div className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950 p-1">
            {series.map((s) => {
              const isActive = s.label === activeLabel;
              return (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setActiveLabel(s.label)}
                  className={
                    "rounded-full px-2 py-0.5 text-[0.65rem] transition " +
                    (isActive ? "bg-zinc-100 text-black" : "text-zinc-400 hover:text-zinc-100")
                  }
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div ref={wrapperRef} className="relative rounded-2xl border border-zinc-900 bg-zinc-950 px-3 py-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          aria-hidden="true"
          onMouseMove={(e) => handleMove(e.clientX, paddingX, stepX, points.length, width)}
          onMouseLeave={handleLeave}
          onClick={() => {
            if (!interactive) return;
            const i = hoverIndex ?? (points.length - 1);
            handleSelect(i);
          }}
          onTouchStart={(e) => {
            if (!interactive) return;
            const touch = e.touches[0];
            handleMove(touch.clientX, paddingX, stepX, points.length, width);
          }}
          onTouchEnd={() => {
            if (!interactive) return;
            const i = hoverIndex ?? (points.length - 1);
            handleSelect(i);
          }}
        >
          {/* Background mid-line */}
          <line
            x1={paddingX}
            y1={height / 2}
            x2={width - paddingX}
            y2={height / 2}
            stroke="#27272a"
            strokeWidth={0.5}
          />

          {/* Area fill */}
          <path
            d={
              pathData +
              ` L ${svgPoints[svgPoints.length - 1].x} ${height - paddingY}` +
              ` L ${svgPoints[0].x} ${height - paddingY} Z`
            }
            fill="url(#fxAreaGradient)"
            stroke="none"
          />

          {/* Line */}
          <path d={pathData} fill="none" stroke="#fafafa" strokeWidth={1.4} strokeLinecap="round" />

          {/* Manual markers */}
          {manualMarkerIdxs.map((i) => (
            <circle key={i} cx={svgPoints[i].x} cy={svgPoints[i].y} r={2} fill="#fafafa" opacity={0.95} />
          ))}

          {/* Active crosshair */}
          {(hoverIndex !== null || lockedIndex !== null) && (
            <>
              <line
                x1={activeXY.x}
                y1={paddingY}
                x2={activeXY.x}
                y2={height - paddingY}
                stroke="#3f3f46"
                strokeWidth={0.7}
              />
              <circle cx={activeXY.x} cy={activeXY.y} r={2.4} fill="#fafafa" />
            </>
          )}

          <defs>
            <linearGradient id="fxAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fafafa" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#18181b" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Interaction overlay */}
          <rect x={0} y={0} width={width} height={height} fill="transparent" />
        </svg>

        {shouldShowTooltip && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 rounded-xl border border-neutral-800 bg-black/90 px-3 py-2 text-[11px] text-neutral-100 shadow-lg"
            style={{
              left: `${(activeXY.x / width) * 100}%`,
              top: `8px`,
            }}
          >
            <div className="text-neutral-300">{active.date}</div>
            <div className="tabular-nums">{active.mid.toLocaleString()}</div>
            <div className="text-neutral-400">{formatSource(active)}</div>
            {active.source !== "official" && active.manual?.createdEmail && (
              <div className="text-neutral-500">By: {active.manual.createdEmail}</div>
            )}
          </div>
        )}

        <div className="mt-1 flex items-center justify-between text-[0.6rem] text-zinc-500">
          <span>{firstDate}</span>
          <span className="text-zinc-400">
            {min.toFixed(2)} – {max.toFixed(2)}
          </span>
          <span>{lastDate}</span>
        </div>
      </div>
    </div>
  );
}
