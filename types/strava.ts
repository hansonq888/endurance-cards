/**
 * Subset of the Strava v3 API payloads that Kudex consumes.
 * Only fields we actually read are typed; everything else is ignored.
 * Reference: https://developers.strava.com/docs/reference/
 */

export interface StravaTokenResponse {
  token_type: "Bearer";
  access_token: string;
  refresh_token: string;
  /** Unix epoch seconds. */
  expires_at: number;
  expires_in: number;
  /** Only present on the initial authorization_code exchange. */
  athlete?: StravaAthlete;
}

export interface StravaAthlete {
  id: number;
  username: string | null;
  firstname: string;
  lastname: string;
  city: string | null;
  state: string | null;
  country: string | null;
  sex: "M" | "F" | null;
  premium?: boolean;
  summit?: boolean;
  /** ISO timestamp — used for account tenure. */
  created_at: string;
  updated_at: string;
  /** 124x124 avatar URL (may be a placeholder path like "avatar/athlete/large.png"). */
  profile: string;
  profile_medium: string;
  /** Kilograms. Only returned with profile:read_all scope. */
  weight?: number | null;
}

export interface StravaActivityTotal {
  count: number;
  /** Meters. */
  distance: number;
  /** Seconds. */
  moving_time: number;
  elapsed_time: number;
  /** Meters. */
  elevation_gain: number;
  achievement_count?: number;
}

export interface StravaAthleteStats {
  biggest_ride_distance: number | null;
  biggest_climb_elevation_gain: number | null;
  recent_ride_totals: StravaActivityTotal;
  recent_run_totals: StravaActivityTotal;
  recent_swim_totals: StravaActivityTotal;
  ytd_ride_totals: StravaActivityTotal;
  ytd_run_totals: StravaActivityTotal;
  ytd_swim_totals: StravaActivityTotal;
  all_ride_totals: StravaActivityTotal;
  all_run_totals: StravaActivityTotal;
  all_swim_totals: StravaActivityTotal;
}

export interface StravaSummaryActivity {
  id: number;
  name: string;
  /** Legacy coarse type, e.g. "Run", "Ride". */
  type: string;
  /** Fine-grained type, e.g. "TrailRun", "GravelRide". Preferred when present. */
  sport_type?: string;
  /** Meters. */
  distance: number;
  /** Seconds. */
  moving_time: number;
  elapsed_time: number;
  /** Meters. */
  total_elevation_gain: number;
  start_date: string;
  start_date_local: string;
  /** m/s */
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  device_watts?: boolean;
  trainer?: boolean;
  manual?: boolean;
  /** 1 = race (run), 11 = race (ride); other values are workout/long-run tags. */
  workout_type?: number | null;
  pr_count?: number;
  achievement_count?: number;
  /** Who can see it on Strava. Only You activities never go on a card (lib/sharing.ts). */
  visibility?: "everyone" | "followers_only" | "only_me";
  /** Older "Only You" flag; still sent alongside `visibility`. */
  private?: boolean;
  /** Simplified GPS track (Google encoded polyline); null for indoor/manual activities. */
  map?: { id: string; summary_polyline: string | null };
}

/** Tokens persisted per athlete so cards can be re-scouted without the user present. */
export interface StoredTokens {
  athleteId: number;
  accessToken: string;
  refreshToken: string;
  /** Unix epoch seconds. */
  expiresAt: number;
  scope: string;
}
