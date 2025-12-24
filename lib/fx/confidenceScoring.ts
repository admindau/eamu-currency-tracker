import type { VolBucket } from "@/lib/fx/seriesAnalytics";
import type { RegimeKey } from "@/lib/fx/regimeDetection";

export type ConfidenceLevel = "high" | "medium" | "low" | "unknown";

export type ConfidenceResult = {
  level: ConfidenceLevel;
  label: string;
  reasons: string[];
};

/**
 * Deterministic confidence scoring for an FX series point.
 *
 * IMPORTANT: This is "data integrity / interpretability confidence",
 * not a statement about real-world causality.
 */
export function scoreConfidence(input: {
  idx: number;
  total: number;
  hasManualFixing: boolean;
  hasManualOverride: boolean;
  isJump: boolean;
  volBucket: VolBucket;
  regimeKey: RegimeKey | "unknown";
  hasVolHistory: boolean;
}): ConfidenceResult {
  const reasons: string[] = [];

  // Early points lack trailing context (vol/slope), so interpretability is reduced.
  const early = input.idx < 7;
  if (early) reasons.push("Limited trailing history for analytics.");

  // Manual intervention is explicitly low confidence (it is a deliberate override).
  if (input.hasManualOverride) {
    reasons.push("Manual override recorded on this date.");
    return { level: "low", label: "Low", reasons };
  }

  // Manual fixing (not override) still indicates the engine is not purely market-derived.
  if (input.hasManualFixing) reasons.push("Manual fixing recorded on this date.");

  // Shocks reduce interpretability unless corroborated (we keep this conservative).
  if (input.isJump) reasons.push("Large day-over-day move detected (discontinuity).");

  // Volatility contributes to interpretability confidence.
  if (!input.hasVolHistory) reasons.push("Insufficient volatility history.");
  if (input.volBucket === "high") reasons.push("High volatility.");
  if (input.volBucket === "elevated") reasons.push("Elevated volatility.");

  // Regime “unknown” implies classification ambiguity.
  if (input.regimeKey === "unknown") reasons.push("Regime classification uncertain.");

  // ---- Deterministic level assignment ----
  // LOW: jump + high vol OR (manual fixing + high vol) OR (jump + unknown regime + elevated/high vol)
  const highOrElev = input.volBucket === "high" || input.volBucket === "elevated";
  if (
    (input.isJump && input.volBucket === "high") ||
    (input.hasManualFixing && input.volBucket === "high") ||
    (input.isJump && input.regimeKey === "unknown" && highOrElev)
  ) {
    return { level: "low", label: "Low", reasons };
  }

  // MEDIUM: manual fixing, elevated/high vol, unknown regime, jump (without high vol), or early-series limitations
  if (
    input.hasManualFixing ||
    input.volBucket === "high" ||
    input.volBucket === "elevated" ||
    input.regimeKey === "unknown" ||
    input.isJump ||
    early ||
    !input.hasVolHistory
  ) {
    return { level: "medium", label: "Medium", reasons };
  }

  // HIGH: stable conditions
  reasons.push("Stable analytics profile (no override, low volatility, no discontinuity).");
  return { level: "high", label: "High", reasons };
}

/** Monochrome-friendly overlay alpha (black/white UI) */
export function confidenceStyle(level: ConfidenceLevel): {
  stroke: string;
  fill: string;
  opacity: number;
  r: number;
} {
  if (level === "high") {
    return {
      stroke: "rgba(255,255,255,0.30)",
      fill: "rgba(255,255,255,0.10)",
      opacity: 0.9,
      r: 2.2,
    };
  }
  if (level === "medium") {
    return {
      stroke: "rgba(255,255,255,0.20)",
      fill: "rgba(255,255,255,0.07)",
      opacity: 0.75,
      r: 2.0,
    };
  }
  if (level === "low") {
    return {
      stroke: "rgba(255,255,255,0.14)",
      fill: "rgba(255,255,255,0.05)",
      opacity: 0.6,
      r: 1.9,
    };
  }
  return {
    stroke: "rgba(255,255,255,0.10)",
    fill: "rgba(255,255,255,0.04)",
    opacity: 0.5,
    r: 1.8,
  };
}
