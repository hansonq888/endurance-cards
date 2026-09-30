/** Card assembly: identity (slug, name, avatar), history and re-rating around the pure engine. */
import { privacyMix, sharedActivities } from "./sharing";
import { INPUTS_SCHEMA, type PlayerCard } from "@/types/player";
import type { StravaAthlete } from "@/types/strava";
import { RawScoutData, extractInputs } from "./extract";
import { ENGINE_VERSION, rateInputs } from "./rating";

// ---------- Card assembly ----------

/** App paths a Strava username must never shadow; those athletes use their numeric id. */
const RESERVED_SLUGS = new Set(["guide", "privacy", "api", "settings", "login", "logout", "about", "admin", "help", "icon"]);

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

/**
 * The athlete's card: built only from activities they share on Strava
 * (Everyone or Followers; lib/sharing.ts), with the rating history carried
 * over. Everyone who can open it, the athlete included, sees this same card.
 * The privacy mix (counts only) lets the athlete see what was left out.
 */
export function buildSharedCard(raw: RawScoutData, previous: PlayerCard | null, now = new Date()): PlayerCard {
  const card = withHistory(buildCard({ ...raw, activities: sharedActivities(raw.activities) }, now), previous);
  return { ...card, privacy: privacyMix(raw.activities) };
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
