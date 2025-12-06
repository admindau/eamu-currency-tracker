"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
  Legend
);

type SaveState = "idle" | "saving" | "success" | "error";

type FxRate = {
  id?: number;
  asOfDate: string;
  baseCurrency?: string;
  quoteCurrency: string;
  rateMid: number;
  isOfficial: boolean;
  isManualOverride?: boolean;
  created_at?: string;
};

type FxChartPoint = {
  date: string;
  rateMid: number;
};

type RangeKey = "30d" | "90d" | "365d" | "all";

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "365d", label: "365d" },
  { key: "all", label: "All" },
];

const RANGE_DAYS: Record<RangeKey, number | null> = {
  "30d": 30,
  "90d": 90,
  "365d": 365,
  all: null,
};

const CURRENCY_OPTIONS = ["USD", "EUR", "KES", "GBP"];

const CURRENCY_COLORS: Record<string, string> = {
  USD: "#ffffff",
  EUR: "#cccccc",
  KES: "#999999",
  GBP: "#777777",
};

/**
 * AI Insights Coach – right column panel
 */

type MarketSummary = {
  base: string;
  quote: string;
  as_of_date: string;
  mid_rate: number;
  change_pct_vs_previous: number | null;
  range: {
    window_days: number;
    high: number;
    low: number;
  };
  trend: {
    window_days: number;
    label: "Range-Bound" | "Uptrend" | "Downtrend" | string;
  };
  volatility: {
    window_days: number;
    avg_daily_move_pct: number | null;
  };
};

function AiInsightsCoach() {
  const [quote, setQuote] = useState<string>("USD");
  const [summary, setSummary] = useState<MarketSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/v1/summary/market?base=SSP&quote=${encodeURIComponent(quote)}`
        );
        const json = await res.json();

        if (!res.ok || json?.error) {
          if (!cancelled) {
            setError(
              json?.error?.message ||
                json?.error ||
                json?.message ||
                "Failed to load market summary."
            );
            setSummary(null);
            setLoading(false);
          }
          return;
        }

        if (!cancelled) {
          setSummary(json as MarketSummary);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.message || "Unexpected error while loading market summary."
          );
          setSummary(null);
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [quote]);

  function renderBody() {
    if (loading) {
      return (
        <p className="text-xs text-white/60">
          Thinking through the latest moves…
        </p>
      );
    }

    if (error) {
      return (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2">
          <p className="text-[11px] text-red-200 mb-1">
            {error || "Failed to load AI insights."}
          </p>
          <p className="text-[10px] text-red-100/80">
            Try switching the currency, or refreshing the page if this
            persists.
          </p>
        </div>
      );
    }

    if (!summary) {
      return (
        <p className="text-xs text-white/60">
          No data yet for this currency pair.
        </p>
      );
    }

    const { base, quote, as_of_date, mid_rate, change_pct_vs_previous } =
      summary;

    // --- change sentence ---
    let changeSentence: string;
    if (
      change_pct_vs_previous === null ||
      change_pct_vs_previous === undefined
    ) {
      changeSentence = "No previous fixing available for a comparison.";
    } else if (Math.abs(change_pct_vs_previous) < 0.01) {
      changeSentence = "Essentially unchanged versus the previous fixing.";
    } else {
      const direction = change_pct_vs_previous > 0 ? "higher" : "lower";
      changeSentence = `${direction} ${Math.abs(
        change_pct_vs_previous
      ).toFixed(2)}% versus the previous fixing.`;
    }

    // --- trend ---
    const trendLabel = summary.trend?.label ?? "Range-Bound";
    const trendWindow = summary.trend?.window_days ?? 3;
    let humanTrend: string;
    if (trendLabel === "Uptrend") {
      humanTrend = "short-term upward trend";
    } else if (trendLabel === "Downtrend") {
      humanTrend = "short-term downward trend";
    } else {
      humanTrend = "range-bound pattern";
    }

    // --- range ---
    const rangeHigh = summary.range?.high ?? null;
    const rangeLow = summary.range?.low ?? null;
    const rangeWindow = summary.range?.window_days ?? 7;

    // --- volatility ---
    const vol = summary.volatility?.avg_daily_move_pct ?? null;
    const volWindow = summary.volatility?.window_days ?? 30;

    let volLabel = "moderate";
    if (vol !== null) {
      if (vol < 0.15) volLabel = "very low";
      else if (vol < 0.35) volLabel = "low";
      else if (vol < 0.7) volLabel = "moderate";
      else if (vol < 1.2) volLabel = "elevated";
      else volLabel = "high";
    }

    // --- compact headline at the top of the card ---
    const headlineParts: string[] = [];

    if (trendLabel === "Uptrend") {
      headlineParts.push("SSP is weakening (uptrend)");
    } else if (trendLabel === "Downtrend") {
      headlineParts.push("SSP is strengthening (downtrend)");
    } else {
      headlineParts.push("FX looks range-bound");
    }

    if (vol !== null) {
      headlineParts.push(`${volLabel} volatility`);
    }

    if (
      change_pct_vs_previous !== null &&
      change_pct_vs_previous !== undefined &&
      Math.abs(change_pct_vs_previous) >= 0.1
    ) {
      const dailyDir = change_pct_vs_previous > 0 ? "higher" : "lower";
      headlineParts.push(
        `${dailyDir} ${Math.abs(change_pct_vs_previous).toFixed(2)}% vs last fix`
      );
    }

    const headline =
      headlineParts.length > 0
        ? headlineParts.join(" · ")
        : `${quote}/${base} snapshot`;

    return (
      <>
        {/* headline + chips row */}
        <p className="text-[11px] font-medium text-emerald-200 mb-1">
          {headline}
        </p>

        <div className="flex flex-wrap gap-1 mb-2 text-[10px]">
          <span className="inline-flex items-center rounded-full border border-white/30 px-2 py-0.5 text-white/80">
            <span className="mr-1 text-[9px]">📈</span>
            {humanTrend}
          </span>

          {rangeHigh !== null && rangeLow !== null && (
            <span className="inline-flex items-center rounded-full border border-white/20 px-2 py-0.5 text-white/75">
              <span className="mr-1 text-[9px]">📊</span>
              {rangeWindow}-day range&nbsp;
              <span className="font-mono">
                {rangeLow.toLocaleString("en-US", {
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 4,
                })}
              </span>
              &nbsp;–&nbsp;
              <span className="font-mono">
                {rangeHigh.toLocaleString("en-US", {
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 4,
                })}
              </span>
            </span>
          )}

          {vol !== null && (
            <span className="inline-flex items-center rounded-full border border-white/20 px-2 py-0.5 text-white/75">
              <span className="mr-1 text-[9px]">🌊</span>
              {volLabel} vol ·{" "}
              <span className="font-mono ml-1">{vol.toFixed(2)}%</span>
            </span>
          )}
        </div>

        {/* main narrative paragraph */}
        <p className="text-xs text-white/80 mb-2">
          As of{" "}
          <span className="font-mono">
            {as_of_date || "—"}
          </span>
          , the{" "}
          <span className="font-semibold">
            {quote}/{base}
          </span>{" "}
          mid rate is{" "}
          <span className="font-mono">
            {mid_rate.toLocaleString("en-US", {
              minimumFractionDigits: 4,
              maximumFractionDigits: 4,
            })}
          </span>
          . {changeSentence}
        </p>

        {/* bullet insights */}
        <ul className="space-y-1.5 text-[11px] text-white/75">
          <li>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/70 mr-1 align-middle" />
            Trend:{" "}
            <span className="font-medium">{humanTrend}</span> over the last{" "}
            {trendWindow} days.
          </li>

          {rangeHigh !== null && rangeLow !== null && (
            <li>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/70 mr-1 align-middle" />
              {rangeWindow}-day range:{" "}
              <span className="font-mono">
                {rangeLow.toLocaleString("en-US", {
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 4,
                })}
              </span>{" "}
              –{" "}
              <span className="font-mono">
                {rangeHigh.toLocaleString("en-US", {
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 4,
                })}
              </span>{" "}
              SSP per {quote}.
            </li>
          )}

          {vol !== null && (
            <li>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/70 mr-1 align-middle" />
              Volatility:{" "}
              <span className="font-medium">{volLabel}</span> — average daily
              move of{" "}
              <span className="font-mono">{vol.toFixed(2)}%</span> over the last{" "}
              {volWindow} days.
            </li>
          )}

          <li className="text-white/55">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/40 mr-1 align-middle" />
            Use this as a quick sense-check when entering new official rates or
            briefing stakeholders.
          </li>
        </ul>

        <p className="mt-2 text-[10px] text-white/45">
          These insights are descriptive, not a trading signal.
        </p>
      </>
    );
  }

  return (
    <div className="border border-white/10 rounded-xl p-4 bg-black/40 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white/85">
            AI Insights Coach
          </h2>
          <p className="text-[11px] text-white/60">
            Quick read of the FX tape for {quote}/SSP.
          </p>
        </div>

        <div className="flex flex-wrap gap-1 justify-end">
          {CURRENCY_OPTIONS.map((cur) => {
            const isActive = quote === cur;
            return (
              <button
                key={cur}
                type="button"
                onClick={() => setQuote(cur)}
                className={`px-2 py-0.5 rounded-full text-[10px] border ${
                  isActive
                    ? "bg-white text-black border-white"
                    : "bg-black text-white/70 border-white/30 hover:border-white/70"
                } transition-colors`}
              >
                {cur}
              </button>
            );
          })}
        </div>
      </div>

      {renderBody()}
    </div>
  );
}

/**
 * LEFT-COLUMN Smart Insights + Multi-series Chart
 */

function FxTrendChart() {
  const [selectedCurrency, setSelectedCurrency] = useState<string>("USD");
  const [activeCurrencies, setActiveCurrencies] = useState<string[]>(["USD"]);
  const [range, setRange] = useState<RangeKey>("90d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<Record<string, FxChartPoint[]>>({});
  const chartRef = useRef<any>(null);

  const [zoomReady, setZoomReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const mod = await import("chartjs-plugin-zoom");
      if (cancelled) return;
      const zoomPlugin = mod.default;
      ChartJS.register(zoomPlugin);
      setZoomReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function toggleCurrency(cur: string) {
    setSelectedCurrency(cur);
    setActiveCurrencies((prev) => {
      if (prev.includes(cur)) {
        if (prev.length === 1) return prev;
        return prev.filter((c) => c !== cur);
      }
      return [...prev, cur];
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        setLoading(true);
        setError(null);

        const nextSeries: Record<string, FxChartPoint[]> = {};

        for (const cur of CURRENCY_OPTIONS) {
          try {
            const res = await fetch(
              `/api/admin/chart-data?quote=${encodeURIComponent(
                cur
              )}&limit=365000`
            );
            const json = await res.json();

            if (!res.ok || json?.error) {
              console.error(
                `Error loading FX chart data for ${cur}:`,
                json?.error || json?.message
              );
              nextSeries[cur] = [];
            } else {
              nextSeries[cur] = json.points ?? [];
            }
          } catch (err: any) {
            console.error(
              `Unexpected error loading FX chart data for ${cur}:`,
              err
            );
            nextSeries[cur] = [];
          }
        }

        if (!cancelled) {
          setSeries(nextSeries);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.message || "Unexpected error while loading FX chart data."
          );
          setSeries({}),
            setLoading(false);
        }
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, []);

  function applyRangeFilter(points: FxChartPoint[]): FxChartPoint[] {
    if (!points.length) return [];
    const days = RANGE_DAYS[range];
    if (days == null || points.length <= days) {
      return points;
    }
    return points.slice(points.length - days);
  }

  const filteredSeries: Record<string, FxChartPoint[]> = {};
  CURRENCY_OPTIONS.forEach((cur) => {
    const pts = series[cur];
    if (pts && pts.length) {
      const filtered = applyRangeFilter(pts);
      if (filtered.length) filteredSeries[cur] = filtered;
    }
  });

  const dateSet = new Set<string>();
  activeCurrencies.forEach((cur) => {
    const pts = filteredSeries[cur];
    if (pts) pts.forEach((p) => dateSet.add(p.date));
  });

  const labels = Array.from(dateSet).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );

  const insights = (() => {
    const pts = filteredSeries[selectedCurrency];
    if (!pts || pts.length < 2) return null;

    const latest = pts[pts.length - 1];
    const prev = pts[pts.length - 2];

    if (!latest || !prev || prev.rateMid === 0) return null;

    const diff = latest.rateMid - prev.rateMid;
    const pct = (diff / prev.rateMid) * 100;
    const direction =
      Math.abs(diff) < 0.0001 ? "unchanged" : diff > 0 ? "higher" : "lower";
    const signWord = diff > 0 ? "up" : diff < 0 ? "down" : "unchanged";

    let primarySummary: string;
    if (direction === "unchanged") {
      primarySummary = `Latest ${selectedCurrency}/SSP mid rate is ${latest.rateMid.toLocaleString(
        "en-US",
        { minimumFractionDigits: 4, maximumFractionDigits: 4 }
      )}, unchanged versus the previous fixing.`;
    } else {
      primarySummary = `Latest ${selectedCurrency}/SSP mid rate is ${latest.rateMid.toLocaleString(
        "en-US",
        { minimumFractionDigits: 4, maximumFractionDigits: 4 }
      )}, ${signWord} ${Math.abs(pct).toFixed(
        2
      )}% compared to the previous fixing.`;
    }

    let high = pts[0].rateMid;
    let low = pts[0].rateMid;
    let highDate = pts[0].date;
    let lowDate = pts[0].date;

    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p.rateMid > high) {
        high = p.rateMid;
        highDate = p.date;
      }
      if (p.rateMid < low) {
        low = p.rateMid;
        lowDate = p.date;
      }
    }

    let daysUp = 0;
    let daysDown = 0;
    const pctMoves: number[] = [];

    for (let i = 1; i < pts.length; i++) {
      const prevPoint = pts[i - 1];
      const cur = pts[i];
      const move = cur.rateMid - prevPoint.rateMid;

      if (move > 0) daysUp++;
      else if (move < 0) daysDown++;

      if (prevPoint.rateMid !== 0) {
        const pctMove = (move / prevPoint.rateMid) * 100;
        pctMoves.push(Math.abs(pctMove));
      }
    }

    const volatilityPct =
      pctMoves.length > 0
        ? pctMoves.reduce((sum, v) => sum + v, 0) / pctMoves.length
        : 0;

    const first = pts[0];
    let trendLabel = "range-bound";
    if (first && first.rateMid !== 0) {
      const overallPct =
        ((latest.rateMid - first.rateMid) / first.rateMid) * 100;
      if (overallPct > 1) trendLabel = "upward trend";
      else if (overallPct < -1) trendLabel = "downward trend";
    }

    return {
      primarySummary,
      high,
      highDate,
      low,
      lowDate,
      daysUp,
      daysDown,
      volatilityPct,
      trendLabel,
    };
  })();

  function handleResetZoom() {
    const chart = (chartRef.current as any)?.chart || chartRef.current;
    if (chart && typeof chart.resetZoom === "function") {
      chart.resetZoom();
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't hijack "R" when the user is typing in a form field
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        const isEditable = (target as any).isContentEditable;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          isEditable
        ) {
          return;
        }
      }

      if (
        (e.key === "r" || e.key === "R") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        e.preventDefault();
        handleResetZoom();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (loading) {
    return (
      <div className="mt-3 border border-white/10 rounded-xl px-3 py-2">
        <p className="text-[11px] text-white/60">Loading FX trends…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 border border-white/10 rounded-xl px-3 py-2">
        <p className="text-[11px] text-red-300">
          {error || "Failed to load FX chart data."}
        </p>
      </div>
    );
  }

  if (!labels.length) {
    return (
      <div className="mt-3 border border-white/10 rounded-xl px-3 py-2">
        <p className="text-[11px] text-white/60">
          Not enough data yet to display trends.
        </p>
      </div>
    );
  }

  const datasets = activeCurrencies
    .filter((cur) => filteredSeries[cur] && filteredSeries[cur].length)
    .map((cur) => {
      const pts = filteredSeries[cur];
      const values = labels.map((date) => {
        const match = pts.find((p) => p.date === date);
        return match ? match.rateMid : null;
      });

      const color = CURRENCY_COLORS[cur] || "#ffffff";
      const isSelected = cur === selectedCurrency;

      return {
        label: `${cur}/SSP mid rate`,
        data: values,
        borderColor: color,
        backgroundColor: isSelected
          ? "rgba(255,255,255,0.12)"
          : "rgba(255,255,255,0.06)",
        pointRadius: isSelected ? 3 : 1.5,
        pointHoverRadius: isSelected ? 5 : 3,
        pointBackgroundColor: color,
        tension: 0.25,
        fill: false,
        borderWidth: isSelected ? 2.4 : 1.2,
        borderDash: isSelected ? [] : [4, 3],
      };
    });

  const data = { labels, datasets };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        ticks: {
          color: "rgba(255,255,255,0.7)",
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 5,
        },
        grid: {
          color: "rgba(255,255,255,0.08)",
        },
      },
      y: {
        ticks: {
          color: "rgba(255,255,255,0.7)",
        },
        grid: {
          color: "rgba(255,255,255,0.08)",
        },
      },
    },
    plugins: {
      legend: {
        display: true,
        labels: {
          color: "rgba(255,255,255,0.8)",
          font: { size: 10 },
        },
      },
      tooltip: {
        mode: "index" as const,
        intersect: false,
        backgroundColor: "rgba(0,0,0,0.9)",
        borderColor: "rgba(255,255,255,0.2)",
        borderWidth: 1,
        titleColor: "#ffffff",
        bodyColor: "#f5f5f5",
        callbacks: {
          label: (context: any) => {
            const v = context.parsed.y;
            if (typeof v === "number") {
              return ` ${v.toLocaleString("en-US", {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              })} SSP`;
            }
            return ` ${v} SSP`;
          },
        },
      },
      zoom: {
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          drag: { enabled: true },
          mode: "x",
        },
        pan: {
          enabled: true,
          mode: "x",
          modifierKey: "shift",
        },
        limits: {
          x: { minRange: 7 },
        },
      },
    },
  };

  return (
    <div className="mt-3 border border-white/10 rounded-xl bg-black/40 px-3 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-white/80 uppercase tracking-wide">
          Market snapshot
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {CURRENCY_OPTIONS.map((cur) => {
            const isSelected = selectedCurrency === cur;
            const isActive = activeCurrencies.includes(cur);
            return (
              <button
                key={cur}
                type="button"
                onClick={() => toggleCurrency(cur)}
                className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                  isActive
                    ? isSelected
                      ? "bg-white text-black border-white"
                      : "bg-black text-white border-white"
                    : "bg-black text-white/40 border-white/20"
                }`}
              >
                {cur}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setRange(opt.key)}
            className={`px-2 py-0.5 rounded-full text-[10px] border ${
              range === opt.key
                ? "bg-white text-black border-white"
                : "bg-black text-white/70 border-white/30 hover:border-white/70"
            } transition-colors`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {insights ? (
        <>
          <p className="text-[11px] text-white/80">
            {insights.primarySummary}
          </p>

          <div className="grid gap-2 sm:grid-cols-3 text-[11px]">
            <div className="rounded-lg border border-white/15 bg-black/50 px-2 py-1.5">
              <p className="text-white/60 mb-0.5">Range high / low</p>
              <p className="font-mono">
                {insights.high.toLocaleString("en-US", {
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 4,
                })}{" "}
                /{" "}
                {insights.low.toLocaleString("en-US", {
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 4,
                })}
              </p>
              <p className="text-[10px] text-white/50">
                High {insights.highDate} · Low {insights.lowDate}
              </p>
            </div>

            <div className="rounded-lg border border-white/15 bg-black/50 px-2 py-1.5">
              <p className="text-white/60 mb-0.5">Trend</p>
              <p className="font-mono capitalize">{insights.trendLabel}</p>
              <p className="text-[10px] text-white/50">
                {insights.daysUp} up days · {insights.daysDown} down days
              </p>
            </div>

            <div className="rounded-lg border border-white/15 bg-black/50 px-2 py-1.5">
              <p className="text-white/60 mb-0.5">Volatility</p>
              <p className="font-mono">
                {insights.volatilityPct.toFixed(2)}% avg daily move
              </p>
              <p className="text-[10px] text-white/50">
                Based on absolute day-to-day changes
              </p>
            </div>
          </div>
        </>
      ) : (
        <p className="text-[11px] text-white/60">
          Not enough data for {selectedCurrency} to generate insights yet.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/55 mt-1">
        <span>
          Scroll / pinch to zoom ·{" "}
          <span className="font-semibold">Shift + drag</span> to pan
        </span>
        <span className="flex items-center gap-1">
          Press{" "}
          <span className="inline-flex items-center justify-center rounded border border-white/40 px-1 py-0.5 font-mono text-[9px]">
            R
          </span>{" "}
          to reset zoom
        </span>
      </div>

      <div className="h-36 sm:h-40 md:h-44">
        {zoomReady ? (
          <Line ref={chartRef} data={data} options={options} />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-white/60">
            Loading chart…
          </div>
        )}
      </div>

      <div className="flex justify-end mt-1">
        <button
          type="button"
          onClick={handleResetZoom}
          className="px-3 py-1 text-[10px] rounded-full border border-white/30 text-white/70 hover:bg-white hover:text-black transition-colors"
        >
          Reset zoom
        </button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [authChecked, setAuthChecked] = useState(false);

  const [asOfDate, setAsOfDate] = useState<string>(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  });
  const [quoteCurrency, setQuoteCurrency] = useState<string>("USD");
  const [rateMid, setRateMid] = useState<string>("");
  const [isOfficial, setIsOfficial] = useState<boolean>(true);

  const [editMode, setEditMode] = useState(false);
  const [editingRateId, setEditingRateId] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const [rates, setRates] = useState<FxRate[]>([]);
  const [ratesState, setRatesState] = useState<"idle" | "loading" | "error">(
    "idle"
  );
  const [ratesError, setRatesError] = useState<string | null>(null);

  async function fetchRecentRates() {
    try {
      setRatesState("loading");
      setRatesError(null);
      const res = await fetch("/api/admin/recent-rates");
      const json = await res.json();
      if (!res.ok || json?.error) {
        setRatesState("error");
        setRatesError(
          json?.error || json?.message || "Failed to load recent FX rates."
        );
        setRates([]);
        return;
      }
      setRates(json?.data ?? []);
      setRatesState("idle");
    } catch (err: any) {
      setRatesState("error");
      setRatesError(
        err?.message || "Unexpected error while loading FX rates."
      );
      setRates([]);
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/admin/check");
        if (res.status === 401 && !cancelled) {
          window.location.href = "/admin/login";
          return;
        }
        if (!cancelled) {
          setAuthChecked(true);
          fetchRecentRates();
        }
      } catch {
        if (!cancelled) {
          window.location.href = "/admin/login";
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function resetFormToCreate() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const today = `${d.getFullYear()}-${mm}-${dd}`;

    setAsOfDate(today);
    setQuoteCurrency("USD");
    setRateMid("");
    setIsOfficial(true);

    setEditMode(false);
    setEditingRateId(null);
    setEditingLabel(null);
    setSaveState("idle");
    setMessage(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaveState("saving");
    setMessage(null);

    try {
      const parsedRate = Number(rateMid);
      if (!asOfDate || !quoteCurrency || !parsedRate || Number.isNaN(parsedRate)) {
        setSaveState("error");
        setMessage("Please fill in date, currency, and a valid numeric rate.");
        return;
      }

      const res = await fetch("/api/admin/manual-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asOfDate,
          quoteCurrency,
          rateMid: parsedRate,
          isOfficial,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || json?.error) {
        setSaveState("error");
        setMessage(json?.error || json?.message || "Failed to save FX rate.");
        return;
      }

      setSaveState("success");
      setMessage(
        editMode
          ? json?.message || "FX rate updated successfully."
          : json?.message || "FX rate saved successfully."
      );

      setEditMode(false);
      setEditingRateId(null);
      setEditingLabel(null);

      fetchRecentRates();
    } catch (err: any) {
      setSaveState("error");
      setMessage(
        err?.message
          ? `Unexpected error: ${err.message}`
          : "Unexpected error while saving FX rate."
      );
    }
  }

  function handleEdit(rate: FxRate) {
    setEditMode(true);
    setEditingRateId(rate.id ?? null);

    if (rate.asOfDate) setAsOfDate(rate.asOfDate);
    if (rate.quoteCurrency) setQuoteCurrency(rate.quoteCurrency.toUpperCase());
    if (typeof rate.rateMid === "number") {
      setRateMid(rate.rateMid.toString());
    } else {
      setRateMid(String(rate.rateMid ?? ""));
    }
    setIsOfficial(Boolean(rate.isOfficial));

    const label = `${rate.quoteCurrency} on ${rate.asOfDate}`;
    setEditingLabel(label);
    setSaveState("idle");
    setMessage(null);
  }

  async function handleDelete(id?: number) {
    if (!id) return;
    const confirmed = window.confirm("Delete this FX rate? This cannot be undone.");
    if (!confirmed) return;

    try {
      const res = await fetch("/api/admin/delete-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || json?.error) {
        alert(json?.error || json?.message || "Failed to delete FX rate.");
        return;
      }

      if (editingRateId === id) {
        resetFormToCreate();
      }

      fetchRecentRates();
    } catch (err: any) {
      alert(err?.message || "Unexpected error while deleting FX rate.");
    }
  }

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm text-white/70">Checking admin access…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white px-4 py-6 flex justify-center">
      <div className="w-full max-w-5xl border border-white/10 rounded-2xl p-5 sm:p-6 shadow-xl bg-white/5 flex flex-col">
        <header className="mb-4">
          <h1 className="text-2xl sm:text-3xl font-semibold text-center">
            Savvy Rilla FX – Admin
          </h1>
          <p className="mt-1 text-sm text-center text-white/70">
            Manual mid-rate entry for SSP vs global currencies.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* LEFT COLUMN */}
          <section className="flex flex-col">
            <form onSubmit={handleSubmit} className="space-y-4">
              {editMode && editingLabel && (
                <div className="rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 flex items-center justify-between gap-2">
                  <span>
                    Editing rate for{" "}
                    <span className="font-semibold">{editingLabel}</span>
                  </span>
                  <button
                    type="button"
                    onClick={resetFormToCreate}
                    className="text-[11px] underline decoration-dotted underline-offset-2"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* As-of date */}
              <div className="space-y-1">
                <label className="block text-sm font-medium">As of date</label>
                <input
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="w-full rounded-lg bg-black border border-white/20 px-3 py-2 text-sm outline-none focus:border-white focus:ring-1 focus:ring-white"
                  required
                />
                <p className="text-xs text-white/60">
                  Trading date the rate applies to.
                </p>
              </div>

              {/* Currency */}
              <div className="space-y-1">
                <label className="block text-sm font-medium">
                  Quote currency
                </label>
                <input
                  type="text"
                  value={quoteCurrency}
                  onChange={(e) =>
                    setQuoteCurrency(e.target.value.toUpperCase())
                  }
                  className="w-full rounded-lg bg-black border border-white/20 px-3 py-2 text-sm uppercase tracking-wide outline-none focus:border-white focus:ring-1 focus:ring-white"
                  placeholder="USD"
                  maxLength={10}
                  required
                />
                <p className="text-xs text-white/60">
                  Example: <span className="font-mono">USD</span>,{" "}
                  <span className="font-mono">EUR</span>,{" "}
                  <span className="font-mono">KES</span>. Base is assumed to be
                  SSP.
                </p>
              </div>

              {/* Mid rate */}
              <div className="space-y-1">
                <label className="block text-sm font-medium">Mid rate</label>
                <input
                  type="number"
                  step="0.0001"
                  value={rateMid}
                  onChange={(e) => setRateMid(e.target.value)}
                  className="w-full rounded-lg bg-black border border-white/20 px-3 py-2 text-sm outline-none focus:border-white focus:ring-1 focus:ring-white"
                  placeholder="1500.0000"
                  required
                />
                <p className="text-xs text-white/60">
                  SSP per {quoteCurrency || "quote currency"} (mid rate).
                </p>
              </div>

              {/* Mark as official */}
              <div className="flex items-center justify-between gap-3 border border-white/10 rounded-xl px-3 py-2">
                <div>
                  <p className="text-sm font-medium">
                    Mark as official rate
                  </p>
                  <p className="text-xs text-white/60">
                    If checked, this rate can be used as the official BoSS FX
                    reference.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOfficial((prev) => !prev)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border border-transparent transition-colors ${
                    isOfficial ? "bg-white" : "bg-white/20"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-black shadow ring-0 transition-transform ${
                      isOfficial ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Status message */}
              {message && (
                <div
                  className={`text-sm rounded-lg px-3 py-2 ${
                    saveState === "success"
                      ? "bg-emerald-500/10 text-emerald-200 border border-emerald-500/40"
                      : "bg-red-500/10 text-red-200 border border-red-500/40"
                  }`}
                >
                  {message}
                </div>
              )}

              {/* Save button */}
              <button
                type="submit"
                disabled={saveState === "saving"}
                className="w-full rounded-xl border border-white/40 bg-white text-black py-2.5 text-sm font-semibold tracking-wide disabled:opacity-60 disabled:cursor-not-allowed hover:bg-black hover:text-white hover:border-white transition-colors"
              >
                {saveState === "saving"
                  ? editMode
                    ? "Updating rate…"
                    : "Saving rate…"
                  : editMode
                  ? "Update FX rate"
                  : "Save FX rate"}
              </button>
            </form>

            <p className="mt-2 text-[11px] text-center text-white/50">
              Below is a live snapshot of SSP vs key currencies based on the
              latest entries.
            </p>

            <FxTrendChart />
          </section>

          {/* RIGHT COLUMN */}
          <section className="flex flex-col gap-4">
            <AiInsightsCoach />

            <div className="border border-white/10 rounded-xl p-4 sm:p-4 bg-black/40 flex flex-col">
              <div className="flex items-center justify-between mb-2 gap-3">
                <h2 className="text-sm font-semibold tracking-wide uppercase text-white/80">
                  Recent FX rates
                </h2>
                <button
                  type="button"
                  onClick={fetchRecentRates}
                  className="text-[11px] px-2 py-1 rounded-lg border border-white/20 hover:border-white hover:bg-white hover:text-black transition-colors"
                >
                  Refresh
                </button>
              </div>

              <div className="mt-2 flex-1 min-h-0 overflow-y-auto pr-1">
                {ratesState === "loading" && (
                  <p className="text-xs text-white/60">
                    Loading recent rates…
                  </p>
                )}

                {ratesState === "error" && (
                  <p className="text-xs text-red-300">
                    {ratesError || "Failed to load recent FX rates."}
                  </p>
                )}

                {ratesState !== "loading" &&
                  rates.length === 0 &&
                  !ratesError && (
                    <p className="text-xs text-white/60">
                      No FX rates have been entered yet.
                    </p>
                  )}

                {rates.length > 0 && (
                  <div className="mt-1 overflow-x-auto">
                    <table className="min-w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-white/15 text-white/70">
                          <th className="text-left py-1.5 pr-3 font-medium">
                            Date
                          </th>
                          <th className="text-left py-1.5 px-3 font-medium">
                            Currency
                          </th>
                          <th className="text-right py-1.5 px-3 font-medium">
                            Mid rate
                          </th>
                          <th className="text-center py-1.5 px-3 font-medium">
                            Official
                          </th>
                          <th className="text-right py-1.5 px-3 font-medium whitespace-nowrap">
                            Created at
                          </th>
                          <th className="text-right py-1.5 pl-3 font-medium">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rates.map((rate) => (
                          <tr
                            key={
                              rate.id ??
                              `${rate.asOfDate}-${rate.quoteCurrency}-${rate.created_at}`
                            }
                            className="border-b border-white/10 last:border-0"
                          >
                            <td className="py-1.5 pr-3 align-top">
                              <span className="font-mono text-[11px]">
                                {rate.asOfDate ?? "-"}
                              </span>
                            </td>
                            <td className="py-1.5 px-3 align-top">
                              <span className="font-mono text-[11px]">
                                {rate.quoteCurrency}
                              </span>
                            </td>
                            <td className="py-1.5 px-3 align-top text-right">
                              <span className="font-mono text-[11px]">
                                {typeof rate.rateMid === "number"
                                  ? rate.rateMid.toLocaleString("en-US", {
                                      minimumFractionDigits: 4,
                                      maximumFractionDigits: 4,
                                    })
                                  : rate.rateMid}
                              </span>
                            </td>
                            <td className="py-1.5 px-3 align-top text-center">
                              {rate.isOfficial ? (
                                <span className="inline-flex items-center justify-center rounded-full border border-emerald-400/70 px-2 py-0.5 text-[10px] text-emerald-200">
                                  Official
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center rounded-full border border-white/30 px-2 py-0.5 text-[10px] text-white/70">
                                  Unofficial
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-3 align-top text-right whitespace-nowrap">
                              <span className="font-mono text-[10px] text-white/70">
                                {rate.created_at
                                  ? new Date(
                                      rate.created_at
                                    ).toLocaleString("en-GB", {
                                      year: "2-digit",
                                      month: "2-digit",
                                      day: "2-digit",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "—"}
                              </span>
                            </td>
                            <td className="py-1.5 pl-3 align-top text-right space-x-1">
                              <button
                                type="button"
                                onClick={() => handleEdit(rate)}
                                className="text-[10px] px-2 py-0.5 rounded-lg border border-white/40 text-white/80 hover:bg-white hover:text-black transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(rate.id)}
                                className="text-[10px] px-2 py-0.5 rounded-lg border border-red-500/60 text-red-200 hover:bg-red-500 hover:text-black hover:border-red-500 transition-colors"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
