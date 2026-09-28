import "server-only";
import { after } from "next/server";
import { defaultSettings, requireOwner, resolveViewer, type Viewer } from "./access";
import { defaultVisibilityFor, type VisitorAudience } from "./audience";
import { buildAudienceCards, ENGINE_VERSION, rerateCard, routesByDay, WINDOW_DAYS } from "./engine";
import { CooldownError, NotFoundError, StravaAuthError } from "./errors";
import {
  acquireScoutLock,
  claimRescoutCooldown,
  clearDirty,
  deleteAthlete,
  deleteTokens,
  getCachedCard,
  getCardView,
  getSettings,
  getTokens,
  isDirty,
  isFresh,
  releaseScoutLock,
  saveCard,
  saveCardView,
  saveCardViews,
  saveRoutes,
  saveSettings,
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
 * Hits Strava and rebuilds an athlete's cards (one per audience, lib/audience.ts).
 * The only function in the app that spends Strava API quota for card data.
 */
export async function scoutAthlete(athleteId: number): Promise<PlayerCard> {
  const lock = await acquireScoutLock(athleteId);
  if (!lock) {
    // Someone else is already scouting this athlete — wait briefly for their result.
    // (A webhook change that lands now stays marked dirty, and that scout re-runs for it.)
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
    let card: PlayerCard;
    // If Strava tells us something changed while we were fetching, go round once more
    // so a newly hidden activity can't survive in the cache until tomorrow.
    let passes = 0;
    do {
      await clearDirty(athleteId);
      card = await scoutOnce(athleteId);
    } while ((await isDirty(athleteId)) && ++passes < 2);
    return card;
  } catch (err) {
    if (err instanceof StravaAuthError) {
      // Access revoked: stop trying to refresh. The last card remains viewable.
      await deleteTokens(athleteId);
    }
    throw err;
  } finally {
    await releaseScoutLock(athleteId, lock);
  }
}

async function scoutOnce(athleteId: number): Promise<PlayerCard> {
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

  const [previous, previousLink, previousPublic] = await Promise.all([
    getCachedCard(athleteId),
    getCardView(athleteId, "link"),
    getCardView(athleteId, "public"),
  ]);
  const cards = buildAudienceCards(
    { athlete, stats, activities, truncated },
    { owner: previous ?? undefined, link: previousLink ?? undefined, public: previousPublic ?? undefined },
  );
  // Removed (or revoked) while we were fetching? Don't resurrect the card.
  if (!(await getTokens(athleteId))) throw new StravaAuthError();
  // Brand-new card: start from how they share on Strava. Written before the card, so no
  // request can slip in between and lock in the generic default. Existing choices are never touched.
  if (!(await getSettings(athleteId))) {
    await saveSettings(athleteId, defaultSettings(defaultVisibilityFor(cards.owner.privacy!), true));
  }
  if (process.env.NODE_ENV !== "production") {
    // Raw Strava values too, so a missing `visibility` field (treated as Followers) is easy to spot.
    const raw: Record<string, number> = {};
    for (const a of activities) {
      const key = `${a.visibility ?? "missing"}${a.private ? "+private" : ""}`;
      raw[key] = (raw[key] ?? 0) + 1;
    }
    console.info(`[kudex] visibility mix for ${athleteId} (everyone/followers/only me):`, cards.owner.privacy?.activities.join("/"), "raw:", raw);
  }
  await saveCardViews(cards, previous?.slug);
  await saveRoutes(athleteId, "recent", routesByDay(activities));
  return cards.owner;
}

/** A card plus what the current viewer is allowed to see of it. */
export interface ViewedCard extends CardEnvelope {
  viewer: Viewer;
}

/** Brings a cached card up to the current formulas (no Strava calls); null if it must be re-scouted. */
function current(card: PlayerCard | null): PlayerCard | null {
  if (!card || card.engineVersion === ENGINE_VERSION) return card;
  return rerateCard(card);
}

/**
 * Cache-first card lookup used by the profile page, JSON API and image embeds,
 * gated by the card's visibility (lib/access.ts) and returning the version
 * built for the viewer's audience (lib/audience.ts). Stale cards are served
 * immediately and refreshed in the background (stale-while-revalidate), so
 * embeds never block on Strava.
 *
 * A visitor never falls back to the owner's card: if their version is missing
 * (cached before audiences existed), it's rebuilt first, or they get "not found".
 */
export async function getCardBySlug(
  slug: string,
  sessionAthleteId: number | null,
  opts: { preview?: VisitorAudience } = {},
): Promise<ViewedCard> {
  const viewer = await resolveViewer(slug, sessionAthleteId, opts);
  const { athleteId, audience } = viewer;

  const cached = await getCachedCard(athleteId);
  let owner = current(cached);
  if (owner && owner !== cached) await saveCard(owner);
  let card = audience === "owner" ? owner : await loadView(athleteId, audience);

  if (!owner || !card) {
    // Missing or unusable card, but we may still hold tokens — rebuild synchronously.
    try {
      owner = await scoutAthlete(athleteId);
      card = audience === "owner" ? owner : await getCardView(athleteId, audience);
    } catch (err) {
      if (err instanceof StravaAuthError) throw new NotFoundError(`No scouted player named "${slug}"`);
      throw err;
    }
    if (!card) throw new NotFoundError(`No scouted player named "${slug}"`);
    return { card, stale: false, source: "fresh", viewer: withPublicSlug(viewer, owner) };
  }

  // Visitors whose audience can't see a single activity get "not found" rather than an empty card.
  if (audience !== "owner" && !viewer.previewing && card.inputs.activityCount === 0) {
    throw new NotFoundError(`No scouted player named "${slug}"`);
  }

  // Strava told us an activity changed (possibly its visibility): until the rebuild lands,
  // keep this response out of shared caches so a just-hidden activity isn't pinned on a CDN.
  const dirty = await isDirty(athleteId);
  const envelope = { card, viewer: withPublicSlug(dirty ? { ...viewer, publiclyCacheable: false } : viewer, owner) };
  if (isFresh(owner) && !dirty) return { ...envelope, stale: false, source: "cache" };

  after(async () => {
    try {
      await scoutAthlete(athleteId);
    } catch (err) {
      console.warn(`[kudex] background re-scout failed for ${athleteId}:`, (err as Error).message);
    }
  });
  return { ...envelope, stale: true, source: "cache" };
}

async function loadView(athleteId: number, audience: VisitorAudience): Promise<PlayerCard | null> {
  const cached = await getCardView(athleteId, audience);
  const card = current(cached);
  if (card && card !== cached) await saveCardView(card, audience);
  return card;
}

/** Public cards share their username URL even when opened via the secret link. */
function withPublicSlug(viewer: Viewer, card: PlayerCard): Viewer {
  return viewer.settings.visibility === "public" ? { ...viewer, shareSlug: card.slug } : viewer;
}

/** Owner-triggered "Re-scout" — bypasses freshness but is rate limited per athlete. */
export async function rescoutBySlug(slug: string, sessionAthleteId: number | null): Promise<PlayerCard> {
  const athleteId = await requireOwner(slug, sessionAthleteId);
  const wait = await claimRescoutCooldown(athleteId);
  if (wait !== null) throw new CooldownError(wait);
  return scoutAthlete(athleteId);
}

/** Owner-triggered removal: revokes Strava access and deletes every stored trace. */
export async function removeBySlug(slug: string, sessionAthleteId: number | null): Promise<void> {
  const athleteId = await requireOwner(slug, sessionAthleteId);
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
  await deleteAthlete(athleteId, [...extraSlugs, ...(card ? [card.slug] : [])]);
}
