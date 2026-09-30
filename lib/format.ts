/** Small number and time formatters shared by the engine, explanations and trophies. */

export const DAY_MS = 86_400_000;

/** 1234.6 → "1,235" */
export const n0 = (n: number) => Math.round(n).toLocaleString("en-US");

/** Seconds → "m:ss". */
export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

/** Speed (m/s) → pace per kilometre, e.g. "4:52/km". */
export const fmtPerKm = (mps: number) => `${mmss(1000 / mps)}/km`;

/** Speed (m/s) → swim pace per 100 m, e.g. "1:45/100m". */
export const fmtPer100 = (mps: number) => `${mmss(100 / mps)}/100m`;
