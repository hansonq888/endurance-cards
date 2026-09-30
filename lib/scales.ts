/** Scaling primitives shared by extraction and rating: map raw numbers onto 1–99. */


// ---------- Scaling primitives ----------

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Maps a 0–1 fraction onto the 1–99 card scale. */
export const toRating = (fraction: number) => Math.round(1 + 98 * clamp(fraction, 0, 1));

/**
 * Logarithmic scale for counts/volumes that can be zero.
 * `floor` maps to 1, `ceiling` (and above) maps to 99.
 */
export function logScale(value: number, floor: number, ceiling: number): number {
  if (!(value > floor)) return 1;
  return toRating((Math.log1p(value) - Math.log1p(floor)) / (Math.log1p(ceiling) - Math.log1p(floor)));
}

/** Log-ratio scale for strictly-positive rates such as speed. */
export function ratioScale(value: number, floor: number, ceiling: number): number {
  if (!(value > floor)) return 1;
  return toRating(Math.log(value / floor) / Math.log(ceiling / floor));
}

/** Saturating curve: fast early gains, diminishing returns. `k` = value that reaches ~63%. */
export const saturate = (value: number, k: number) => toRating(1 - Math.exp(-value / k));

export const weighted = (parts: [score: number, weight: number][]) => {
  const total = parts.reduce((s, [, w]) => s + w, 0);
  return Math.round(parts.reduce((s, [v, w]) => s + v * w, 0) / total);
};

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp((sorted.length - 1) * p, 0, sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
