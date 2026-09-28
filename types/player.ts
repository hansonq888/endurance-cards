/** Core domain types for Strava-FUT player cards. */

export const ATTRIBUTE_KEYS = ["PAC", "END", "PWR", "CONS", "VAR", "PHY"] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export type CardTier = "bronze" | "silver" | "gold" | "icon";

/** Coarse families used for versatility and position. */
export type SportFamily =
  | "run"
  | "ride"
  | "swim"
  | "foot" // hike / walk
  | "snow"
  | "water" // paddle / row / board sports
  | "gym"
  | "other";

export interface AttributeScore {
  key: AttributeKey;
  label: string;
  /** 1–99 */
  value: number;
  /** Human-readable explanation of the raw inputs that drove the score. */
  detail: string;
}

export type TrophyLevel = 1 | 2 | 3;

export interface Trophy {
  id: string;
  name: string;
  /** I, II or III — see lib/trophies.ts for targets. */
  level: TrophyLevel;
  description: string;
}

/** Per-sport facts over the analysis window. Each sport is later rated against its own benchmarks. */
export interface SportBreakdown {
  family: SportFamily;
  activities: number;
  /** Moving hours in the window (not annualised). */
  hours: number;
  /** Share (0–1) of the athlete's window hours. */
  share: number;
  distanceKm: number;
  elevationM: number;
  longestKm: number;
  longestHours: number;
  /** Upper-quartile average speed (m/s); null for sports without a pace model or too few samples. */
  paceMps: number | null;
  paceSamples: number;
  /** Metres climbed per moving hour; null for non-terrain sports. */
  climbRateMPerH: number | null;
  /** Share (0–1) of sessions steeper than the sport's "hilly" threshold; null for non-terrain sports. */
  hillyShare: number | null;
  /** Mean of average HR / max HR across sessions with heart-rate data. */
  hrIntensity: number | null;
  hrSamples: number;
}

/** Route shapes keyed by local date (YYYY-MM-DD); stored apart from the card. */
export type RoutesByDay = Record<string, RouteShape[]>;

/**
 * A route reduced to its shape: ends trimmed, normalised into a unit box, no
 * coordinates. Safe to show publicly.
 */
export interface RouteShape {
  /** Local date, YYYY-MM-DD. */
  date: string;
  name: string;
  family: SportFamily;
  distanceKm: number;
  elevationM: number;
  /** Moving time in seconds. */
  movingTime: number;
  prs: number;
  /** Flat [x0, y0, x1, y1, …] in 0..1, north up. */
  points: number[];
}

export interface RaceResult {
  /** Local date, YYYY-MM-DD. */
  date: string;
  name: string;
  family: SportFamily;
  distanceKm: number;
  /** Moving time in seconds. */
  movingTime: number;
}

/** One full calendar year of training, fetched on demand and cached. */
export interface YearCalendar {
  year: number;
  /** Always `${year}-12-31`; arrays run Jan 1 → Dec 31. */
  endDate: string;
  minutes: number[];
  prs: number[];
  races: RaceResult[];
  /** ISO timestamp of the fetch. */
  fetchedAt: string;
}

/** Bump when the ScoutInputs shape changes; cached cards with another schema are re-scouted. */
export const INPUTS_SCHEMA = 6;

/**
 * Aggregated facts extracted from raw Strava payloads. The engine turns these
 * into ratings; they are also cached so formulas can be tuned without
 * re-hitting Strava.
 */
export interface ScoutInputs {
  schema: typeof INPUTS_SCHEMA;
  /** Days of history actually analysed (< 365 only when the activity fetch was truncated). */
  windowDays: number;
  activityCount: number;
  /** Sorted by hours, most first. */
  sports: SportBreakdown[];
  /** Moving hours over the window, annualised to 365 days. */
  windowHours: number;
  /** Elevation gain over the window, annualised to 365 days. */
  windowElevationM: number;
  /** Estimated max heart rate (98th percentile of recorded maxima), if HR data exists. */
  maxHeartRate: number | null;
  activeDaysLast30: number;
  activeWeeksLast12: number;
  lifetimeHours: number;
  tenureYears: number;
  /** Activities that started before 06:00 local time. */
  dawnActivities: number;
  longestRunKm: number;
  longestRideKm: number;
  hasTriathlonMix: boolean;
  /**
   * Per local calendar day, oldest → newest, ending on `endDate` (YYYY-MM-DD):
   * moving minutes and personal records set.
   */
  daily: { endDate: string; minutes: number[]; prs: number[] };
  /** PRs and achievements (segment/best-effort awards) earned in the window. */
  prCount: number;
  achievementCount: number;
  /** Activities Strava tags as races, most recent first (max 12). */
  races: RaceResult[];
}

/** The one sport-specific number printed on the card (e.g. "2,140 KM" / "RUN / YR"). */
export interface CardHighlight {
  value: string;
  label: string;
  /** Show a climb (▲) marker before the value. */
  climb: boolean;
}

export interface PlayerCard {
  athleteId: number;
  /** URL slug: Strava username if set, otherwise the numeric athlete id. */
  slug: string;
  name: string;
  /** Short name printed on the card (e.g. "E. KIPCHOGE"). */
  displayName: string;
  avatarUrl: string | null;
  location: string | null;
  country: string | null;
  position: string;
  archetype: string;
  highlight: CardHighlight;
  overall: number;
  tier: CardTier;
  /** True when the overall was capped by the legacy (Icon) gate. */
  legacyCapped: boolean;
  attributes: Record<AttributeKey, AttributeScore>;
  trophies: Trophy[];
  inputs: ScoutInputs;
  /** When the athlete joined Strava (ISO). Bounds how far back the calendar goes. */
  memberSince?: string;
  /** Overall rating at each scout, oldest → newest (max RATING_HISTORY_MAX). */
  history: { date: string; overall: number }[];
  /** ISO timestamp of the last successful scout. */
  scoutedAt: string;
  engineVersion: number;
}

/** Wrapper returned by the scout service so callers know how fresh the card is. */
export interface CardEnvelope {
  card: PlayerCard;
  stale: boolean;
  source: "cache" | "fresh";
}
