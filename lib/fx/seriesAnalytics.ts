export type SeriesPoint = { date: string; mid: number };

export type PointAnalytics = {
  /** Previous mid (null for first point) */
  prevMid: number | null;
  /** Absolute day-over-day change (null for first point) */
  delta: number | null;
  /** Percentage day-over-day change (null for first point). Example: 1.25 means +1.25% */
  pctDelta: number | null;
  /** Rolling volatility of pctDelta over `volWindow` returns (null until enough data) */
  volPct: number | null;
  /** Jump/discontinuity flag based on |pctDelta| >= jumpThresholdPct */
  isJump: boolean;
  /** Flat/stale run length ending at this point (0 means not flat). */
  flatRun: number;
};

export type SeriesAnalyticsOptions = {
  /** Rolling window length (in returns, not points). Default 7. */
  volWindow?: number;
  /** Jump threshold in percentage points (e.g. 5 means 5%). Default 5. */
  jumpThresholdPct?: number;
  /** Consider values "flat" if equal within this epsilon. Default 0. */
  flatEpsilon?: number;
};

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function stdDev(values: number[]) {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Computes deterministic analytics for an FX series.
 *
 * Notes:
 * - pctDelta is computed against previous mid.
 * - volPct is the rolling standard deviation of pctDelta over the last `volWindow` returns.
 * - The function is intentionally pure for auditability.
 */
export function computeSeriesAnalytics(
  points: SeriesPoint[],
  opts: SeriesAnalyticsOptions = {}
): PointAnalytics[] {
  const volWindow = clampInt(opts.volWindow ?? 7, 2, 60);
  const jumpThresholdPct = Math.max(0, opts.jumpThresholdPct ?? 5);
  const flatEpsilon = Math.max(0, opts.flatEpsilon ?? 0);

  const out: PointAnalytics[] = [];
  const returns: number[] = []; // pctDelta history (only non-null)
  let flatRun = 0;

  for (let i = 0; i < points.length; i++) {
    const cur = points[i];
    const prev = i > 0 ? points[i - 1] : null;

    const prevMid = prev ? prev.mid : null;
    const delta = prev ? cur.mid - prev.mid : null;
    const pctDelta = prev && prev.mid !== 0 ? (delta! / prev.mid) * 100 : null;

    // Flat run
    if (prev && Math.abs(cur.mid - prev.mid) <= flatEpsilon) {
      flatRun += 1;
    } else {
      flatRun = 0;
    }

    // Update returns history for volatility
    if (pctDelta !== null && Number.isFinite(pctDelta)) {
      returns.push(pctDelta);
    }

    let volPct: number | null = null;
    if (returns.length >= volWindow) {
      const slice = returns.slice(returns.length - volWindow);
      volPct = stdDev(slice);
    }

    const isJump =
      pctDelta !== null ? Math.abs(pctDelta) >= jumpThresholdPct : false;

    out.push({
      prevMid,
      delta,
      pctDelta,
      volPct,
      isJump,
      flatRun,
    });
  }

  return out;
}

export function formatSigned(n: number, decimals = 2) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n);
  return `${sign}${abs.toFixed(decimals)}`;
}

export type VolBucket = "low" | "elevated" | "high" | "unknown";

/**
 * Buckets volatility into a small number of UX-friendly categories.
 * Thresholds are conservative defaults and can be tuned later per pair.
 */
export function bucketVolPct(volPct: number | null): VolBucket {
  if (volPct === null || !Number.isFinite(volPct)) return "unknown";
  if (volPct < 0.25) return "low";
  if (volPct < 0.75) return "elevated";
  return "high";
}
