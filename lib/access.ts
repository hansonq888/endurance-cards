import "server-only";
import { randomBytes } from "node:crypto";
import { NotFoundError } from "./errors";
import { getSettings, resolveSlug, saveSettings } from "./redis";
import { canView } from "./visibility";
import type { CardEnvelope, CardSettings } from "@/types/player";

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
 */

const TOKEN_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function newShareToken(): string {
  const bytes = randomBytes(12);
  return `link-${[...bytes].map((b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("")}`;
}

/** New athletes start link-only: shareable, but not discoverable by username. */
export function defaultSettings(): CardSettings {
  return { visibility: "unlisted", shareToken: newShareToken(), showCalendar: true, showRoutes: true };
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
  /** Slug to put in share links: the username when public, otherwise the secret token. */
  shareSlug: string;
  /** Whether responses may sit in shared (CDN) caches. */
  publiclyCacheable: boolean;
}

export async function resolveViewer(slug: string, sessionAthleteId: number | null, publicSlug?: string): Promise<Viewer> {
  const athleteId = await resolveSlug(slug);
  if (athleteId === null) throw new NotFoundError(`No scouted player named "${slug}"`);
  const settings = await ensureSettings(athleteId);
  const isOwner = sessionAthleteId === athleteId;
  const viaToken = slug.toLowerCase() === settings.shareToken;
  if (!canView(settings, isOwner, viaToken)) throw new NotFoundError(`No scouted player named "${slug}"`);
  return {
    athleteId,
    settings,
    isOwner,
    shareSlug: settings.visibility === "public" ? (publicSlug ?? slug) : settings.shareToken,
    // Private cards (and owner-only views of them) must never land in a shared cache.
    publiclyCacheable: settings.visibility !== "private",
  };
}

/** Cache-Control for a response that went through resolveViewer. */
export function cacheControlFor(viewer: Viewer, publicValue: string): string {
  return viewer.publiclyCacheable && !viewer.isOwner ? publicValue : "private, no-store";
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
