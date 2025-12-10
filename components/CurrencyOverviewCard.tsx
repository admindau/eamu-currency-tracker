// app/components/CurrencyOverviewCard.tsx
import React from "react";

type EamuRate = {
  code: string;
  name: string;
  flag: string;
  rate: number | null;

  /**
   * Optional fields for richer cards.
   * You don’t need to pass these yet – the card will
   * render gracefully without them.
   */
  changePct?: number | null;
  history?: number[]; // e.g. last 7 mid-rates for sparkline
  sourceLabel?: string | null;
};

type CurrencyOverviewCardProps = {
  commentary: string;
  eamuRates: EamuRate[];
  latestBase: string;
  latestDate: string | null;
};

function formatMidRate(rate: number | null): string {
  if (typeof rate !== "number" || Number.isNaN(rate)) return "—";
  return rate.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function formatChangePct(changePct: number | null | undefined): string {
  if (typeof changePct !== "number" || Number.isNaN(changePct)) return "—";
  const value = changePct * 100;
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function getTrend(
  changePct: number | null | undefined,
): { label: "up" | "down" | "flat"; arrow: string; className: string } {
  if (typeof changePct !== "number" || Number.isNaN(changePct)) {
    return { label: "flat", arrow: "→", className: "text-zinc-400" };
  }

  const value = changePct;

  if (value > 0.0005) {
    return { label: "up", arrow: "↑", className: "text-emerald-400" };
  }
  if (value < -0.0005) {
    return { label: "down", arrow: "↓", className: "text-red-400" };
  }

  return { label: "flat", arrow: "→", className: "text-zinc-400" };
}

function Sparkline({ history }: { history: number[] }) {
  if (!history || history.length < 2) return null;

  const width = 120;
  const height = 32;

  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const stepX =
    history.length > 1 ? width / (history.length - 1) : width / history.length;

  const points = history
    .map((value, index) => {
      const x = index * stepX;
      const normalized = (value - min) / range;
      const y = height - normalized * (height - 4) - 2; // 2px vertical padding
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-8 w-full text-zinc-400"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export function CurrencyOverviewCard({
  commentary,
  eamuRates,
  latestBase,
  latestDate,
}: CurrencyOverviewCardProps) {
  const displayDate = latestDate ?? "latest";

  return (
    <section
      aria-labelledby="eamu-currency-snapshot"
      className="mt-16 rounded-3xl border border-zinc-800 bg-black/40 p-6 sm:p-8 lg:p-10 shadow-[0_0_60px_rgba(0,0,0,0.7)]"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <p className="text-[0.7rem] font-semibold tracking-[0.35em] text-zinc-500 uppercase">
            EAMU currency snapshot
          </p>
          <h2
            id="eamu-currency-snapshot"
            className="mt-2 text-xl sm:text-2xl font-semibold text-zinc-50"
          >
            High-level view of EAMU and related currencies, anchored on{" "}
            <span className="text-zinc-100">{latestBase}</span>.
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Latest available fixing date:{" "}
            <span className="font-medium text-zinc-100">{displayDate}</span>.
          </p>
        </div>

        <div className="text-right text-xs text-zinc-500 space-y-1">
          <p className="font-medium text-zinc-300">
            Regional currencies anchored on {latestBase}
          </p>
          <p>
            Snapshot for desks that need a concise, comparable view of the EAMU
            basket against {latestBase}.
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
        {/* Left: stacked performance cards in a responsive grid */}
        <section aria-label="EAMU basket vs anchor" className="space-y-4">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.3em] text-zinc-500">
                Currency snapshot
              </p>
              <h3 className="mt-1 text-sm font-semibold text-zinc-100">
                EAMU basket vs {latestBase}
              </h3>
            </div>
            <p className="text-[0.65rem] text-zinc-500">
              Data sourced from the same FX engine that powers the Savvy Rilla
              FX API.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {eamuRates.map((country) => {
              const changePct =
                typeof country.changePct === "number"
                  ? country.changePct
                  : null;
              const trend = getTrend(changePct);

              return (
                <article
                  key={country.code}
                  className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 shadow-[0_0_30px_rgba(0,0,0,0.6)]"
                >
                  {/* Header: flag + country + pair */}
                  <header className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-900 text-xs">
                        <span className="text-lg leading-none">
                          {country.flag}
                        </span>
                      </span>
                      <div>
                        <p className="text-xs font-medium text-zinc-200">
                          {country.name}
                        </p>
                        <p className="text-[0.65rem] text-zinc-500 uppercase tracking-[0.16em]">
                          {country.code} / {latestBase}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-[0.65rem] text-zinc-500 uppercase tracking-[0.18em]">
                        Mid rate
                      </p>
                      <p className="text-lg font-semibold text-zinc-50 tabular-nums">
                        {formatMidRate(country.rate)}
                      </p>
                    </div>
                  </header>

                  {/* Middle: trend + sparkline */}
                  <div className="mt-3 flex items-end justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-[0.65rem] uppercase tracking-[0.18em] text-zinc-500">
                        Trend (experimental)
                      </p>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`text-sm font-semibold tabular-nums ${trend.className}`}
                        >
                          {trend.arrow}
                        </span>
                        <span
                          className={`text-xs font-medium tabular-nums ${trend.className}`}
                        >
                          {formatChangePct(changePct)}
                        </span>
                      </div>
                      <p className="text-[0.65rem] text-zinc-500">
                        vs previous fixing
                      </p>
                    </div>

                    <div className="flex-1">
                      {country.history && country.history.length > 1 ? (
                        <Sparkline history={country.history} />
                      ) : (
                        <div className="h-8 w-full rounded border border-dashed border-zinc-800 bg-zinc-900/40" />
                      )}
                    </div>
                  </div>

                  {/* Footer: meta */}
                  <footer className="mt-3 flex items-center justify-between gap-3 text-[0.65rem] text-zinc-500">
                    <span>
                      As of{" "}
                      <span className="font-medium text-zinc-300">
                        {displayDate}
                      </span>
                    </span>
                    <span className="text-right">
                      {country.sourceLabel
                        ? country.sourceLabel
                        : "Savvy Rilla FX – public read-only feed"}
                    </span>
                  </footer>
                </article>
              );
            })}
          </div>
        </section>

        {/* Right: anchor commentary panel */}
        <section
          aria-label="Daily anchor commentary"
          className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5 sm:p-6 space-y-3"
        >
          <div className="space-y-1">
            <p className="text-[0.65rem] uppercase tracking-[0.3em] text-zinc-500">
              Daily anchor commentary
            </p>
            <h3 className="text-sm font-semibold text-zinc-100">
              USD/SSP signal for regional desks
            </h3>
          </div>

          <p className="text-sm leading-relaxed text-zinc-300 whitespace-pre-line">
            {commentary}
          </p>

          <p className="text-[0.7rem] text-zinc-500">
            This narrative is generated from observed fixing levels, recent
            changes, and volatility bands in the USD/SSP pair to help policy
            desks, commercial banks, and analysts interpret daily moves. Treat
            it as a starting point for human analysis, not as investment advice.
          </p>
        </section>
      </div>
    </section>
  );
}
