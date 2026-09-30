/**
 * Kudex rating engine.
 *
 * Two pure stages, no I/O:
 *   1. extractInputs(): raw Strava payloads  -> ScoutInputs (sport-normalised facts)
 *   2. rateInputs():    ScoutInputs          -> attributes, OVR, tier, trophies
 *
 * Volume-like metrics are log-scaled (GitFut-style) so a 1,000 km/week outlier
 * saturates near 99 instead of compressing everyone else toward 1, while the
 * gap between "never" and "weekly" stays wide.
 *
 * Sport-aware: PAC and END are rated per sport against that sport's own
 * benchmarks (a swimmer is compared with swimmers), then blended by the share
 * of time the athlete spends on each sport. No cross-sport conversion ratios.
 */
// The engine lives in focused modules; this index keeps one import path for all of it.
export * from "./scales";
export * from "./sports";
export * from "./extract";
export * from "./rating";
export * from "./card-build";
