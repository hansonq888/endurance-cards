import type { SportFamily } from "@/types/player";

/**
 * Chart colours, validated for the dark panel surface (#1c1612) with the dataviz
 * palette validator: run/ride/swim pass all-pairs; the full fixed order passes
 * adjacent-pairs (green↔magenta sits in the CVD warn band, so the donut always
 * pairs colour with gaps and a labelled legend).
 *
 * Colour follows the sport, never its rank: running is orange on every card.
 */
export const SPORT_COLORS: Record<SportFamily, string> = {
  run: "#fc4c02",
  ride: "#3987e5",
  swim: "#199e70",
  snow: "#9085e9",
  foot: "#c98500",
  water: "#d55181",
  gym: "#1f9a3a",
  other: "#7d736b",
};

/** Fixed segment order (also the validated adjacency order). */
export const SPORT_ORDER: SportFamily[] = ["run", "ride", "swim", "snow", "foot", "water", "gym", "other"];

export { SPORT_LABELS } from "./sports";

/**
 * Heatmap: one hue, monotone steps. On the dark surface the anchor flips, so
 * more time = brighter, more saturated orange. Fixed minute thresholds so a
 * colour means the same thing on every card.
 */
export const HEAT_STEPS = [
  { min: 0, color: "#2a211b", label: "Rest" },
  { min: 1, color: "#4a2110", label: "< 30 min" },
  { min: 30, color: "#7c2f0c", label: "30–60 min" },
  { min: 60, color: "#bb3f06", label: "1–2 h" },
  { min: 120, color: "#fc4c02", label: "2 h +" },
] as const;

export function heatStep(minutes: number) {
  let step: (typeof HEAT_STEPS)[number] = HEAT_STEPS[0];
  for (const s of HEAT_STEPS) if (minutes >= s.min) step = s;
  return step;
}

export function fmtDuration(minutes: number): string {
  if (minutes <= 0) return "Rest day";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
