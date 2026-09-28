/**
 * Audiences: the rule that a visitor only ever sees what they could already
 * see on Strava.
 *
 * Every Strava activity has its own visibility ("Everyone", "Followers" or
 * "Only You"). Every Kudex viewer belongs to one audience:
 *
 *   owner  — the athlete, signed in         → sees every activity
 *   link   — someone with the secret link   → Everyone + Followers (the athlete chose to send it)
 *   public — anyone, on a public card        → Everyone only
 *
 * "Only You" activities never reach anyone but the owner. Each audience gets its
 * own card, built only from the activities it may see (see buildAudienceCards in
 * lib/engine.ts), so nothing hidden can leak through a total, a trophy, a race
 * or a "longest ride" fact.
 *
 * Pure and dependency-free so it can be unit tested and used on client or server.
 */
import type { StravaSummaryActivity } from "@/types/strava";
import type { Visibility } from "@/types/player";

export type Audience = "owner" | "link" | "public";
export const VISITOR_AUDIENCES = ["link", "public"] as const;
export type VisitorAudience = (typeof VISITOR_AUDIENCES)[number];

/** 0 = Everyone, 1 = Followers, 2 = Only You. */
export type ActivityLevel = 0 | 1 | 2;

/** The most private activity level each audience may see. */
export const AUDIENCE_MAX_LEVEL: Record<Audience, ActivityLevel> = { public: 0, link: 1, owner: 2 };

/**
 * Strava's visibility for one activity. `visibility` is the current field;
 * `private` is the older boolean. If Strava sends neither, we can't tell
 * Everyone from Followers, so we assume Followers: a missing field must never
 * make an activity public.
 */
export function activityLevel(a: Pick<StravaSummaryActivity, "visibility" | "private">): ActivityLevel {
  if (a.private === true || a.visibility === "only_me") return 2;
  if (a.visibility === "everyone") return 0;
  return 1;
}

export function visibleTo(level: ActivityLevel | undefined, audience: Audience): boolean {
  // Anything stored before levels existed is treated as Only You until it's rebuilt.
  return (level ?? 2) <= AUDIENCE_MAX_LEVEL[audience];
}

export function activitiesFor<T extends Pick<StravaSummaryActivity, "visibility" | "private">>(acts: T[], audience: Audience): T[] {
  return audience === "owner" ? acts : acts.filter((a) => visibleTo(activityLevel(a), audience));
}

/** Which audience a visitor (not the owner) falls into, or null if they can't see the card at all. */
export function visitorAudience(visibility: Visibility): VisitorAudience | null {
  if (visibility === "public") return "public";
  if (visibility === "unlisted") return "link";
  return null;
}

/** How much of an athlete's training sits at each Strava visibility level. */
export interface PrivacyMix {
  /** Activity counts: [Everyone, Followers, Only You]. */
  activities: [number, number, number];
  /** Moving hours: [Everyone, Followers, Only You]. */
  hours: [number, number, number];
}

export function privacyMix(acts: Pick<StravaSummaryActivity, "visibility" | "private" | "moving_time">[]): PrivacyMix {
  const mix: PrivacyMix = { activities: [0, 0, 0], hours: [0, 0, 0] };
  for (const a of acts) {
    const l = activityLevel(a);
    mix.activities[l] += 1;
    mix.hours[l] += a.moving_time / 3600;
  }
  mix.hours = mix.hours.map((h) => Math.round(h * 10) / 10) as PrivacyMix["hours"];
  return mix;
}

/** Share (0–1) of training time an audience can see. */
export function visibleShare(mix: PrivacyMix, audience: Audience): number {
  const total = mix.hours[0] + mix.hours[1] + mix.hours[2];
  if (total === 0) return 0;
  const max = AUDIENCE_MAX_LEVEL[audience];
  return mix.hours.slice(0, max + 1).reduce((s, h) => s + h, 0) / total;
}

/** "Mostly" = at least this share of training time. */
export const DEFAULT_SHARE_THRESHOLD = 0.75;

/**
 * Starting visibility for a brand-new card, mirroring the athlete's Strava habits:
 * Public if most of their training is visible to Everyone, Link only if most is
 * visible to followers, otherwise Private. Only ever applied to new cards; an
 * explicit choice is never overwritten.
 */
export function defaultVisibilityFor(mix: PrivacyMix): Visibility {
  const total = mix.activities[0] + mix.activities[1] + mix.activities[2];
  if (total === 0) return "unlisted";
  if (visibleShare(mix, "public") >= DEFAULT_SHARE_THRESHOLD) return "public";
  if (visibleShare(mix, "link") >= DEFAULT_SHARE_THRESHOLD) return "unlisted";
  return "private";
}
