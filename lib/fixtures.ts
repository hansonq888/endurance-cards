/**
 * Deterministic synthetic Strava data for tests and the landing-page demo.
 * No I/O — safe to import anywhere.
 */
import type { StravaActivityTotal, StravaAthlete, StravaAthleteStats, StravaSummaryActivity } from "../types/strava";
import type { RawScoutData } from "./engine";
import { encodePolyline, type LatLng } from "./polyline";

const DAY = 86_400_000;

/** Mulberry32 PRNG so fixtures are stable across runs. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SessionTemplate {
  sport_type: string;
  type?: string;
  /** Sessions per week. */
  perWeek: number;
  km: [min: number, max: number];
  /** m/s */
  speed: [min: number, max: number];
  /** m per km */
  climb: [min: number, max: number];
  /** Session length for distance-less sports (gym, yoga…). */
  minutes?: [min: number, max: number];
  /** Average heart rate range; max HR is recorded ~15–25 bpm above it. */
  hr?: [min: number, max: number];
  /** Chance (0–1) that a session is tagged as a race. */
  race?: number;
}

export interface AthleteProfile {
  seed: number;
  tenureYears: number;
  lifetimeHours: { run: number; ride: number; swim: number };
  sessions: SessionTemplate[];
  /** Weeks (counting back from now) with no activity — models time off. */
  restWeeks?: number[];
  /** Share of runs/rides/swims that are workouts: ~15% faster than usual, half of them tagged on Strava. */
  workoutShare?: number;
  /** Extra PRs per run/ride/hike on average: how much of a segment and best-effort hunter they are. */
  prHunting?: number;
}

const PR_SPORTS = new Set(["Run", "TrailRun", "Ride", "GravelRide", "MountainBikeRide", "Hike", "Walk"]);

const TYPE_FOR: Record<string, string> = { TrailRun: "Run", VirtualRun: "Run", GravelRide: "Ride", VirtualRide: "Ride" };

function total(hours: number, kmPerHour: number): StravaActivityTotal {
  return {
    count: Math.round(hours),
    distance: hours * kmPerHour * 1000,
    moving_time: hours * 3600,
    elapsed_time: hours * 3700,
    elevation_gain: hours * kmPerHour * 8,
  };
}

const HOME: LatLng = [40.015, -105.27];
/** Sports that get a GPS track in fixtures. */
const TRACKED = new Set(["Run", "TrailRun", "Ride", "GravelRide", "Hike", "Walk", "NordicSki"]);

/** A plausible GPS track of roughly `km`: a wobbly loop, an out-and-back, or a point-to-point. */
function syntheticTrack(rand: () => number, km: number): LatLng[] {
  const metres = km * 1000;
  const lat0 = (HOME[0] * Math.PI) / 180;
  const toLatLng = ([x, y]: [number, number]): LatLng => [HOME[0] + y / 110_540, HOME[1] + x / (111_320 * Math.cos(lat0))];
  const ox = (rand() - 0.5) * 6000;
  const oy = (rand() - 0.5) * 6000;
  const pts: [number, number][] = [];
  const kind = rand();
  if (kind < 0.55) {
    // Loop: circle perimeter ≈ distance, with a few harmonics so each one is unique.
    const r = metres / (2 * Math.PI);
    const h = [2, 3, 5].map((k) => ({ k, a: rand() * 0.25 / k, p: rand() * 6.28 }));
    const a0 = rand() * 6.28;
    for (let i = 0; i <= 90; i++) {
      const t = a0 + (i / 90) * Math.PI * 2;
      const w = 1 + h.reduce((acc, x) => acc + x.a * Math.sin(x.k * t + x.p), 0);
      pts.push([ox + Math.cos(t) * r * w, oy + Math.sin(t) * r * w]);
    }
  } else {
    // Wandering line; out-and-backs retrace it.
    const outAndBack = kind < 0.85;
    const len = outAndBack ? metres / 2 : metres;
    let heading = rand() * 6.28;
    let [x, y] = [ox, oy];
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      pts.push([x, y]);
      heading += (rand() - 0.5) * 0.6;
      x += Math.cos(heading) * (len / steps);
      y += Math.sin(heading) * (len / steps);
    }
    if (outAndBack) pts.push(...[...pts].reverse().map(([px, py]) => [px + 12, py + 12] as [number, number]));
  }
  return pts.map(toLatLng);
}

export function syntheticAthlete(profile: AthleteProfile, now = new Date()): RawScoutData {
  const rand = rng(profile.seed);
  const between = ([a, b]: [number, number]) => a + (b - a) * rand();
  const nowMs = now.getTime();
  const activities: StravaSummaryActivity[] = [];
  let id = profile.seed * 100_000;

  for (let day = 0; day < 365; day++) {
    if (profile.restWeeks?.includes(Math.floor(day / 7))) continue;
    for (const s of profile.sessions) {
      if (rand() > s.perWeek / 7) continue;
      const km = between(s.km);
      // Workouts are picked from the activity id, not rand(), so the rest of the synthetic data doesn't shift.
      const isWorkout = unit(id * 7919) < (profile.workoutShare ?? 0) && !s.minutes;
      const speed = between(s.speed) * (isWorkout ? 1.15 : 1);
      // Mostly 6am–8pm, with the odd pre-dawn start (drives Dawn Patrol realistically).
      const dayStart = Math.floor((nowMs - day * DAY) / DAY) * DAY;
      const hour = rand() < 0.08 ? between([4.5, 6]) : between([6, 20]);
      const start = new Date(Math.min(nowMs - 3_600_000, dayStart + hour * 3_600_000));
      const moving = s.minutes ? between(s.minutes) * 60 : (km * 1000) / speed;
      const avgHr = s.hr ? Math.round(between(s.hr)) : undefined;
      const family = s.type ?? TYPE_FOR[s.sport_type] ?? s.sport_type;
      const isRace = !!s.race && rand() < s.race && (family === "Run" || family === "Ride");
      // PRs cluster on races and hard days.
      const basePrs = isRace ? 1 + Math.floor(rand() * 4) : rand() < 0.06 ? 1 + Math.floor(rand() * 2) : 0;
      // Hash-based (not rand()) so the rest of the synthetic data doesn't shift.
      const hunts = PR_SPORTS.has(s.sport_type) ? Math.floor((profile.prHunting ?? 0) * 2 * unit(id * 48_271) + unit(id * 69_621)) : 0;
      const prs = basePrs + hunts;
      activities.push({
        id: id++,
        name: isRace ? `${Math.round(km)}K ${family === "Ride" ? "Road Race" : "Race"}` : s.sport_type,
        type: s.type ?? TYPE_FOR[s.sport_type] ?? s.sport_type,
        sport_type: s.sport_type,
        distance: km * 1000,
        moving_time: Math.round(moving),
        elapsed_time: Math.round(moving * 1.05),
        total_elevation_gain: km * between(s.climb),
        start_date: start.toISOString(),
        start_date_local: start.toISOString(),
        average_speed: s.minutes ? 0 : speed,
        max_speed: s.minutes ? 0 : speed * 1.4,
        ...(avgHr ? { average_heartrate: avgHr, max_heartrate: avgHr + Math.round(between([15, 25])) } : {}),
        workout_type: isRace ? (family === "Ride" ? 11 : 1) : isWorkout && unit(id * 104_729) < 0.5 ? (family === "Ride" ? 12 : 3) : null,
        map: { id: `a${id}`, summary_polyline: TRACKED.has(s.sport_type) && km > 1 ? encodePolyline(syntheticTrack(rand, km)) : null },
        pr_count: prs,
        achievement_count: prs + (rand() < 0.2 ? 1 : 0),
        // Like real athletes: mostly Everyone, some Followers and Only You (races are always shown).
        // Derived from the id, not rand(), so the rest of the synthetic data doesn't shift.
        ...visibilityFor(id, isRace),
      });
    }
  }

  const athlete: StravaAthlete = {
    id: profile.seed,
    username: `athlete${profile.seed}`,
    firstname: "Demo",
    lastname: "Athlete",
    city: "Boulder",
    state: "CO",
    country: "United States",
    sex: null,
    created_at: new Date(nowMs - profile.tenureYears * 365.25 * DAY).toISOString(),
    updated_at: now.toISOString(),
    profile: "avatar/athlete/large.png",
    profile_medium: "avatar/athlete/medium.png",
  };

  const empty = total(0, 0);
  const stats: StravaAthleteStats = {
    biggest_ride_distance: null,
    biggest_climb_elevation_gain: null,
    recent_ride_totals: empty,
    recent_run_totals: empty,
    recent_swim_totals: empty,
    ytd_ride_totals: empty,
    ytd_run_totals: empty,
    ytd_swim_totals: empty,
    all_run_totals: total(profile.lifetimeHours.run, 11),
    all_ride_totals: total(profile.lifetimeHours.ride, 28),
    all_swim_totals: total(profile.lifetimeHours.swim, 3),
  };

  return { athlete, stats, activities: activities.sort((a, b) => b.start_date.localeCompare(a.start_date)), truncated: false };
}

export const PROFILES = {
  casualJogger: {
    prHunting: 0.3,
    workoutShare: 0.02,
    seed: 11,
    tenureYears: 1,
    lifetimeHours: { run: 60, ride: 0, swim: 0 },
    sessions: [{ sport_type: "Run", perWeek: 1.2, km: [3, 6], speed: [2.4, 2.8], climb: [2, 6] }],
    restWeeks: [2, 3, 7, 8, 9, 15, 16, 20, 30, 31],
  },
  dedicatedRunner: {
    prHunting: 0.1,
    workoutShare: 0.03,
    seed: 22,
    tenureYears: 4,
    lifetimeHours: { run: 600, ride: 40, swim: 0 },
    sessions: [
      { sport_type: "Run", perWeek: 4, km: [8, 16], speed: [3.0, 3.6], climb: [4, 10] },
      { sport_type: "Run", perWeek: 0.8, km: [22, 34], speed: [3.1, 3.4], climb: [5, 9], race: 0.12 },
      { sport_type: "WeightTraining", perWeek: 1, km: [0, 0], speed: [1, 1], climb: [0, 0], minutes: [40, 60] },
    ],
  },
  triathlete: {
    prHunting: 0.3,
    workoutShare: 0.18,
    seed: 33,
    tenureYears: 6,
    lifetimeHours: { run: 900, ride: 1400, swim: 400 },
    sessions: [
      { sport_type: "Run", perWeek: 3, km: [8, 18], speed: [3.4, 4.0], climb: [3, 9], race: 0.03 },
      { sport_type: "Ride", perWeek: 3, km: [40, 110], speed: [8.0, 9.4], climb: [6, 14], race: 0.02 },
      { sport_type: "Swim", perWeek: 3, km: [2, 4], speed: [1.0, 1.2], climb: [0, 0] },
    ],
  },
  eliteMountainRunner: {
    prHunting: 1.4,
    workoutShare: 0.32,
    seed: 44,
    tenureYears: 10,
    lifetimeHours: { run: 5200, ride: 300, swim: 0 },
    sessions: [
      { sport_type: "Run", perWeek: 6, km: [12, 22], speed: [4.2, 4.9], climb: [10, 30] },
      { sport_type: "TrailRun", perWeek: 2, km: [25, 60], speed: [2.8, 3.4], climb: [35, 60], race: 0.04 },
      { sport_type: "Hike", perWeek: 0.5, km: [10, 25], speed: [1.2, 1.5], climb: [60, 90] },
      { sport_type: "NordicSki", perWeek: 0.5, km: [15, 30], speed: [3.5, 4.5], climb: [10, 20] },
      { sport_type: "Ride", perWeek: 2, km: [40, 90], speed: [8.5, 10], climb: [12, 22] },
    ],
  },
  poolSwimmer: {
    workoutShare: 0.2,
    seed: 55,
    tenureYears: 3,
    lifetimeHours: { run: 0, ride: 0, swim: 700 },
    sessions: [{ sport_type: "Swim", perWeek: 5, km: [2.5, 5], speed: [1.15, 1.35], climb: [0, 0], hr: [135, 158] }],
  },
  gymGoer: {
    workoutShare: 0,
    seed: 66,
    tenureYears: 2,
    lifetimeHours: { run: 20, ride: 0, swim: 0 },
    sessions: [
      { sport_type: "WeightTraining", perWeek: 4, km: [0, 0], speed: [1, 1], climb: [0, 0], minutes: [45, 75], hr: [110, 130] },
      { sport_type: "Run", perWeek: 0.5, km: [3, 5], speed: [2.6, 3.0], climb: [2, 5], hr: [150, 165] },
    ],
  },
} satisfies Record<string, AthleteProfile>;

/** ~5% Only You, ~10% Followers, the rest Everyone. */
function visibilityFor(id: number, isRace: boolean): Pick<StravaSummaryActivity, "visibility" | "private"> {
  if (!isRace && id % 20 === 7) return { visibility: "only_me", private: true };
  if (!isRace && id % 10 === 3) return { visibility: "followers_only", private: false };
  return { visibility: "everyone", private: false };
}

/** Deterministic 0–1 hash of an integer. */
function unit(n: number): number {
  return (((n ^ (n >>> 13)) * 2_654_435_761) >>> 0) / 4_294_967_296;
}
