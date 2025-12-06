"use client";

import { useMemo, useState } from "react";

type HistoryPoint = { date: string; mid: number };

type Series = {
  label: string; // "30d", "90d", "365d"
  days: number;
  points: HistoryPoint[];
};

type Props = {
  series: Series[];
};

export default function FxHistoryChart({ series }: Props) {
  const [activeLabel, setActiveLabel] = useState<string>(
    series[0]?.label ?? "30d"
  );

  const activeSeries = useMemo(
    () => series.find((s) => s.label === activeLabel) ?? series[0],
    [activeLabel, series]
  );

  if (!activeSeries || !activeSeries.points || activeSeries.points.length < 2) {
    return (
      <div className="mt-2 rounded-xl border border-zinc-900 bg-zinc-950 px-3 py-2 text-[0.75rem] text-zinc-500">
        Not enough historical data to render chart yet.
      </div>
    );
  }

  const points = activeSeries.points;

  const mids = points.map((p) => p.mid);
  const min = Math.min(...mids);
  const max = Math.max(...mids);

  // Avoid flat line if all values identical
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

  return (
    <div className="mt-3 space-y-2">
      {/* Header + toggle */}
      <div className="flex items-center justify-between gap-2 text-[0.7rem]">
        <p className="text-zinc-400">USD/SSP history</p>
        <div className="inline-flex items-center gap-1 rounded-full bg-zinc-950 p-1 border border-zinc-800">
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

      {/* Chart */}
      <div className="rounded-xl border border-zinc-900 bg-zinc-950 px-3 py-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          aria-hidden="true"
        >
          {/* Background line */}
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
            <linearGradient
              id="fxAreaGradient"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#fafafa" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#18181b" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

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
