/**
 * Stage 1 of the engine: raw Strava payloads → ScoutInputs (sport-normalised
 * facts), plus the per-day series and route shapes used by the calendar.
 */
import { activityLevel } from "./sharing";
import { INPUTS_SCHEMA, type RaceResult, type RoutesByDay, type ScoutInputs, type SportBreakdown, type SportFamily } from "@/types/player";
import type { StravaAthlete, StravaAthleteStats, StravaSummaryActivity } from "@/types/strava";
import { decodePolyline, routeShape } from "./polyline";
import { DAY_MS } from "./format";
import { percentile } from "./scales";
import { MIN_PACE_SAMPLES, PACE_FALLBACK_TYPES, RACE_RIDE, RACE_RUN, SPORT_BENCHMARKS, familyOf, sportType } from "./sports";

export const WINDOW_DAYS = 365;

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
