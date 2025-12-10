"use client";

import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info, TrendingUp, TrendingDown, Minus } from "lucide-react";
import FxHistoryChart from "@/components/fx-history-chart";

type EamuRate = {
  // ISO code of the currency, e.g. "KES"
  code: string;
  // Human-readable label, e.g. "Kenyan Shilling"
  name: string;
  // Short flag / badge text
  flag: string;
  // Latest mid-rate vs anchor (SSP)
  rate: number | null;

  // Optional analytics fields
  changePct?: number | null;
  history?: number[] | null;
  sourceLabel?: string | null;
  mid?: number | null;
  latestOfficialDate?: string | null;
};

type Commentary = {
  summary: string;
  anchorPair: string;
  windowLabel: string;
};

type CurrencyOverviewCardProps = {
  commentary: Commentary | null;
  eamuRates: EamuRate[];
  latestBase: string | null;
  latestDate: string | null;
};

type WindowKey = "90d" | "365d" | "all";

const WINDOW_LABELS: Record<WindowKey, string> = {
  "90d": "Last 90 days",
  "365d": "Last 365 days",
  all: "Full history",
};

export function CurrencyOverviewCard({
  commentary,
  eamuRates,
  latestBase,
  latestDate,
}: CurrencyOverviewCardProps) {
  const [windowKey, setWindowKey] = useState<WindowKey>("365d");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const selectedRate = useMemo(
    () => eamuRates.find((r) => r.code === selectedCode) || null,
    [eamuRates, selectedCode]
  );

  const sortedRates = useMemo(
    () =>
      [...eamuRates].sort((a, b) => {
        // Keep KES roughly first for familiarity
        if (a.code === "KES") return -1;
        if (b.code === "KES") return 1;
        return a.name.localeCompare(b.name);
      }),
    [eamuRates]
  );

  const handleCardClick = (code: string) => {
    setSelectedCode(code);
    setIsModalOpen(true);
  };

  return (
    <section className="flex flex-col gap-6">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">
            EAMU CURRENCY SNAPSHOT
          </p>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-semibold text-neutral-50">
            High-level view of EAMU and related currencies, anchored on{" "}
            {latestBase ?? "SSP"}.
          </h2>

          {latestDate && (
            <p className="text-xs text-neutral-400 pt-1">
              Latest available fixing date:{" "}
              <span className="font-medium text-neutral-200">
                {latestDate}
              </span>
            </p>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-2 text-[11px] text-neutral-400">
          <Info className="w-3 h-3" />
          <span className="max-w-xs text-right leading-snug">
            Data sourced from the same FX engine that powers the Savvy Rilla FX
            API.
          </span>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(380px,1fr)] gap-6 items-stretch">
        {/* Left: Currency cards */}
        <div className="bg-[#050507] border border-neutral-900 rounded-3xl px-4 sm:px-6 py-4 sm:py-5 shadow-[0_40px_120px_rgba(0,0,0,0.7)]">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                CURRENCY SNAPSHOT
              </p>
              <p className="text-sm text-neutral-300">
                EAMU basket vs{" "}
                <span className="font-medium">{latestBase}</span>
              </p>
            </div>

            <div className="inline-flex items-center gap-1 bg-black/60 border border-neutral-800 rounded-full px-1.5 py-1">
              {(["90d", "365d", "all"] as WindowKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setWindowKey(key)}
                  className={`px-2.5 py-1 rounded-full text-[11px] transition ${
                    windowKey === key
                      ? "bg-neutral-100 text-black font-medium shadow-sm"
                      : "text-neutral-400 hover:text-neutral-100"
                  }`}
                >
                  {key === "all" ? "All" : key}
                </button>
              ))}
            </div>
          </div>

          {/* Cards row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {sortedRates.map((rate) => {
              const changePct = rate.changePct ?? null;
              const hasChange = changePct !== null && changePct !== undefined;
              const isUp = hasChange ? changePct! > 0 : false;
              const isDown = hasChange ? changePct! < 0 : false;

              return (
                <motion.button
                  key={rate.code}
                  type="button"
                  onClick={() => handleCardClick(rate.code)}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.99 }}
                  className="group relative text-left rounded-3xl border border-neutral-800/80 bg-gradient-to-b from-neutral-950/90 via-black to-black/90 px-4 py-3 sm:px-4 sm:py-3.5 shadow-[0_24px_80px_rgba(0,0,0,0.85)] overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-neutral-900 border border-neutral-700/80 text-[11px] font-semibold text-neutral-200 uppercase">
                          {rate.flag}
                        </div>
                        <p className="text-[11px] tracking-[0.18em] uppercase text-neutral-500">
                          {rate.code} / {latestBase}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-neutral-100 leading-tight">
                        {rate.name}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <p className="text-xs text-neutral-500">MID RATE</p>
                      <p className="text-lg font-semibold tabular-nums text-neutral-50">
                        {rate.rate !== null ? rate.rate.toLocaleString() : "—"}
                      </p>

                      <div className="flex items-center gap-1 text-[11px]">
                        {hasChange ? (
                          <>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 border text-[10px] tabular-nums ${
                                isUp
                                  ? "border-emerald-500/60 bg-emerald-500/5 text-emerald-300"
                                  : isDown
                                  ? "border-rose-500/60 bg-rose-500/5 text-rose-300"
                                  : "border-neutral-700 bg-neutral-900 text-neutral-300"
                              }`}
                            >
                              {isUp && <TrendingUp className="w-3 h-3" />}
                              {isDown && <TrendingDown className="w-3 h-3" />}
                              {!isUp && !isDown && (
                                <Minus className="w-3 h-3" />
                              )}
                              {changePct!.toFixed(2)}%
                            </span>
                            <span className="text-neutral-500">
                              vs previous fixing
                            </span>
                          </>
                        ) : (
                          <span className="text-neutral-500">
                            No recent change data
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="relative h-8 w-full overflow-hidden rounded-full bg-neutral-950/90 border border-neutral-900/80">
                      <FxHistoryChart
                        base={latestBase ?? "SSP"}
                        quote={rate.code}
                        window={windowKey}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] text-neutral-500 leading-relaxed">
                      Click to view detailed history and manual fixing overlays.
                    </p>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Right: commentary */}
        <div className="bg-[#050507] border border-neutral-900 rounded-3xl px-4 sm:px-5 py-4 sm:py-5 shadow-[0_40px_120px_rgba(0,0,0,0.7)] flex flex-col justify-between">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
              REGIONAL CURRENCIES ANCHORED ON {latestBase ?? "SSP"}
            </p>
            <h3 className="text-sm sm:text-base font-medium text-neutral-50">
              Compact view of the EAMU basket for policy and dealing desks that
              need fast comparisons.
            </h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Snapshot for desks that need a concise, comparable view of the
              EAMU basket against {latestBase ?? "SSP"}.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-900/80 space-y-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
              DAILY ANCHOR COMMENTARY
            </p>
            {commentary ? (
              <>
                <p className="text-xs font-medium text-neutral-200">
                  {commentary.anchorPair} signal for regional desks
                </p>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  {commentary.summary}
                </p>
                <p className="text-[10px] text-neutral-500 mt-2">
                  Window: {WINDOW_LABELS[windowKey]} • Engine view:{" "}
                  {commentary.windowLabel}
                </p>
              </>
            ) : (
              <p className="text-[11px] text-neutral-500">
                Commentary will appear here once the FX engine has generated
                enough history for the configured window.
              </p>
            )}

            <p className="text-[9px] text-neutral-600 mt-3 leading-relaxed">
              This narrative is generated from observed fixing levels, recent
              changes, and volatility bands in the USD/SSP pair to help policy
              desks, commercial banks, and analysts interpret daily moves. Treat
              it as a starting point for human analysis, not as investment
              advice.
            </p>
          </div>
        </div>
      </div>

      {/* Drill-down modal */}
      <AnimatePresence>
        {isModalOpen && selectedRate && (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsModalOpen(false)}
          >
            <motion.div
              className="relative w-full max-w-3xl mx-4 rounded-3xl bg-[#050507] border border-neutral-800 shadow-[0_40px_160px_rgba(0,0,0,0.9)] overflow-hidden"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-neutral-900/80">
                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                    CURRENCY DETAIL
                  </p>
                  <h4 className="text-sm sm:text-base font-semibold text-neutral-50">
                    {selectedRate.name} • {selectedRate.code} /{" "}
                    {latestBase ?? "SSP"}
                  </h4>
                  <p className="text-[11px] text-neutral-400">
                    {WINDOW_LABELS[windowKey]} • Tap on the sparkline to inspect
                    manual fixings and overrides.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="text-xs text-neutral-400 hover:text-neutral-100 px-2 py-1 rounded-full border border-neutral-700/70 hover:border-neutral-400 transition"
                >
                  Close
                </button>
              </div>

              <div className="px-5 py-4 space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-neutral-500">Current mid</p>
                    <p className="text-2xl font-semibold text-neutral-50 tabular-nums">
                      {selectedRate.rate !== null
                        ? selectedRate.rate.toLocaleString()
                        : "—"}
                    </p>
                  </div>

                  {selectedRate.changePct !== undefined &&
                    selectedRate.changePct !== null && (
                      <div className="space-y-1">
                        <p className="text-xs text-neutral-500">
                          Change vs previous fixing
                        </p>
                        <div className="inline-flex items-center gap-1 rounded-full px-2 py-1 border border-neutral-700 bg-neutral-950 text-[11px] text-neutral-200">
                          {selectedRate.changePct > 0 && (
                            <TrendingUp className="w-3 h-3 text-emerald-400" />
                          )}
                          {selectedRate.changePct < 0 && (
                            <TrendingDown className="w-3 h-3 text-rose-400" />
                          )}
                          {selectedRate.changePct === 0 && (
                            <Minus className="w-3 h-3 text-neutral-400" />
                          )}
                          <span className="tabular-nums">
                            {selectedRate.changePct.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    )}
                </div>

                <div className="h-40 sm:h-52 rounded-2xl bg-neutral-950/80 border border-neutral-900/80 overflow-hidden">
                  <FxHistoryChart
                    base={latestBase ?? "SSP"}
                    quote={selectedRate.code}
                    window={windowKey}
                  />
                </div>

                {selectedRate.sourceLabel && (
                  <p className="text-[11px] text-neutral-500 leading-relaxed">
                    Source: {selectedRate.sourceLabel}
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
