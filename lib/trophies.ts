/**
 * Trophy definitions. Every trophy has three levels (I → III) with steeply
 * rising targets: level I is reachable for most regular athletes, level III
 * is genuinely rare. Values are derived from cached ScoutInputs, so progress
 * can be shown without touching Strava.
 *
 * Pure module (no engine import) so the engine, UI and guide can all use it.
 */
import type { ScoutInputs, Trophy, TrophyLevel } from "../types/player";

export interface TrophyDef {
  id: string;
  name: string;
  /** What's being measured, e.g. "Longest run". */
  measure: string;
  unit: string;
  /** Targets for levels I, II, III (ascending). */
  levels: [number, number, number];
  /** Optional names per level, e.g. Half / Full / Ultra. */
  levelNames?: [string, string, string];
  value: (i: ScoutInputs) => number;
  /** Rounds/labels a value for display. */
  format?: (n: number) => string;
}

const n0 = (n: number) => Math.round(n).toLocaleString("en-US");

/** Longest run of consecutive active days in the window. */
function longestDayStreak(minutes: number[]): number {
  let best = 0;
  let run = 0;
  for (const m of minutes) {
    run = m > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Longest run of consecutive weeks (7-day blocks, newest last) with any activity. */
function longestWeekStreak(minutes: number[]): number {
  let best = 0;
  let run = 0;
  // Walk back from the newest day so the current week is a full block.
  for (let end = minutes.length; end > 0; end -= 7) {
    const active = minutes.slice(Math.max(0, end - 7), end).some((m) => m > 0);
    run = active ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

const sessions = (i: ScoutInputs, family: string) => i.sports.find((s) => s.family === family)?.activities ?? 0;
const countedSports = (i: ScoutInputs) => i.sports.filter((s) => s.activities >= 2 || s.hours >= 3).length;

export const TROPHIES: TrophyDef[] = [
  {
    id: "iron-streak",
    name: "Iron Streak",
    measure: "Longest daily streak",
    unit: "days",
    levels: [14, 45, 120],
    value: (i) => longestDayStreak(i.daily.minutes),
  },
  {
    id: "unbroken",
    name: "Unbroken",
    measure: "Consecutive active weeks",
    unit: "weeks",
    levels: [12, 26, 52],
    value: (i) => longestWeekStreak(i.daily.minutes),
  },
  {
    id: "workhorse",
    name: "Workhorse",
    measure: "Hours trained this year",
    unit: "h",
    levels: [200, 400, 700],
    value: (i) => i.windowHours,
    format: n0,
  },
  {
    id: "long-runner",
    name: "Long Runner",
    measure: "Longest run",
    unit: "km",
    levels: [21.1, 42.2, 100],
    levelNames: ["Half", "Marathon", "100K"],
    value: (i) => i.longestRunKm,
  },
  {
    id: "century",
    name: "Century",
    measure: "Longest ride",
    unit: "km",
    levels: [100, 160.9, 300],
    levelNames: ["100K", "100 mi", "300K"],
    value: (i) => i.longestRideKm,
  },
  {
    id: "everest-club",
    name: "Everest Club",
    measure: "Climbed this year",
    unit: "m",
    levels: [8849, 44245, 88490],
    levelNames: ["1× Everest", "5× Everest", "10× Everest"],
    value: (i) => i.windowElevationM,
    format: n0,
  },
  {
    id: "pr-machine",
    name: "PR Machine",
    measure: "Personal records this year",
    unit: "PRs",
    levels: [10, 50, 150],
    value: (i) => i.prCount,
  },
  {
    id: "racer",
    name: "Racer",
    measure: "Races this year",
    unit: "races",
    levels: [1, 5, 12],
    value: (i) => i.races.length,
  },
  {
    id: "triathlete",
    name: "Triathlete",
    measure: "Sessions in your least-done of run / ride / swim",
    unit: "each",
    levels: [3, 20, 50],
    value: (i) => Math.min(sessions(i, "run"), sessions(i, "ride"), sessions(i, "swim")),
  },
  {
    id: "polyglot",
    name: "Polyglot",
    measure: "Different sports",
    unit: "sports",
    levels: [3, 4, 5],
    value: countedSports,
  },
  {
    id: "dawn-patrol",
    name: "Dawn Patrol",
    measure: "Sessions started before 6am",
    unit: "sessions",
    levels: [10, 50, 150],
    value: (i) => i.dawnActivities,
  },
  {
    id: "veteran",
    name: "Veteran",
    measure: "Years on Strava",
    unit: "yrs",
    levels: [2, 5, 10],
    value: (i) => i.tenureYears,
  },
];

export const LEVEL_NUMERALS = ["I", "II", "III"] as const;

export function formatValue(def: TrophyDef, n: number): string {
  return def.format ? def.format(n) : String(Math.round(n * 10) / 10);
}

/** Highest level reached (0 = locked). */
export function levelFor(def: TrophyDef, value: number): 0 | TrophyLevel {
  if (value >= def.levels[2]) return 3;
  if (value >= def.levels[1]) return 2;
  if (value >= def.levels[0]) return 1;
  return 0;
}

export interface TrophyProgress {
  def: TrophyDef;
  value: number;
  level: 0 | TrophyLevel;
  /** Next target, or null when maxed out. */
  next: number | null;
  /** 0–1 progress from the previous target to the next. */
  fraction: number;
}

export function trophyProgress(i: ScoutInputs): TrophyProgress[] {
  return TROPHIES.map((def) => {
    const value = def.value(i);
    const level = levelFor(def, value);
    const next = level === 3 ? null : def.levels[level as 0 | 1 | 2];
    const prev = level === 0 ? 0 : def.levels[(level - 1) as 0 | 1 | 2];
    const fraction = next === null ? 1 : Math.max(0, Math.min(1, (value - prev) / (next - prev)));
    return { def, value, level, next, fraction };
  });
}

/** Earned trophies (level ≥ I), highest level first. Stored on the card. */
export function awardTrophies(i: ScoutInputs): Trophy[] {
  return trophyProgress(i)
    .filter((p): p is TrophyProgress & { level: TrophyLevel } => p.level > 0)
    .sort((a, b) => b.level - a.level)
    .map(({ def, level, value }) => ({
      id: def.id,
      name: def.name,
      level,
      description: `${def.levelNames ? `${def.levelNames[level - 1]} · ` : ""}${def.measure}: ${formatValue(def, value)} ${def.unit}`,
    }));
}
