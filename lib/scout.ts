import "server-only";
import { after } from "next/server";
import { resolveViewer, type Viewer } from "./access";
import { calendarYears } from "./calendar";
import { buildCard, ENGINE_VERSION, rerateCard, routesByDay, WINDOW_DAYS, withHistory } from "./engine";
import { CooldownError, NotFoundError, StravaAuthError, UnauthorizedError } from "./errors";
import {
  acquireScoutLock,
  claimRescoutCooldown,
  deleteAthlete,
  deleteTokens,
  getCachedCard,
  getTokens,
  isFresh,
  releaseScoutLock,
  resolveSlug,
  saveCard,
  saveRoutes,
} from "./redis";
import {
  assertBudget,
  deauthorize,
  ensureFreshTokens,
  fetchActivities,
  fetchAthlete,
  fetchAthleteStats,
  SCOUT_REQUEST_COST,
} from "./strava";
import type { CardEnvelope, PlayerCard } from "@/types/player";

/**
 * Hits Strava and rebuilds an athlete's card. The only function in the app
 * that spends Strava API quota for card data.
 */
export async function scoutAthlete(athleteId: number): Promise<PlayerCard> {
  if (!(await acquireScoutLock(athleteId))) {
    // Someone else is already scouting this athlete — wait briefly for their result.
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const card = await getCachedCard(athleteId);
      if (card && isFresh(card)) return card;
    }
    const card = await getCachedCard(athleteId);
    if (card) return card;
    throw new NotFoundError("Scout still in progress — refresh in a moment");
  }

  try {
    const stored = await getTokens(athleteId);
    if (!stored) throw new StravaAuthError();
    await assertBudget(SCOUT_REQUEST_COST);

    const tokens = await ensureFreshTokens(stored);
    const since = Math.floor(Date.now() / 1000) - WINDOW_DAYS * 86_400;
    const [athlete, stats, { activities, truncated }] = await Promise.all([
      fetchAthlete(tokens.accessToken),
      fetchAthleteStats(tokens.accessToken, athleteId),
      fetchActivities(tokens.accessToken, since),
    ]);

    const previous = await getCachedCard(athleteId);
    const card = withHistory(buildCard({ athlete, stats, activities, truncated }), previous);
    await saveCard(card, previous?.slug);
    await saveRoutes(athleteId, "recent", routesByDay(activities));
    return card;
  } catch (err) {
    if (err instanceof StravaAuthError) {
      // Access revoked: stop trying to refresh. The last card remains viewable.
      await deleteTokens(athleteId);
    }
    throw err;
  } finally {
    await releaseScoutLock(athleteId);
  }
}

async function athleteIdForSlug(slug: string): Promise<number> {
  const id = await resolveSlug(slug);
  if (id === null) throw new NotFoundError(`No scouted player named "${slug}"`);
  return id;
}

/** A card plus what the current viewer is allowed to see of it. */
export interface ViewedCard extends CardEnvelope {
  viewer: Viewer;
}

/**
 * Cache-first card lookup used by the profile page, JSON API and image embeds,
 * gated by the card's visibility (see lib/access.ts). Stale cards are served
 * immediately and refreshed in the background (stale-while-revalidate), so
 * embeds never block on Strava.
 */
export async function getCardBySlug(slug: string, sessionAthleteId: number | null): Promise<ViewedCard> {
  const viewer = await resolveViewer(slug, sessionAthleteId);
  const { athleteId } = viewer;
  let card = await getCachedCard(athleteId);

  if (card && card.engineVersion !== ENGINE_VERSION) {
    // Formulas changed: re-rate from cached inputs (no Strava calls). Cards whose
    // inputs predate the current schema can't be re-rated and must be re-scouted.
    const rerated = rerateCard(card);
    if (rerated) await saveCard(rerated);
    card = rerated;
  }

  if (!card) {
    // Missing or unusable card, but we may still hold tokens — rebuild synchronously.
    try {
      card = await scoutAthlete(athleteId);
      return { card, stale: false, source: "fresh", viewer: withPublicSlug(viewer, card) };
    } catch (err) {
      if (err instanceof StravaAuthError) throw new NotFoundError(`No scouted player named "${slug}"`);
      throw err;
    }
  }

  const envelope = { card, viewer: withPublicSlug(viewer, card) };
  if (isFresh(card)) return { ...envelope, stale: false, source: "cache" };

  after(async () => {
    try {
      await scoutAthlete(athleteId);
    } catch (err) {
      console.warn(`[strava-fut] background re-scout failed for ${athleteId}:`, (err as Error).message);
    }
  });
  return { ...envelope, stale: true, source: "cache" };
}

/** Public cards share their username URL even when opened via the secret link. */
function withPublicSlug(viewer: Viewer, card: PlayerCard): Viewer {
  return viewer.settings.visibility === "public" ? { ...viewer, shareSlug: card.slug } : viewer;
}

/** Owner-triggered "Re-scout" — bypasses freshness but is rate limited per athlete. */
export async function rescoutBySlug(slug: string, sessionAthleteId: number | null): Promise<PlayerCard> {
  const athleteId = await athleteIdForSlug(slug);
  if (sessionAthleteId !== athleteId) throw new UnauthorizedError();
  const wait = await claimRescoutCooldown(athleteId);
  if (wait !== null) throw new CooldownError(wait);
  return scoutAthlete(athleteId);
}

/** Owner-triggered removal: revokes Strava access and deletes every stored trace. */
export async function removeBySlug(slug: string, sessionAthleteId: number | null): Promise<void> {
  const athleteId = await athleteIdForSlug(slug);
  if (sessionAthleteId !== athleteId) throw new UnauthorizedError();
  const tokens = await getTokens(athleteId);
  if (tokens) {
    const fresh = await ensureFreshTokens(tokens).catch(() => tokens);
    await deauthorize(fresh.accessToken);
  }
  await purgeAthlete(athleteId, [slug]);
}

/**
 * Deletes everything we hold for an athlete. Used by "Remove card" and by the
 * Strava webhook when someone revokes access on strava.com.
 */
export async function purgeAthlete(athleteId: number, extraSlugs: string[] = []): Promise<void> {
  const card = await getCachedCard(athleteId);
  await deleteAthlete(athleteId, [...extraSlugs, ...(card ? [card.slug] : [])], card ? calendarYears(card) : []);
}
