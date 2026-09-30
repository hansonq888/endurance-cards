import "server-only";
import { randomBytes } from "node:crypto";
import { NotFoundError, UnauthorizedError } from "./errors";
import { getSettings, resolveSlug, saveSettings } from "./redis";
import { canView } from "./visibility";
import type { CardEnvelope, CardSettings, Visibility } from "@/types/player";

/**
 * Who may see a card. Every doorway (profile page, PNG, story, JSON, calendar
 * and routes APIs) goes through resolveViewer, so the rule lives in one place:
 *
 *   unlisted — the owner, or anyone with the secret share link (the default)
 *   private  — only the signed-in owner
 *
 * Everyone who can open a card sees the same card (lib/sharing.ts decides what
 * goes on it). Anything a viewer may not see is reported as "not found", so
 * private cards don't reveal that they exist.
 */

const TOKEN_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function newShareToken(): string {
  const bytes = randomBytes(12);
  return `link-${[...bytes].map((b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("")}`;
}

/** Settings for a new card: shareable by link, calendar and routes shown. */
export function defaultSettings(visibility: Visibility = "unlisted"): CardSettings {
  return { visibility, shareToken: newShareToken(), showCalendar: true, showRoutes: true };
}

export async function ensureSettings(athleteId: number): Promise<CardSettings> {
  const existing = await getSettings(athleteId);
  if (existing) return existing;
  const settings = defaultSettings();
  await saveSettings(athleteId, settings);
  return settings;
}

export interface Viewer {
  athleteId: number;
  settings: CardSettings;
  isOwner: boolean;
  /** Slug for share links: the secret token. */
  shareSlug: string;
  /** Whether responses may sit in shared (CDN) caches. */
  publiclyCacheable: boolean;
}

export async function resolveViewer(slug: string, sessionAthleteId: number | null): Promise<Viewer> {
  const athleteId = await resolveSlug(slug);
  if (athleteId === null) throw new NotFoundError(`No scouted player named "${slug}"`);
  // Read-only: a card is always scouted (which saves its settings) before anyone can link to it,
  // so a missing record just means "not shareable yet"; viewing never writes.
  const settings = (await getSettings(athleteId)) ?? defaultSettings();
  const isOwner = sessionAthleteId === athleteId;
  const viaToken = slug.toLowerCase() === settings.shareToken;
  if (!canView(settings, isOwner, viaToken)) throw new NotFoundError(`No scouted player named "${slug}"`);
  return {
    athleteId,
    settings,
    isOwner,
    shareSlug: settings.demo ? slug : settings.shareToken,
    // Private cards and the owner's own views must never land in a shared cache.
    publiclyCacheable: settings.visibility !== "private" && !isOwner,
  };
}

/**
 * Short shared-cache window for shareable card responses. Redis does the real
 * caching; this just absorbs embed bursts, and stays short so switching a card
 * to link-only or private takes effect on CDNs within minutes.
 */
const PUBLIC_CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

/**
 * Cache-Control for card images whose URL carries the card's version (?v=, see
 * the profile page): the owner's own browser may then keep them, since a new
 * scout means a new URL. Still never in shared caches unless shareable.
 */
export function imageCacheControl(viewer: Viewer, versioned: boolean): string {
  if (!viewer.publiclyCacheable && versioned) return "private, max-age=86400";
  return cacheControlFor(viewer);
}

/** Cache-Control for a response that went through resolveViewer (owner and private views are never shared-cached). */
export function cacheControlFor(viewer: Viewer): string {
  return viewer.publiclyCacheable ? PUBLIC_CACHE : "private, no-store";
}

/**
 * The athlete behind `slug`, if the signed-in user is that athlete. Unknown
 * slugs and other people's cards both answer 401, so owner-only endpoints
 * don't reveal which cards exist.
 */
export async function requireOwner(slug: string, sessionAthleteId: number | null): Promise<number> {
  const athleteId = await resolveSlug(slug);
  if (athleteId === null || athleteId !== sessionAthleteId) throw new UnauthorizedError();
  return athleteId;
}

/** Strips sections the owner has hidden from visitors out of API responses. */
export function redactForViewer(envelope: CardEnvelope, viewer: Viewer): CardEnvelope {
  if (viewer.isOwner || viewer.settings.showCalendar) return envelope;
  const { inputs } = envelope.card;
  return {
    ...envelope,
    card: { ...envelope.card, inputs: { ...inputs, daily: { ...inputs.daily, minutes: [], prs: [] }, races: [] } },
  };
}
