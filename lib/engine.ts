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
import { activitiesFor, activityLevel, privacyMix, type Audience } from "./audience";
import {
  INPUTS_SCHEMA,
  type AttributeKey,
  type AttributeScore,
  type CardHighlight,
  type CardTier,
  type PlayerCard,
  type RaceResult,
  type RoutesByDay,
  type ScoutInputs,
  type SportBreakdown,
  type SportFamily,
  type Trophy,
} from "../types/player";
import type { StravaAthlete, StravaAthleteStats, StravaSummaryActivity } from "../types/strava";
import { decodePolyline, routeShape } from "./polyline";
import { awardTrophies } from "./trophies";

/** Bump whenever formulas change — cached cards with an older version are re-rated. */
export const ENGINE_VERSION = 6;

export const WINDOW_DAYS = 365;
const DAY_MS = 86_400_000;

// ---------- Scaling primitives ----------

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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
const saturate = (value: number, k: number) => toRating(1 - Math.exp(-value / k));

const weighted = (parts: [score: number, weight: number][]) => {
  const total = parts.reduce((s, [, w]) => s + w, 0);
  return Math.round(parts.reduce((s, [v, w]) => s + v * w, 0) / total);
};

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp((sorted.length - 1) * p, 0, sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ---------- Sport classification ----------

const FAMILY_BY_TYPE: Record<string, SportFamily> = {
  Run: "run",
  TrailRun: "run",
  VirtualRun: "run",
  Ride: "ride",
  VirtualRide: "ride",
  MountainBikeRide: "ride",
  GravelRide: "ride",
  EBikeRide: "ride",
  EMountainBikeRide: "ride",
  Velomobile: "ride",
  Handcycle: "ride",
  Swim: "swim",
  Hike: "foot",
  Walk: "foot",
  AlpineSki: "snow",
  BackcountrySki: "snow",
  NordicSki: "snow",
  Snowboard: "snow",
  Snowshoe: "snow",
  IceSkate: "snow",
  RollerSki: "snow",
  Rowing: "water",
  VirtualRow: "water",
  Kayaking: "water",
  Canoeing: "water",
  StandUpPaddling: "water",
  Surfing: "water",
  Kitesurf: "water",
  Windsurf: "water",
  Sail: "water",
  WeightTraining: "gym",
  Crossfit: "gym",
  Workout: "gym",
  HighIntensityIntervalTraining: "gym",
  Yoga: "gym",
  Pilates: "gym",
  Elliptical: "gym",
  StairStepper: "gym",
};

export const sportType = (a: StravaSummaryActivity) => a.sport_type ?? a.type;
export const familyOf = (a: StravaSummaryActivity): SportFamily => FAMILY_BY_TYPE[sportType(a)] ?? "other";

// ---------- Per-sport benchmarks ----------

interface SportBench {
  /** Pace model: which activity types count, sanity limits, and the speed band (m/s) mapped to 1–99. */
  pace?: { types: Set<string>; minDistanceM: number; maxMps: number; floor: number; ceiling: number };
  /** Longest single session: by distance (km) for distance sports, by duration (h) otherwise. */
  longest: { unit: "km" | "h"; floor: number; ceiling: number };
}

export const SPORT_BENCHMARKS: Record<SportFamily, SportBench> = {
  run: {
    pace: { types: new Set(["Run", "VirtualRun"]), minDistanceM: 1000, maxMps: 7, floor: 1.8, ceiling: 5.0 }, // ~9:15 → 3:20 /km
    longest: { unit: "km", floor: 3, ceiling: 100 },
  },
  ride: {
    pace: { types: new Set(["Ride", "VirtualRide", "GravelRide"]), minDistanceM: 5000, maxMps: 20, floor: 4.2, ceiling: 11.5 }, // ~15 → 41 km/h
    longest: { unit: "km", floor: 10, ceiling: 320 },
  },
  swim: {
    pace: { types: new Set(["Swim"]), minDistanceM: 200, maxMps: 2.5, floor: 0.5, ceiling: 1.45 }, // ~3:20 → 1:09 /100m
    longest: { unit: "km", floor: 0.4, ceiling: 10 },
  },
  foot: { longest: { unit: "km", floor: 3, ceiling: 60 } },
  snow: { longest: { unit: "km", floor: 3, ceiling: 60 } },
  water: { longest: { unit: "km", floor: 2, ceiling: 60 } },
  gym: { longest: { unit: "h", floor: 0.25, ceiling: 3 } },
  other: { longest: { unit: "h", floor: 0.25, ceiling: 4 } },
};

/** Strava `workout_type` values that mark a race. */
const RACE_RUN = 1;
const RACE_RIDE = 11;

const MIN_PACE_SAMPLES = 3;
/** Pace-model fallback: if a runner has too few road runs, use all their runs (incl. trail). */
const PACE_FALLBACK_TYPES: Partial<Record<SportFamily, Set<string>>> = {
  run: new Set(["Run", "VirtualRun", "TrailRun"]),
  ride: new Set(["Ride", "VirtualRide", "GravelRide", "MountainBikeRide"]),
};

// ---------- Stage 1: extraction ----------

export interface RawScoutData {
  athlete: StravaAthlete;
  stats: StravaAthleteStats;
  activities: StravaSummaryActivity[];
  /** True when the activity fetch hit the page cap before covering the full window. */
  truncated: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

function paceFor(family: SportFamily, acts: StravaSummaryActivity[]): { mps: number; samples: number } | null {
  const cfg = SPORT_BENCHMARKS[family].pace;
  if (!cfg) return null;
  const speeds = (types: Set<string>) =>
    acts
      .filter((a) => !a.manual && types.has(sportType(a)) && a.distance >= cfg.minDistanceM)
      .map((a) => a.average_speed || a.distance / a.moving_time)
      .filter((v) => v > 0 && v <= cfg.maxMps);
  let samples = speeds(cfg.types);
  const fallback = PACE_FALLBACK_TYPES[family];
  if (samples.length < MIN_PACE_SAMPLES && fallback) samples = speeds(fallback);
  if (samples.length < MIN_PACE_SAMPLES) return null;
  // Upper quartile: captures ability without trusting one GPS spike.
  return { mps: percentile(samples, 0.75), samples: samples.length };
}


/**
 * Location-free route shapes for every outdoor activity, keyed by local date.
 * Stored separately from the card and served when a calendar day is clicked.
 */
export function routesByDay(acts: StravaSummaryActivity[]): RoutesByDay {
  const out: RoutesByDay = {};
  for (const a of [...acts].sort((x, y) => x.start_date.localeCompare(y.start_date))) {
    const poly = a.map?.summary_polyline;
    if (!poly || a.trainer || a.manual) continue;
    const points = routeShape(decodePolyline(poly));
    if (!points) continue;
    const date = a.start_date_local.slice(0, 10);
    (out[date] ??= []).push({
      date,
      name: a.name,
      family: familyOf(a),
      distanceKm: round1(a.distance / 1000),
      elevationM: Math.round(a.total_elevation_gain || 0),
      movingTime: a.moving_time,
      prs: a.pr_count ?? 0,
      points,
      level: activityLevel(a),
    });
  }
  return out;
}

const isRace = (a: StravaSummaryActivity) => a.workout_type === RACE_RUN || a.workout_type === RACE_RIDE;

/**
 * Per-day moving minutes and PR counts for the `days` local calendar days ending
 * on `endDate` (YYYY-MM-DD), oldest → newest, plus races in that span (newest first).
 * Shared by the rolling 12-month window and full calendar years.
 */
export function dailySeries(acts: StravaSummaryActivity[], endDate: string, days: number): {
  minutes: number[];
  prs: number[];
  races: RaceResult[];
} {
  const endDay = Date.parse(`${endDate}T00:00:00Z`) / DAY_MS;
  const minutes = new Array<number>(days).fill(0);
  const prs = new Array<number>(days).fill(0);
  const inSpan: StravaSummaryActivity[] = [];
  for (const a of acts) {
    const idx = days - 1 - (endDay - Date.parse(`${a.start_date_local.slice(0, 10)}T00:00:00Z`) / DAY_MS);
    if (idx < 0 || idx >= days) continue;
    minutes[idx] += a.moving_time / 60;
    prs[idx] += a.pr_count ?? 0;
    inSpan.push(a);
  }
  const races = inSpan
    .filter(isRace)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
    .map((a) => ({
      date: a.start_date_local.slice(0, 10),
      name: a.name,
      family: familyOf(a),
      distanceKm: round1(a.distance / 1000),
      movingTime: a.moving_time,
    }));
  return { minutes: minutes.map(Math.round), prs, races };
}

export function extractInputs({ athlete, stats, activities, truncated }: RawScoutData, now = new Date()): ScoutInputs {
  const nowMs = now.getTime();
  const windowStart = nowMs - WINDOW_DAYS * DAY_MS;
  const acts = activities.filter((a) => {
    const t = Date.parse(a.start_date);
    return t >= windowStart && t <= nowMs + DAY_MS && a.moving_time > 0;
  });

  // If truncated, only the span we actually saw counts; annualise volume from it.
  const oldest = acts.reduce((min, a) => Math.min(min, Date.parse(a.start_date)), nowMs);
  const windowDays = truncated ? Math.max(30, Math.ceil((nowMs - oldest) / DAY_MS)) : WINDOW_DAYS;
  const annualise = WINDOW_DAYS / windowDays;
  const totalHours = acts.reduce((s, a) => s + a.moving_time, 0) / 3600;

  const byFamily = new Map<SportFamily, StravaSummaryActivity[]>();
  for (const a of acts) {
    const fam = familyOf(a);
    byFamily.set(fam, [...(byFamily.get(fam) ?? []), a]);
  }

  const sports: SportBreakdown[] = [...byFamily.entries()]
    .map(([family, list]) => {
      const hours = list.reduce((s, a) => s + a.moving_time, 0) / 3600;
      const pace = paceFor(family, list);

      return {
        family,
        activities: list.length,
        hours: round1(hours),
        share: totalHours > 0 ? round2(hours / totalHours) : 0,
        distanceKm: round1(list.reduce((s, a) => s + a.distance, 0) / 1000),
        elevationM: Math.round(list.reduce((s, a) => s + (a.total_elevation_gain || 0), 0)),
        longestKm: round1(Math.max(0, ...list.map((a) => a.distance / 1000))),
        longestHours: round2(Math.max(0, ...list.map((a) => a.moving_time / 3600))),
        paceMps: pace ? round2(pace.mps) : null,
        paceSamples: pace?.samples ?? 0,
        prs: list.reduce((sum, a) => sum + (a.pr_count ?? 0), 0),
      };
    })
    .sort((a, b) => b.hours - a.hours);

  // Consistency: distinct local active days (30d) and active weeks (12w).
  const activeDays = new Set<string>();
  const activeWeeks = new Set<number>();
  for (const a of acts) {
    const age = nowMs - Date.parse(a.start_date);
    if (age <= 30 * DAY_MS) activeDays.add(a.start_date_local.slice(0, 10));
    if (age <= 84 * DAY_MS) activeWeeks.add(Math.floor(age / (7 * DAY_MS)));
  }

  // Daily training minutes / PRs for the calendar, keyed by the athlete's local date.
  const endDate = now.toISOString().slice(0, 10);
  const series = dailySeries(acts, endDate, WINDOW_DAYS);
  const races = series.races.slice(0, 12);

  const sessions = (fam: SportFamily) => byFamily.get(fam)?.length ?? 0;
  const recentTriMix = (["run", "ride", "swim"] as const).every((f) =>
    (byFamily.get(f) ?? []).some((a) => nowMs - Date.parse(a.start_date) <= 90 * DAY_MS),
  );

  // Lifetime volume. Strava totals only cover run/ride/swim, so add other
  // sports from the window as a lower bound.
  const otherWindowHours = acts
    .filter((a) => !["run", "ride", "swim"].includes(familyOf(a)))
    .reduce((s, a) => s + a.moving_time / 3600, 0);
  const lifetimeHours =
    [stats.all_run_totals, stats.all_ride_totals, stats.all_swim_totals].reduce((s, t) => s + (t?.moving_time ?? 0) / 3600, 0) +
    otherWindowHours;
  const created = Date.parse(athlete.created_at);
  const tenureYears = Number.isFinite(created) ? Math.max(0, (nowMs - created) / (365.25 * DAY_MS)) : 0;
  const longest = (fam: SportFamily) => sports.find((s) => s.family === fam)?.longestKm ?? 0;

  return {
    schema: INPUTS_SCHEMA,
    windowDays,
    activityCount: acts.length,
    sports,
    windowHours: round1(totalHours * annualise),
    windowElevationM: Math.round(acts.reduce((s, a) => s + (a.total_elevation_gain || 0), 0) * annualise),
    activeDaysLast30: activeDays.size,
    activeWeeksLast12: activeWeeks.size,
    lifetimeHours: Math.round(lifetimeHours),
    tenureYears: Math.round(tenureYears * 10) / 10,
    dawnActivities: acts.filter((a) => Number(a.start_date_local.slice(11, 13)) < 6).length,
    longestRunKm: longest("run"),
    longestRideKm: longest("ride"),
    hasTriathlonMix: recentTriMix && sessions("run") >= 2 && sessions("ride") >= 2 && sessions("swim") >= 2,
    daily: { endDate, minutes: series.minutes, prs: series.prs },
    prCount: series.prs.reduce((a, b) => a + b, 0),
    races,
  };
}

// ---------- Stage 2: rating ----------

const LABELS: Record<AttributeKey, string> = {
  PAC: "Pace",
  END: "Endurance",
  PRS: "Records",
  CONS: "Consistency",
  VAR: "Versatility",
  PHY: "Physicality",
};

/** PRS is the noisiest stat (it favours improving athletes), so it carries the least weight with VAR. */
export const OVR_WEIGHTS: Record<AttributeKey, number> = {
  PAC: 0.2,
  END: 0.22,
  PRS: 0.1,
  CONS: 0.18,
  VAR: 0.1,
  PHY: 0.2,
};

/** Requirements to break the 89 ceiling into Icon territory. */
export const LEGACY_GATE = { minTenureYears: 3, minLifetimeHours: 1500, minActiveWeeksLast12: 9 } as const;

export const TIER_THRESHOLDS: { tier: CardTier; min: number }[] = [
  { tier: "icon", min: 90 },
  { tier: "gold", min: 70 },
  { tier: "silver", min: 55 },
  { tier: "bronze", min: 1 },
];


const n0 = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtPerKm = (mps: number) => {
  const sec = 1000 / mps;
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}/km`;
};
const fmtPer100 = (mps: number) => {
  const sec = 100 / mps;
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}/100m`;
};

const SPORT_NAME: Record<SportFamily, string> = {
  run: "run",
  ride: "ride",
  swim: "swim",
  foot: "hike",
  snow: "snow",
  water: "paddle",
  gym: "gym",
  other: "other",
};

/** Sports that count toward blends and versatility: at least 2 sessions or 3 hours. */
function countedSports(i: ScoutInputs) {
  const counted = i.sports.filter((s) => s.activities >= 2 || s.hours >= 3);
  return counted.length ? counted : i.sports;
}

/** Share-weighted average over the sports that produced a score. Null if none did. */
function blend(parts: { score: number; share: number }[]): number | null {
  const total = parts.reduce((s, p) => s + p.share, 0);
  if (!parts.length || total <= 0) return null;
  return Math.round(parts.reduce((s, p) => s + p.score * p.share, 0) / total);
}

function paceScore(s: SportBreakdown): number | null {
  const band = SPORT_BENCHMARKS[s.family].pace;
  return band && s.paceMps ? ratioScale(s.paceMps, band.floor, band.ceiling) : null;
}

function ratePace(i: ScoutInputs): AttributeScore {
  const parts = countedSports(i).flatMap((s) => {
    const score = paceScore(s);
    return score === null ? [] : [{ s, score, share: s.share }];
  });
  const value = blend(parts);
  if (value === null) {
    return { key: "PAC", label: LABELS.PAC, value: 1, measured: false, detail: "Not enough timed runs, rides or swims to measure pace" };
  }
  const text = parts.map(({ s }) =>
    s.family === "swim" ? `swim ${fmtPer100(s.paceMps!)}` : s.family === "ride" ? `ride ${(s.paceMps! * 3.6).toFixed(1)} km/h` : `run ${fmtPerKm(s.paceMps!)}`,
  );
  return { key: "PAC", label: LABELS.PAC, value, detail: `Upper-quartile pace: ${text.join(" · ")}` };
}

function rateEndurance(i: ScoutInputs): AttributeScore {
  const parts = countedSports(i).map((s) => {
    const b = SPORT_BENCHMARKS[s.family].longest;
    return { s, score: logScale(b.unit === "km" ? s.longestKm : s.longestHours, b.floor, b.ceiling), share: s.share };
  });
  const longest = blend(parts) ?? 1;
  // Time is the one sport-neutral currency, so total volume is rated in hours.
  const volume = logScale(i.windowHours, 10, 600);
  const top = parts
    .slice(0, 3)
    .map(({ s }) =>
      SPORT_BENCHMARKS[s.family].longest.unit === "km" ? `${s.longestKm} km ${SPORT_NAME[s.family]}` : `${s.longestHours.toFixed(1)} h ${SPORT_NAME[s.family]}`,
    );
  return {
    key: "END",
    label: LABELS.END,
    value: weighted([[longest, 0.45], [volume, 0.55]]),
    detail: `${top.length ? `Longest: ${top.join(" · ")} · ` : ""}${n0(i.windowHours)} h/yr moving`,
  };
}

/** Sports Strava awards PRs in: best efforts on runs, segment PRs on runs, rides and hikes. */
export const PR_FAMILIES: ReadonlySet<SportFamily> = new Set<SportFamily>(["run", "ride", "foot"]);
/** The same sports, in words. */
export const PR_SPORTS_TEXT = "runs, rides and hikes";

/** Hours and PRs across the sports Strava awards PRs in. */
export function prTotals(i: Pick<ScoutInputs, "sports">): { hours: number; prs: number } {
  const prSports = i.sports.filter((s) => PR_FAMILIES.has(s.family));
  return { hours: prSports.reduce((sum, s) => sum + s.hours, 0), prs: prSports.reduce((sum, s) => sum + s.prs, 0) };
}
/** Hours of those sports needed before PRs are rated; fewer shows "–". */
export const MIN_PR_HOURS = 10;
/** Small samples are pulled toward a typical ~2 PRs per 10 h until there's enough to trust. */
const PR_PRIOR = { per10: 2, hours: 10 };

/**
 * How often you beat your own best: PRs per 10 hours of runs, rides and hikes.
 * Per hour, so training more doesn't win on its own; PRs from other sports
 * don't count. 0.2 → 1, 2 → 50, 20 → 99 (log of the rate).
 */
function ratePRs(i: ScoutInputs): AttributeScore {
  const { hours, prs } = prTotals(i);
  if (hours < MIN_PR_HOURS) {
    return { key: "PRS", label: LABELS.PRS, value: 1, measured: false, detail: `Needs ${MIN_PR_HOURS}+ hours of ${PR_SPORTS_TEXT}` };
  }
  const per10 = ((prs + (PR_PRIOR.per10 / 10) * PR_PRIOR.hours) / (hours + PR_PRIOR.hours)) * 10;
  return {
    key: "PRS",
    label: LABELS.PRS,
    value: ratioScale(per10, 0.2, 20),
    detail: `${n0(prs)} PRs in ${n0(hours)} h of ${PR_SPORTS_TEXT} · ${((prs / hours) * 10).toFixed(1)} per 10 h`,
  };
}

function rateConsistency(i: ScoutInputs): AttributeScore {
  const days = saturate(i.activeDaysLast30, 9);
  const weeks = toRating(i.activeWeeksLast12 / 12);
  return {
    key: "CONS",
    label: LABELS.CONS,
    value: weighted([[days, 0.65], [weeks, 0.35]]),
    detail: `${i.activeDaysLast30} active days in last 30 · ${i.activeWeeksLast12}/12 weeks active`,
  };
}

function rateVersatility(i: ScoutInputs): AttributeScore {
  const fams = countedSports(i).filter((s) => s.activities >= 2 || s.hours >= 3);
  if (!fams.length) return { key: "VAR", label: LABELS.VAR, value: 1, detail: "No activities in the last year" };
  const breadth = toRating(1 - Math.exp(-0.55 * fams.length));
  // Shannon evenness of time split, normalised so 4 evenly-split sports = 1.
  const totalHours = fams.reduce((s, f) => s + f.hours, 0) || 1;
  const entropy = -fams.reduce((s, f) => {
    const p = f.hours / totalHours;
    return p > 0 ? s + p * Math.log(p) : s;
  }, 0);
  const evenness = toRating(entropy / Math.log(4));
  const triBonus = i.hasTriathlonMix ? 6 : 0;
  return {
    key: "VAR",
    label: LABELS.VAR,
    value: clamp(weighted([[breadth, 0.5], [evenness, 0.5]]) + triBonus, 1, 99),
    detail: `${fams.length} ${fams.length === 1 ? "sport" : "sports"}: ${fams
      .map((f) => `${SPORT_NAME[f.family]} ${Math.round((f.hours / totalHours) * 100)}%`)
      .join(", ")}${triBonus ? " · triathlon bonus" : ""}`,
  };
}

function ratePhysicality(i: ScoutInputs): AttributeScore {
  const volume = logScale(i.lifetimeHours, 20, 6000);
  const tenure = logScale(i.tenureYears, 0.25, 12);
  return {
    key: "PHY",
    label: LABELS.PHY,
    value: weighted([[volume, 0.7], [tenure, 0.3]]),
    detail: `${n0(i.lifetimeHours)} lifetime hours · ${i.tenureYears} yrs on Strava`,
  };
}

export function tierFor(overall: number): CardTier {
  return TIER_THRESHOLDS.find((t) => overall >= t.min)?.tier ?? "bronze";
}

const POSITION_BY_FAMILY: Record<SportFamily, string> = {
  run: "RUN",
  ride: "CYC",
  swim: "SWM",
  foot: "HIK",
  snow: "SKI",
  water: "ROW",
  gym: "GYM",
  other: "ATH",
};

const ARCHETYPES: Record<AttributeKey, string> = {
  PAC: "Speedster",
  END: "Diesel Engine",
  PRS: "Record Breaker",
  CONS: "Metronome",
  VAR: "Swiss Army Knife",
  PHY: "Veteran Workhorse",
};

/** The sport-specific number on the card: what that kind of athlete brags about. */
export function highlightFor(i: ScoutInputs, position: string): CardHighlight {
  const perYear = (n: number) => n * (WINDOW_DAYS / i.windowDays);
  const km = (fam: SportFamily) => perYear(i.sports.find((s) => s.family === fam)?.distanceKm ?? 0);
  const fmtKm = (n: number) => n0(n);
  switch (position) {
    case "RUN":
      return { value: `${fmtKm(km("run"))} KM`, label: "RUN / YR", climb: false };
    case "SWM":
      return { value: `${fmtKm(km("swim"))} KM`, label: "SWUM / YR", climb: false };
    case "ROW":
      return { value: `${fmtKm(km("water"))} KM`, label: "PADDLED / YR", climb: false };
    case "CYC":
    case "HIK":
    case "SKI":
      return { value: `${fmtKm(i.windowElevationM / 1000)} KM`, label: "CLIMBED / YR", climb: true };
    default:
      return { value: `${n0(i.windowHours)} H`, label: "TRAINED / YR", climb: false };
  }
}

/** False only for stats the athlete's sports give us no data for (shown as "–"). */
export const isMeasured = (a: Pick<AttributeScore, "measured">) => a.measured !== false;

export interface Rating {
  attributes: Record<AttributeKey, AttributeScore>;
  overall: number;
  tier: CardTier;
  legacyCapped: boolean;
  position: string;
  archetype: string;
  highlight: CardHighlight;
  trophies: Trophy[];
}

export function rateInputs(i: ScoutInputs): Rating {
  const list = [ratePace(i), rateEndurance(i), ratePRs(i), rateConsistency(i), rateVersatility(i), ratePhysicality(i)];
  const attributes = Object.fromEntries(list.map((a) => [a.key, a])) as Record<AttributeKey, AttributeScore>;
  // Stats we couldn't measure sit out; `weighted` renormalises over the rest.
  const measured = list.filter(isMeasured);

  let overall = weighted(measured.map((a) => [a.value, OVR_WEIGHTS[a.key]]));
  let legacyCapped = false;
  const legacyOk =
    i.tenureYears >= LEGACY_GATE.minTenureYears &&
    i.lifetimeHours >= LEGACY_GATE.minLifetimeHours &&
    i.activeWeeksLast12 >= LEGACY_GATE.minActiveWeeksLast12;
  if (overall >= 90 && !legacyOk) {
    overall = 89;
    legacyCapped = true;
  }
  overall = clamp(overall, 1, 99);

  const top = [...measured].sort((a, b) => b.value - a.value)[0];
  const primary = i.sports[0]?.family;
  const position =
    i.hasTriathlonMix && attributes.VAR.value >= 70 ? "TRI" : primary ? POSITION_BY_FAMILY[primary] : "ATH";

  return {
    attributes,
    overall,
    tier: tierFor(overall),
    legacyCapped,
    position,
    archetype: ARCHETYPES[top.key],
    highlight: highlightFor(i, position),
    trophies: awardTrophies(i),
  };
}

// ---------- Card assembly ----------

/** App paths a Strava username must never shadow; those athletes use their numeric id. */
export const RESERVED_SLUGS = new Set(["guide", "privacy", "api", "settings", "login", "logout", "about", "admin", "help", "icon"]);

export function slugFor(athlete: Pick<StravaAthlete, "id" | "username">): string {
  const username = athlete.username?.trim().toLowerCase();
  // Share-link tokens use the "link-" prefix, so usernames can't collide with them either.
  if (!username || RESERVED_SLUGS.has(username) || username.startsWith("link-")) return String(athlete.id);
  return username;
}

/** "Hanson Qin" → "HANSON Q." (Strava often exposes only a last initial anyway). */
export function displayNameFor(athlete: Pick<StravaAthlete, "firstname" | "lastname">): string {
  const first = athlete.firstname?.trim() ?? "";
  const lastInitial = athlete.lastname?.trim().replace(/\./g, "").charAt(0) ?? "";
  if (!first) return lastInitial ? `${lastInitial}.` : "ATHLETE";
  return (lastInitial ? `${first} ${lastInitial}.` : first).toUpperCase();
}

/** A bundled demo-card photo path, e.g. "/demo-avatars/fox.jpg". */
export const isDemoAvatar = (url: string | null | undefined): url is string => !!url && /^\/demo-avatars\/[a-z-]+\.jpg$/.test(url);

export function buildCard(raw: RawScoutData, now = new Date()): PlayerCard {
  const { athlete } = raw;
  const inputs = extractInputs(raw, now);
  const rating = rateInputs(inputs);
  // Strava photo URLs; demo athletes use bundled photos (public/demo-avatars). Strava's placeholder paths are dropped.
  const avatar = athlete.profile?.startsWith("http") || isDemoAvatar(athlete.profile) ? athlete.profile : null;
  const location = [athlete.city, athlete.state].filter(Boolean).join(", ") || null;

  return {
    athleteId: athlete.id,
    slug: slugFor(athlete),
    name: `${athlete.firstname ?? ""} ${athlete.lastname ?? ""}`.trim(),
    displayName: displayNameFor(athlete),
    avatarUrl: avatar,
    location,
    country: athlete.country || null,
    ...rating,
    inputs,
    memberSince: athlete.created_at,
    history: [{ date: now.toISOString().slice(0, 10), overall: rating.overall }],
    scoutedAt: now.toISOString(),
    engineVersion: ENGINE_VERSION,
  };
}

export type AudienceCards = Record<Audience, PlayerCard>;

/**
 * One card per audience (lib/audience.ts), each built only from the activities
 * that audience may see on Strava, with its own rating history. The owner card
 * also records the privacy mix so the owner can see what visitors get.
 * Lifetime totals come from Strava's stats endpoint, which only counts
 * Everyone activities, so they're safe to share with every audience.
 */
export function buildAudienceCards(raw: RawScoutData, previous: Partial<AudienceCards>, now = new Date()): AudienceCards {
  const build = (audience: Audience) =>
    withHistory({ ...buildCard({ ...raw, activities: activitiesFor(raw.activities, audience) }, now), audience }, previous[audience] ?? null);
  return {
    owner: { ...build("owner"), privacy: privacyMix(raw.activities) },
    link: build("link"),
    public: build("public"),
  };
}

export const RATING_HISTORY_MAX = 26;

/**
 * Appends the fresh card's rating to the previous card's history. A second
 * scout on the same day replaces that day's point rather than adding one.
 */
export function withHistory(fresh: PlayerCard, previous: PlayerCard | null): PlayerCard {
  const point = fresh.history.at(-1)!;
  const past = (previous?.history ?? []).filter((h) => h.date !== point.date);
  return { ...fresh, history: [...past, point].slice(-RATING_HISTORY_MAX) };
}

/** Re-rates a cached card after a formula change without calling Strava. Null if its inputs are from an older schema. */
export function rerateCard(card: PlayerCard): PlayerCard | null {
  if (card.inputs?.schema !== INPUTS_SCHEMA) return null;
  const rated = { ...card, ...rateInputs(card.inputs), engineVersion: ENGINE_VERSION };
  // The newest history point reflects the latest formula.
  const history = card.history?.length ? [...card.history.slice(0, -1), { ...card.history.at(-1)!, overall: rated.overall }] : [];
  return { ...rated, history };
}
