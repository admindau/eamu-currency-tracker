// components/CurrencyOverviewCard.tsx

import React from "react";

type EamuRate = {
  code: string;
  name: string;
  flag: string;
  rate: number | null;
};

type CurrencyOverviewCardProps = {
  commentary: string;
  eamuRates: EamuRate[];
  latestBase: string;
  latestDate: string | null;
};

export function CurrencyOverviewCard({
  commentary,
  eamuRates,
  latestBase,
  latestDate,
}: CurrencyOverviewCardProps) {
  return (
    <section id="eamu-members" className="space-y-5">
      {/* Section header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[0.7rem] uppercase tracking-[0.25em] text-zinc-500">
            EAMU members (currency view)
          </p>
          <h2 className="text-xl font-semibold tracking-tight">
            Regional currencies anchored on SSP
          </h2>
          <p className="text-sm text-zinc-400 max-w-xl">
            Quick snapshot of East African Monetary Union member currencies,
            expressed against{" "}
            <span className="font-medium text-zinc-100">{latestBase}</span>, so
            you can compare movements across the region at a glance.
          </p>
        </div>
        <div className="text-xs text-zinc-500">
          Latest fixing date:{" "}
          <span className="font-medium text-zinc-200">
            {latestDate ?? "—"}
          </span>
        </div>
      </div>

      {/* Two-column layout: commentary + members grid */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)]">
        {/* Left: Members grid */}
        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-1">
              <p className="text-[0.7rem] uppercase tracking-[0.25em] text-zinc-500">
                Currency snapshot
              </p>
              <p className="text-sm text-zinc-400">
                EAMU basket vs{" "}
                <span className="font-medium text-zinc-100">{latestBase}</span>
              </p>
            </div>
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-red-500 via-amber-400 to-emerald-500 opacity-80" />
          </div>

          {eamuRates.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No EAMU currency data available yet for the current fixing.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {eamuRates.map((country) => (
                <div
                  key={country.code}
                  className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm"
                >
                  <div className="h-1 w-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500" />
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-zinc-500">
                        {country.flag} {country.name}
                      </p>
                      <p className="text-sm font-semibold text-zinc-100">
                        {country.code} / {latestBase}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                      Mid rate
                    </p>
                    <p className="text-lg font-semibold">
                      {typeof country.rate === "number"
                        ? country.rate.toLocaleString("en-US", {
                            maximumFractionDigits: 4,
                          })
                        : "—"}
                    </p>
                    <p className="text-[0.7rem] text-zinc-500">
                      As of {latestDate ?? "—"}
                    </p>
                  </div>
                  <p className="mt-auto text-[0.7rem] text-zinc-500">
                    Data sourced from the same FX engine that powers the Savvy
                    Rilla FX API.
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right: Commentary */}
        <section className="flex flex-col justify-between gap-4 rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-950/90 to-zinc-950/40 p-4 sm:p-5">
          <div className="space-y-2">
            <p className="text-[0.7rem] uppercase tracking-[0.25em] text-zinc-500">
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
            desks, commercial banks, and analysts interpret daily moves.
          </p>
        </section>
      </div>
    </section>
  );
}
