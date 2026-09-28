import "server-only";
import { randomBytes } from "node:crypto";
import { NotFoundError, UnauthorizedError } from "./errors";
import { getSettings, resolveSlug, saveSettings } from "./redis";
import { canView } from "./visibility";
import { VISITOR_AUDIENCES, visitorAudience, type Audience, type VisitorAudience } from "./audience";
import type { CardEnvelope, CardSettings, Visibility } from "@/types/player";

/**
 * Who may see what. Every public doorway (profile page, PNG, story, JSON,
 * calendar and routes APIs) goes through resolveViewer, so visibility rules
 * live in exactly one place.
 *
 *   public   — anyone, at /username (or the share link)
 *   unlisted — only via the secret share link, or the owner
 *   private  — only the signed-in owner
 *
 * Anything a viewer may not see is reported as "not found", so private cards
 * don't reveal that they exist.
 *
 * On top of that, each viewer gets an audience (lib/audience.ts) that decides
 * which of the athlete's activities their version of the card is built from.
 */

const TOKEN_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function newShareToken(): string {
  const bytes = randomBytes(12);
  return `link-${[...bytes].map((b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("")}`;
}

/**
 * Settings for a new card. Scouting picks the visibility from the athlete's
 * Strava privacy (defaultVisibilityFor) and marks it automatic; the fallback,
 * used only if a card is viewed before it was ever scouted, is link-only.
 */
export function defaultSettings(visibility: Visibility = "unlisted", auto = false): CardSettings {
  return { visibility, shareToken: newShareToken(), showCalendar: true, showRoutes: true, ...(auto ? { autoVisibility: true } : {}) };
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
  /** Whose version of the card to show. The owner is "owner" unless previewing a visitor's view. */
  audience: Audience;
  /** The owner is looking at a visitor's version of their own card. */
  previewing: boolean;
  /** Slug to put in share links: the username when public, otherwise the secret token. */
  shareSlug: string;
  /** Whether responses may sit in shared (CDN) caches. */
  publiclyCacheable: boolean;
}

/** Parses a `?view=` preview request; only ever honoured for the owner. */
export function parsePreview(value: string | null | undefined): VisitorAudience | undefined {
  return VISITOR_AUDIENCES.find((a) => a === value);
}

export async function resolveViewer(
  slug: string,
  sessionAthleteId: number | null,
  { preview }: { preview?: VisitorAudience } = {},
): Promise<Viewer> {
  const athleteId = await resolveSlug(slug);
  if (athleteId === null) throw new NotFoundError(`No scouted player named "${slug}"`);
  // Read-only: a card is always scouted (which saves its settings) before anyone can link to it,
  // so a missing record just means "not shareable yet"; viewing never writes.
  const settings = (await getSettings(athleteId)) ?? defaultSettings();
  const isOwner = sessionAthleteId === athleteId;
  const viaToken = slug.toLowerCase() === settings.shareToken;
  if (!canView(settings, isOwner, viaToken)) throw new NotFoundError(`No scouted player named "${slug}"`);
  // canView passed, so a non-owner has a visitor audience.
  const audience: Audience = isOwner ? (preview ?? "owner") : visitorAudience(settings.visibility)!;
  return {
    athleteId,
    settings,
    isOwner,
    audience,
    previewing: isOwner && audience !== "owner",
    shareSlug: settings.visibility === "public" ? slug : settings.shareToken,
    // Private cards (and owner-only views of them) must never land in a shared cache.
    publiclyCacheable: settings.visibility !== "private" && !isOwner,
  };
}

/**
 * Short shared-cache window for public card responses. Redis does the real
 * caching; this just absorbs embed bursts, and stays short so switching a card
 * to link-only or private takes effect on CDNs within minutes.
 */
export const PUBLIC_CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

/** Cache-Control for a response that went through resolveViewer (owner and private views are never shared-cached). */
export function cacheControlFor(viewer: Viewer, publicValue = PUBLIC_CACHE): string {
  return viewer.publiclyCacheable ? publicValue : "private, no-store";
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
