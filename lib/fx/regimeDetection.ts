import type { PointAnalytics, VolBucket } from "@/lib/fx/seriesAnalytics";

export type RegimeKey = "stable" | "drift" | "shock" | "intervention" | "unknown";

export type RegimePoint = {
  key: RegimeKey;
  label: string;
  reason: string;
};

export type RegimeSegment = {
  key: RegimeKey;
  label: string;
  fromIdx: number;
  toIdx: number; // inclusive
};

export type RegimeOptions = {
  /** Trailing window used to compute slope (% per day). Default 14. */
  slopeWindow?: number;
  /** Drift threshold (% per day). Default 0.06. */
  driftSlopeAbsPctPerDay?: number;
  /** Consider shock if abs(pctDelta) >= threshold. Should match Phase 1 jumpThresholdPct. Default 5. */
  shockJumpThresholdPct?: number;
};

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function slopePctPerDay(
  analytics: PointAnalytics[],
  idx: number,
  window: number
): number | null {
  const start = idx - window;
  if (start < 0) return null;

  let sum = 0;
  let count = 0;

  for (let i = start + 1; i <= idx; i++) {
    const r = analytics[i]?.pctDelta;
    if (r === null || r === undefined || !Number.isFinite(r)) continue;
    sum += r;
    count += 1;
  }

  if (count < Math.max(3, Math.floor(window * 0.6))) return null;
  return sum / count;
}

function labelFor(key: RegimeKey) {
  if (key === "stable") return "Stable";
  if (key === "drift") return "Drift";
  if (key === "shock") return "Shock";
  if (key === "intervention") return "Intervention";
  return "Unknown";
}

export function classifyRegimes(
  analytics: PointAnalytics[],
  volBucketByIdx: (idx: number) => VolBucket,
  hasManualOverrideByIdx: (idx: number) => boolean,
  opts: RegimeOptions = {}
): RegimePoint[] {
  const slopeWindow = clampInt(opts.slopeWindow ?? 14, 7, 60);
  const driftSlopeAbsPctPerDay = Math.max(0, opts.driftSlopeAbsPctPerDay ?? 0.06);
  const shockJumpThresholdPct = Math.max(0, opts.shockJumpThresholdPct ?? 5);

  return analytics.map((a, idx) => {
    // 1) Manual override gets explicit regime (policy/ops event)
    if (hasManualOverrideByIdx(idx)) {
      return {
        key: "intervention",
        label: labelFor("intervention"),
        reason: "Manual override recorded on this date.",
      };
    }

    // 2) Shock: discontinuity/jump
    if (
      a?.pctDelta !== null &&
      a?.pctDelta !== undefined &&
      Number.isFinite(a.pctDelta) &&
      Math.abs(a.pctDelta) >= shockJumpThresholdPct
    ) {
      return {
        key: "shock",
        label: labelFor("shock"),
        reason: `Large day-over-day move (${a.pctDelta.toFixed(2)}%).`,
      };
    }

    // 3) Trend drift: slope-based classification
    const slope = slopePctPerDay(analytics, idx, slopeWindow);
    const vb = volBucketByIdx(idx);

    if (slope !== null && Math.abs(slope) >= driftSlopeAbsPctPerDay) {
      const volNote =
        vb === "high" ? "high volatility" : vb === "elevated" ? "elevated volatility" : "low volatility";
      return {
        key: "drift",
        label: labelFor("drift"),
        reason: `Persistent directional change (~${slope.toFixed(2)}%/day) with ${volNote}.`,
      };
    }

    // 4) Stable: low vol + low slope (or insufficient slope but low vol)
    if (vb === "low") {
      return {
        key: "stable",
        label: labelFor("stable"),
        reason: "Low volatility and no persistent directional change detected.",
      };
    }

    // 5) Default
    if (vb === "elevated") {
      return {
        key: "unknown",
        label: labelFor("unknown"),
        reason: "Elevated volatility without a clear sustained drift signal.",
      };
    }

    if (vb === "high") {
      return {
        key: "unknown",
        label: labelFor("unknown"),
        reason: "High volatility without a clear sustained drift signal.",
      };
    }

    return {
      key: "unknown",
      label: labelFor("unknown"),
      reason: "Insufficient data to classify regime.",
    };
  });
}

export function buildRegimeSegments(regimes: RegimePoint[]): RegimeSegment[] {
  if (regimes.length === 0) return [];

  const segs: RegimeSegment[] = [];
  let currentKey = regimes[0].key;
  let currentLabel = regimes[0].label;
  let fromIdx = 0;

  for (let i = 1; i < regimes.length; i++) {
    if (regimes[i].key !== currentKey) {
      segs.push({ key: currentKey, label: currentLabel, fromIdx, toIdx: i - 1 });
      currentKey = regimes[i].key;
      currentLabel = regimes[i].label;
      fromIdx = i;
    }
  }

  segs.push({ key: currentKey, label: currentLabel, fromIdx, toIdx: regimes.length - 1 });
  return segs;
}

/**
 * Monochrome-friendly alpha palette for black UI.
 * We keep the regime rail subtle and non-distracting.
 */
export function regimeStrokeFor(key: RegimeKey): string {
  if (key === "stable") return "rgba(255,255,255,0.10)";
  if (key === "drift") return "rgba(255,255,255,0.16)";
  if (key === "shock") return "rgba(255,255,255,0.22)";
  if (key === "intervention") return "rgba(255,255,255,0.20)";
  return "rgba(255,255,255,0.08)";
}

export function regimeTextFor(key: RegimeKey): string {
  // Used for small labels if needed later
  if (key === "shock") return "SHOCK";
  if (key === "intervention") return "INTERVENTION";
  if (key === "drift") return "DRIFT";
  if (key === "stable") return "STABLE";
  return "UNKNOWN";
}
