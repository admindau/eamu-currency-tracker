// app/components/CurrencyOverviewCard.tsx
import React from "react";

type EamuRate = {
  code: string;
  name: string;
  flag: string;
  rate: number | null;

  // Optional richer fields
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
    return { label: "flat", arrow: "→", className: "text-zinc-500" };
  }

  const value = changePct;

  if (value > 0.0005) {
    return { label: "up", arrow: "↑", className: "text-emerald-400" };
  }
  if (value < -0.0005) {
    return { label: "down", arrow: "↓", className: "text-red-400" };
  }

  return { label: "flat", arrow: "→", className: "text-zinc-500" };
}

function Sparkline({ history }: { history: number[] }) {
  if (!history || history.length < 2) return null;

  const width = 80;
  const height = 20;

  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const stepX =
    history.length > 1 ? width / (history.length - 1) : width / history.length;

  const points = history
    .map((value, index) => {
      const x = index * stepX;
      const normalized = (value - min) / range;
      const y = height - normalized * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-5 w-full text-zinc-500"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
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
      className="mt-16 rounded-3xl border border-zinc-900 bg-black/60 p-5 sm:p-6 lg:p-7 shadow-[0_0_40px_rgba(0,0,0,0.7)]"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <p className="text-[0.62rem] font-semibold tracking-[0.32em] text-zinc-500 uppercase">
            EAMU currency snapshot
          </p>
          <h2
            id="eamu-currency-snapshot"
            className="mt-1 text-[1.05rem] sm:text-[1.1rem] font-semibold text-zinc-50"
          >
            High-level view of EAMU and related currencies, anchored on{" "}
            <span className="text-zinc-100">{latestBase}</span>.
          </h2>
          <p className="mt-1 text-[0.7rem] text-zinc-500">
            Latest available fixing date:{" "}
            <span className="font-medium text-zinc-100">{displayDate}</span>.
          </p>
        </div>

        <div className="text-right text-[0.65rem] text-zinc-500 space-y-1 max-w-xs">
          <p className="font-medium text-zinc-300">
            Regional currencies anchored on {latestBase}
          </p>
          <p>
            Compact view of the EAMU basket for policy and dealing desks that
            need fast comparisons.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr] items-start">
        {/* LEFT: ultra-compact stacked performance cards */}
        <section aria-label="EAMU basket vs anchor" className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="text-[0.6rem] uppercase tracking-[0.28em] text-zinc-500">
                Currency snapshot
              </p>
              <h3 className="mt-0.5 text-[0.8rem] font-semibold text-zinc-100">
                EAMU basket vs {latestBase}
              </h3>
            </div>
            <p className="hidden sm:block text-[0.6rem] text-zinc-500">
              Data sourced from the same FX engine that powers the Savvy Rilla
              FX API.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3 items-stretch">
            {eamuRates.map((country) => {
              const changePct =
                typeof country.changePct === "number"
                  ? country.changePct
                  : null;
              const trend = getTrend(changePct);

              return (
                <article
                  key={country.code}
                  className="flex h-full flex-col justify-between rounded-xl border border-zinc-900 bg-zinc-950/80 p-3 shadow-[0_0_24px_rgba(0,0,0,0.6)]"
                >
                  {/* Top: flag + pair + mid */}
                  <header className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-zinc-800 bg-zinc-900 text-[0.65rem]">
                        <span className="text-sm leading-none">
                          {country.flag}
                        </span>
                      </span>
                      <div className="space-y-[1px]">
                        <p className="text-[0.7rem] font-medium text-zinc-200 leading-tight">
                          {country.name}
                        </p>
                        <p className="text-[0.58rem] text-zinc-500 uppercase tracking-[0.16em]">
                          {country.code} / {latestBase}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-[0.58rem] text-zinc-500 uppercase tracking-[0.16em]">
                        Mid
                      </p>
                      <p className="text-[0.9rem] font-semibold text-zinc-50 tabular-nums leading-tight">
                        {formatMidRate(country.rate)}
                      </p>
                    </div>
                  </header>

                  {/* Middle: trend + sparkline */}
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="space-y-[2px]">
                      <p className="text-[0.58rem] uppercase tracking-[0.18em] text-zinc-500">
                        Trend
                      </p>
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className={`text-[0.8rem] font-semibold tabular-nums ${trend.className}`}
                        >
                          {trend.arrow}
                        </span>
                        <span
                          className={`text-[0.7rem] font-medium tabular-nums ${trend.className}`}
                        >
                          {formatChangePct(changePct)}
                        </span>
                      </div>
                      <p className="text-[0.56rem] text-zinc-500">
                        vs previous fixing
                      </p>
                    </div>

                    <div className="flex-1">
                      {country.history && country.history.length > 1 ? (
                        <Sparkline history={country.history} />
                      ) : (
                        <div className="h-5 w-full rounded border border-dashed border-zinc-800 bg-zinc-900/40" />
                      )}
                    </div>
                  </div>

                  {/* Bottom: meta */}
                  <footer className="mt-2 flex items-center justify-between gap-2 text-[0.58rem] text-zinc-500">
                    <span className="truncate">
                      As of{" "}
                      <span className="font-medium text-zinc-300">
                        {displayDate}
                      </span>
                    </span>
                    <span className="text-right truncate">
                      {country.sourceLabel
                        ? country.sourceLabel
                        : "Savvy Rilla FX – public read-only"}
                    </span>
                  </footer>
                </article>
              );
            })}
          </div>
        </section>

        {/* RIGHT: commentary panel */}
        <section
          aria-label="Daily anchor commentary"
          className="rounded-xl border border-zinc-900 bg-zinc-950/90 p-4 sm:p-5 space-y-3"
        >
          <div className="space-y-1">
            <p className="text-[0.6rem] uppercase tracking-[0.26em] text-zinc-500">
              Daily anchor commentary
            </p>
            <h3 className="text-[0.8rem] font-semibold text-zinc-100">
              USD/SSP signal for regional desks
            </h3>
          </div>

          <p className="text-[0.75rem] leading-relaxed text-zinc-300 whitespace-pre-line">
            {commentary}
          </p>

          <p className="text-[0.62rem] text-zinc-500">
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
