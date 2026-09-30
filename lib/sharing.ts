/**
 * What goes on a card: the one rule behind Kudex privacy.
 *
 * There is one card per athlete, and everyone who can open it (the athlete,
 * and anyone they send their link to) sees the same thing. It's built from the
 * activities the athlete shares on Strava with people they've chosen:
 *
 *   Everyone        → on the card
 *   Followers only  → on the card (a Kudex link works like adding a follower)
 *   Only You        → never on the card, and never stored
 *
 * Pure and dependency-free so it can be unit tested and used anywhere.
 */
import type { StravaSummaryActivity } from "@/types/strava";

/** 0 = Everyone, 1 = Followers, 2 = Only You. */
export type ActivityLevel = 0 | 1 | 2;

/** The most private level that still goes on a card. */
export const SHARED_MAX_LEVEL: ActivityLevel = 1;

type Visible = Pick<StravaSummaryActivity, "visibility" | "private">;

/**
 * Strava's visibility for one activity. `visibility` is the current field;
 * `private` is the older boolean. If Strava sends neither, assume Followers:
 * shared on the card, but never assumed to be fully public.
 */
export function activityLevel(a: Visible): ActivityLevel {
  if (a.private === true || a.visibility === "only_me") return 2;
  if (a.visibility === "everyone") return 0;
  return 1;
}

export const isShared = (a: Visible) => activityLevel(a) <= SHARED_MAX_LEVEL;

/** The activities a card is built from. */
export const sharedActivities = <T extends Visible>(acts: T[]): T[] => acts.filter(isShared);

/** How an athlete's training splits across Strava visibility levels (shown to them as a note). */
export interface PrivacyMix {
  /** Activity counts: [Everyone, Followers, Only You]. */
  activities: [number, number, number];
  /** Moving hours: [Everyone, Followers, Only You]. */
  hours: [number, number, number];
}

export function privacyMix(acts: (Visible & Pick<StravaSummaryActivity, "moving_time">)[]): PrivacyMix {
  const mix: PrivacyMix = { activities: [0, 0, 0], hours: [0, 0, 0] };
  for (const a of acts) {
    const l = activityLevel(a);
    mix.activities[l] += 1;
    mix.hours[l] += a.moving_time / 3600;
  }
  mix.hours = mix.hours.map((h) => Math.round(h * 10) / 10) as PrivacyMix["hours"];
  return mix;
}
