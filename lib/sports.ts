/** Sport classification (Strava types → families), per-sport benchmarks and names. */
import type { SportBreakdown, SportFamily } from "@/types/player";
import type { StravaSummaryActivity } from "@/types/strava";

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

/** Display names, shared by the scout report, charts and engine detail strings. */
export const SPORT_LABELS: Record<SportFamily, string> = {
  run: "Run",
  ride: "Ride",
  swim: "Swim",
  snow: "Snow",
  foot: "Hike",
  water: "Paddle",
  gym: "Gym",
  other: "Other",
};

/** A sport counts toward blends, versatility and trophies once it has 2 sessions or 3 hours. */
export const isCountedSport = (s: SportBreakdown) => s.activities >= 2 || s.hours >= 3;

/** The athlete's counted sports, or every sport if none qualifies yet (so a new athlete still gets rated). */
export function countedSports(sports: SportBreakdown[]): SportBreakdown[] {
  const counted = sports.filter(isCountedSport);
  return counted.length ? counted : sports;
}

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
export const RACE_RUN = 1;
export const RACE_RIDE = 11;

export const MIN_PACE_SAMPLES = 3;
/** Pace-model fallback: if a runner has too few road runs, use all their runs (incl. trail). */
export const PACE_FALLBACK_TYPES: Partial<Record<SportFamily, Set<string>>> = {
  run: new Set(["Run", "VirtualRun", "TrailRun"]),
  ride: new Set(["Ride", "VirtualRide", "GravelRide", "MountainBikeRide"]),
};
