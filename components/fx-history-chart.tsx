"use client";

import { useEffect, useMemo, useState } from "react";

type HistoryPoint = { date: string; mid: number };

type Series = {
  label: string; // e.g. "30d", "90d", "365d"
  days: number;
  points: HistoryPoint[];
};

type WindowKey = "90d" | "365d" | "all";

type SeriesProps = {
  series: Series[];
  base?: undefined;
  quote?: undefined;
  window?: undefined;
};

type FetchProps = {
  series?: undefined;
  base: string;
  quote: string;
  window: WindowKey;
};

type Props = SeriesProps | FetchProps;

type AnchorHistoryResponse = {
  pair: string;
  window: WindowKey;
  minDate: string;
  maxDate: string;
  history: { date: string; mid: number }[];
  overrides: { date: string; mid: number }[];
};

export default function FxHistoryChart(props: Props) {
  const isSeriesMode = "series" in props && props.series !== undefined;
  const isFetchMode = !isSeriesMode;
  const variant: "full" | "compact" = isFetchMode ? "compact" : "full";

  const [fetchedSeries, setFetchedSeries] = useState<Series[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState<string>(
    isSeriesMode && props.series.length > 0 ? props.series[0].label : ""
  );

  // Fetch branch for base/quote/window mode (used by EAMU cards)
  useEffect(() => {
    if (isSeriesMode) {
      setFetchedSeries(null);
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

        const days =
          window === "90d" ? 90 : window === "365d" ? 365 : pts.length;

        const s: Series = {
          label: window,
          days,
          points: pts,
        };

        setFetchedSeries([s]);
        setActiveLabel(window);
      })
      .catch((err) => {
        console.error("FxHistoryChart fetch error:", err);
        setFetchError("Unable to load history.");
        setFetchedSeries(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isSeriesMode, props]);

  const series: Series[] = isSeriesMode
    ? (props as SeriesProps).series
    : fetchedSeries ?? [];

  const activeSeries = useMemo(() => {
    if (!series || series.length === 0) return undefined;
    if (!activeLabel) return series[0];
    return series.find((s) => s.label === activeLabel) ?? series[0];
  }, [activeLabel, series]);

  // -------------------------------
  // COMPACT MODE (cards)
  // -------------------------------
  if (variant === "compact") {
    // Skeleton while loading or before data lands
    if (
      loading &&
      (!activeSeries || !activeSeries.points || activeSeries.points.length < 2)
    ) {
      return (
        <div className="h-full w-full rounded-full bg-gradient-to-r from-neutral-900/80 via-neutral-800/40 to-neutral-900/80 animate-pulse" />
      );
    }

    // If error or still not enough points after load → neutral placeholder bar
    if (
      fetchError ||
      !activeSeries ||
      !activeSeries.points ||
      activeSeries.points.length < 2
    ) {
      return (
        <div className="h-full w-full rounded-full bg-neutral-900/60" />
      );
    }

    const points = activeSeries.points;
    const mids = points.map((p) => p.mid);
    const min = Math.min(...mids);
    const max = Math.max(...mids);
    const range = max - min || 1;

    const width = 260;
    const height = 32; // slightly taller for smoother curve in cards
    const paddingX = 4;
    const paddingY = 6;
    const innerWidth = width - paddingX * 2;
    const innerHeight = height - paddingY * 2;

    const stepX =
      points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;

    const svgPoints = points.map((p, index) => {
      const x = paddingX + index * stepX;
      const normalized = (p.mid - min) / range;
      const y = paddingY + innerHeight - normalized * innerHeight;
      return { x, y };
    });

    const pathData = svgPoints
      .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
      .join(" ");

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id="fxCardAreaGradient"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
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
        <path
          d={pathData}
          fill="none"
          stroke="#f4f4f5"
          strokeWidth={1.4}
          strokeLinecap="round"
        />

        {/* Last point */}
        {svgPoints.length > 0 && (
          <circle
            cx={svgPoints[svgPoints.length - 1].x}
            cy={svgPoints[svgPoints.length - 1].y}
            r={2}
            fill="#fafafa"
          />
        )}
      </svg>
    );
  }

  // -------------------------------
  // FULL MODE (hero chart)
  // -------------------------------

  if (!activeSeries || !activeSeries.points || activeSeries.points.length < 2) {
    // Skeleton while loading and nothing to show yet
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

  const points = activeSeries.points;

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

  const stepX =
    points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;

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

  const chartSvg = (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      aria-hidden="true"
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
      <path
        d={pathData}
        fill="none"
        stroke="#fafafa"
        strokeWidth={1.4}
        strokeLinecap="round"
      />

      {/* Last point */}
      {svgPoints.length > 0 && (
        <circle
          cx={svgPoints[svgPoints.length - 1].x}
          cy={svgPoints[svgPoints.length - 1].y}
          r={2}
          fill="#fafafa"
        />
      )}

      <defs>
        <linearGradient id="fxAreaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fafafa" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#18181b" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );

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
                    (isActive
                      ? "bg-zinc-100 text-black"
                      : "text-zinc-400 hover:text-zinc-100")
                  }
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-zinc-900 bg-zinc-950 px-3 py-2">
        {chartSvg}
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
