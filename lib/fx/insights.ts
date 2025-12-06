// lib/fx/insights.ts

export type MarketSummary = {
  base: string; // e.g. "SSP"
  quote: string; // e.g. "USD"
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
    label: string | null;
  };
  volatility: {
    window_days: number;
    avg_daily_move_pct: number | null;
  };
};

function formatPair(summary: MarketSummary) {
  // For SSP markets we want "USD/SSP" style
  return `${summary.quote}/${summary.base}`;
}

function formatPct(value: number, digits = 2) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function buildInsightsFromSummary(summary: MarketSummary): string[] {
  const insights: string[] = [];
  const pairLabel = formatPair(summary);

  // 1) Change vs previous fixing
  if (summary.change_pct_vs_previous !== null) {
    const delta = summary.change_pct_vs_previous;
    const absDelta = Math.abs(delta);

    let descriptor: string;
    if (absDelta < 0.15) {
      descriptor = "has been stable";
    } else if (absDelta < 0.75) {
      descriptor = "has moved moderately";
    } else {
      descriptor = "has moved sharply";
    }

    insights.push(
      `${pairLabel} ${descriptor} vs the previous fixing (${formatPct(
        delta
      )}).`
    );
  }

  // 2) 30-day (or window) range
  const { high, low, window_days: rangeWindow } = summary.range;
  if (summary.mid_rate > 0 && high > 0 && low > 0 && high >= low) {
    const rangePct = ((high - low) / summary.mid_rate) * 100;

    let descriptor: string;
    if (rangePct < 1) {
      descriptor = "tight";
    } else if (rangePct < 3) {
      descriptor = "moderate";
    } else {
      descriptor = "wide";
    }

    insights.push(
      `${pairLabel} ${rangeWindow}-day trading range is ${descriptor}: ` +
        `${low.toFixed(2)} – ${high.toFixed(2)}.`
    );
  }

  // 3) Volatility
  const { avg_daily_move_pct, window_days: volWindow } = summary.volatility;
  if (avg_daily_move_pct !== null) {
    const absVol = Math.abs(avg_daily_move_pct);
    let descriptor: string;

    if (absVol < 0.10) descriptor = "very low";
    else if (absVol < 0.30) descriptor = "low";
    else if (absVol < 0.70) descriptor = "elevated";
    else descriptor = "high";

    insights.push(
      `Average daily move over the last ${volWindow} days is ${formatPct(
        avg_daily_move_pct
      )}, indicating ${descriptor} volatility.`
    );
  }

  // 4) Trend label, if present
  if (summary.trend?.label) {
    insights.push(
      `Trend signal: ${pairLabel} is "${summary.trend.label}" over the last ${summary.trend.window_days} days.`
    );
  }

  // Keep it short & sweet
  return insights.slice(0, 3);
}
