import FxHistoryChart from "@/components/fx-history-chart";
import {
  buildInsightsFromSummary,
  type MarketSummary,
} from "@/lib/fx/insights";

export const dynamic = "force-dynamic";

type HistoryResponse = {
  pair: string;
  base: string;
  quote: string;
  points: { date: string; mid: number }[];
  meta: { from: string; to: string; count: number };
};

function getApiBaseUrl() {
  if (process.env.NEXT_PUBLIC_FX_API_ORIGIN) {
    return process.env.NEXT_PUBLIC_FX_API_ORIGIN;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const base = getApiBaseUrl();
    const url = path.startsWith("http") ? path : `${base}${path}`;

    const res = await fetch(url, {
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`FX widget error for ${url}:`, res.status, await res.text());
      return null;
    }

    return (await res.json()) as T;
  } catch (err) {
    console.error(`FX widget fetch failed for ${path}:`, err);
    return null;
  }
}

export default async function UsdSspWidgetPage() {
  const [summary, history30] = await Promise.all([
    fetchJson<MarketSummary>(
      "/api/v1/summary/market?base=SSP&quote=USD"
    ),
    fetchJson<HistoryResponse>(
      "/api/v1/rates/history?base=SSP&quote=USD&days=30"
    ),
  ]);

  const mid = summary?.mid_rate ?? null;
  const change = summary?.change_pct_vs_previous ?? null;
  const asOf = summary?.as_of_date ?? "-";

  const series =
    history30?.points && history30.points.length > 1
      ? [
          {
            label: "30d",
            days: 30,
            points: history30.points,
          },
        ]
      : [];

  const insights = summary ? buildInsightsFromSummary(summary).slice(0, 2) : [];

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex items-center justify-center">
      <div className="w-[360px] rounded-2xl border border-zinc-800 bg-zinc-950/95 p-4 text-xs">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div>
            <p className="text-[0.6rem] uppercase tracking-[0.2em] text-zinc-500">
              Savvy Rilla FX API
            </p>
            <p className="text-xs font-medium text-zinc-100">USD / SSP</p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[0.6rem] font-medium text-emerald-400">
            Live v1
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 border-y border-zinc-800 py-3 mb-3">
          <div className="space-y-1">
            <p className="text-[0.6rem] uppercase tracking-[0.2em] text-zinc-500">
              Mid rate
            </p>
            <p className="text-base font-semibold">
              {mid
                ? mid.toLocaleString("en-US", { maximumFractionDigits: 4 })
                : "—"}
            </p>
            <p className="text-[0.6rem] text-zinc-500">{asOf}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[0.6rem] uppercase tracking-[0.2em] text-zinc-500">
              Day change
            </p>
            <p
              className={
                change == null
                  ? "text-sm"
                  : change >= 0
                  ? "text-sm font-medium text-emerald-400"
                  : "text-sm font-medium text-red-400"
              }
            >
              {change == null
                ? "—"
                : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
            </p>
            <p className="text-[0.6rem] text-zinc-500">vs previous fixing</p>
          </div>
        </div>

        {series.length > 0 && (
          <FxHistoryChart series={series} />
        )}

        {insights.length > 0 && (
          <div className="mt-3 border-t border-zinc-800 pt-2 space-y-1">
            {insights.map((line, idx) => (
              <p key={idx} className="text-[0.7rem] text-zinc-400">
                • {line}
              </p>
            ))}
          </div>
        )}

        <p className="mt-3 text-[0.6rem] text-zinc-600">
          Powered by /api/v1/summary/market & /api/v1/rates/history (Savvy
          Rilla FX API v1).
        </p>
      </div>
    </div>
  );
}
