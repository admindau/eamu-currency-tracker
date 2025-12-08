'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js';
import 'chartjs-adapter-date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  TimeScale,
);

type WindowMode = '90d' | '365d' | 'all';

type HistoryPoint = {
  date: string;
  mid: number;
};

type MarkerPoint = {
  date: string;
  mid: number;
};

type PairOption = {
  id: string;
  label: string;
  base: string;
  quote: string;
};

// Central-bank focus pairs. You can tweak this list anytime.
const pairOptions: PairOption[] = [
  {
    id: 'USD/SSP',
    label: 'USD / SSP (anchor)',
    base: 'USD',
    quote: 'SSP',
  },
  {
    id: 'SSP/KES',
    label: 'SSP / KES',
    base: 'SSP',
    quote: 'KES',
  },
  {
    id: 'SSP/UGX',
    label: 'SSP / UGX',
    base: 'SSP',
    quote: 'UGX',
  },
  {
    id: 'SSP/RWF',
    label: 'SSP / RWF',
    base: 'SSP',
    quote: 'RWF',
  },
  {
    id: 'SSP/TZS',
    label: 'SSP / TZS',
    base: 'SSP',
    quote: 'TZS',
  },
  {
    id: 'SSP/BIF',
    label: 'SSP / BIF',
    base: 'SSP',
    quote: 'BIF',
  },
];

export function AdminAnalyticsCard() {
  const [mode, setMode] = useState<WindowMode>('365d');
  const [pairId, setPairId] = useState<string>('USD/SSP');
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [markers, setMarkers] = useState<MarkerPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePair =
    pairOptions.find((p) => p.id === pairId) ?? pairOptions[0];

  const pairLabel = `${activePair.base}/${activePair.quote}`;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          base: activePair.base,
          quote: activePair.quote,
          window: mode,
        });

        const res = await fetch(
          `/api/admin/anchor-history?${params.toString()}`,
          { cache: 'no-store' },
        );

        if (!res.ok) {
          throw new Error(
            `Failed to load anchor history (${res.status})`,
          );
        }

        const json = await res.json();

        // Try a few common shapes for history + overrides
        const historySource = Array.isArray(json)
          ? json
          : json.history ??
            json.points ??
            json.series ??
            json.data ??
            [];

        const parsedHistory: HistoryPoint[] = Array.isArray(historySource)
          ? (historySource
              .map((row: any) => {
                const date =
                  row.date ??
                  row.fixing_date ??
                  row.value_date ??
                  row.t;

                const midRaw =
                  row.mid ?? row.mid_rate ?? row.rate ?? row.value;

                const mid =
                  typeof midRaw === 'string'
                    ? parseFloat(midRaw)
                    : Number(midRaw);

                if (!date || !Number.isFinite(mid)) return null;

                return { date, mid };
              })
              .filter(Boolean) as HistoryPoint[])
          : [];

        const markersSource = Array.isArray(json)
          ? []
          : json.overrides ??
            json.markers ??
            json.manual_fixings ??
            json.manual ??
            [];

        const parsedMarkers: MarkerPoint[] = Array.isArray(markersSource)
          ? (markersSource
              .map((row: any) => {
                const date =
                  row.date ??
                  row.fixing_date ??
                  row.value_date ??
                  row.override_date;

                const midRaw =
                  row.mid ?? row.mid_rate ?? row.rate ?? row.value;

                const mid =
                  typeof midRaw === 'string'
                    ? parseFloat(midRaw)
                    : Number(midRaw);

                if (!date || !Number.isFinite(mid)) return null;

                return { date, mid };
              })
              .filter(Boolean) as MarkerPoint[])
          : [];

        if (!cancelled) {
          setHistory(parsedHistory);
          setMarkers(parsedMarkers);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? 'Failed to load analytics data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [mode, activePair.base, activePair.quote]);

  // Small helper to compute rolling std over a window
  function computeVolBands(values: number[], windowSize: number) {
    const upper: (number | null)[] = [];
    const lower: (number | null)[] = [];

    for (let i = 0; i < values.length; i++) {
      if (i + 1 < windowSize) {
        upper.push(null);
        lower.push(null);
        continue;
      }

      const start = i + 1 - windowSize;
      const slice = values.slice(start, i + 1);
      const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
      const variance =
        slice.reduce((s, v) => s + (v - mean) * (v - mean), 0) /
        slice.length;
      const sigma = Math.sqrt(variance);

      upper.push(mean + sigma);
      lower.push(mean - sigma);
    }

    return { upper, lower };
  }

  const chartData = useMemo(() => {
    const labels = history.map((p) => p.date);
    const engineData = history.map((p) => p.mid);

    const windowSize = 30;
    const { upper: volUpper, lower: volLower } = computeVolBands(
      engineData,
      windowSize,
    );

    const markerMap = new Map<string, number>();
    for (const m of markers) {
      markerMap.set(m.date, m.mid);
    }

    const markerData = labels.map((date) => {
      const v = markerMap.get(date);
      return v !== undefined ? v : null;
    });

    return {
      labels,
      datasets: [
        {
          label: `Engine fixing (${pairLabel})`,
          data: engineData,
          borderColor: 'rgba(255,255,255,0.9)',
          backgroundColor: 'rgba(255,255,255,0.08)',
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 0,
          pointHitRadius: 4,
        },
        {
          label: 'Volatility band (upper)',
          data: volUpper,
          borderColor: 'rgba(161,161,170,0.8)',
          backgroundColor: 'rgba(161,161,170,0.2)',
          borderWidth: 1,
          tension: 0.25,
          pointRadius: 0,
          borderDash: [6, 4],
        },
        {
          label: 'Volatility band (lower)',
          data: volLower,
          borderColor: 'rgba(161,161,170,0.8)',
          backgroundColor: 'rgba(161,161,170,0.2)',
          borderWidth: 1,
          tension: 0.25,
          pointRadius: 0,
          borderDash: [6, 4],
        },
        {
          label: 'Manual overrides',
          data: markerData,
          showLine: false,
          borderColor: 'rgba(34,197,94,1)',
          backgroundColor: 'rgba(34,197,94,1)',
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    } as any;
  }, [history, markers, pairLabel]);

  const options = useMemo(
    () =>
      ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index' as const,
          intersect: false,
        },
        scales: {
          x: {
            type: 'time' as const,
            time: {
              unit: mode === '90d' ? 'day' : 'month',
            },
            ticks: {
              color: '#a1a1aa',
            },
            grid: {
              color: 'rgba(39,39,42,0.4)',
            },
          },
          y: {
            ticks: {
              color: '#a1a1aa',
            },
            grid: {
              color: 'rgba(39,39,42,0.4)',
            },
          },
        },
        plugins: {
          legend: {
            labels: {
              color: '#e5e5e5',
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const value =
                  ctx.parsed.y?.toLocaleString?.() ?? ctx.parsed.y;

                switch (ctx.dataset.label) {
                  case `Engine fixing (${pairLabel})`:
                    return `Engine mid: ${value}`;
                  case 'Manual overrides':
                    return `Manual fixing: ${value}`;
                  case 'Volatility band (upper)':
                    return `Upper vol band: ${value}`;
                  case 'Volatility band (lower)':
                    return `Lower vol band: ${value}`;
                  default:
                    return `${ctx.dataset.label}: ${value}`;
                }
              },
            },
          },
        },
      }) as any,
    [mode, pairLabel],
  );

  const windowLabel =
    mode === '90d'
      ? 'the last 90 days'
      : mode === '365d'
      ? 'the last 365 days'
      : 'full available history';

  return (
    <section className="flex h-full flex-col rounded-2xl border border-zinc-800 bg-black/40 p-6">
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">
            Volatility and pair history for {pairLabel},
          </h2>
          <p className="text-xs text-zinc-500">
            using live engine data. Viewing {windowLabel}.
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          {/* Pair selector */}
          <div className="inline-flex flex-wrap justify-end gap-1">
            {pairOptions.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPairId(p.id)}
                className={`rounded-full px-3 py-1 text-[11px] transition ${
                  p.id === activePair.id
                    ? 'bg-white text-black'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Window selector */}
          <div className="inline-flex rounded-full bg-zinc-900 p-1 text-xs">
            {(['90d', '365d', 'all'] as WindowMode[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`rounded-full px-3 py-1 transition ${
                  mode === value
                    ? 'bg-emerald-500 text-black'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {value === 'all' ? 'All' : value}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="relative h-64 w-full sm:h-72 md:h-80">
        {error && (
          <div className="flex h-full items-center justify-center text-xs text-red-400">
            {error}
          </div>
        )}

        {!error && (
          <>
            {loading && history.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                Loading analytics…
              </div>
            ) : (
              <Line data={chartData} options={options} />
            )}
          </>
        )}
      </div>

      <p className="mt-3 text-[11px] text-zinc-500">
        In this window, the system has{' '}
        <span className="font-semibold">{markers.length}</span> manual{' '}
        {pairLabel} overrides captured in{' '}
        <code className="rounded bg-zinc-900 px-1">manual_fixings</code>.
        Days with overrides are highlighted as green markers. The grey dashed
        envelope shows a 30-day rolling volatility band around the engine
        fixing so you can see when the market is moving abnormally fast.
      </p>
    </section>
  );
}
