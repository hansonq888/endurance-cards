import "server-only";
import sharp from "sharp";
import { avatarDataUri, renderCardPng, renderStoryPng } from "./card-renderer";
import { imageVersion } from "./card-version";
import { getRenderedImage, saveRenderedImage, type ImageKind } from "./redis";
import type { PlayerCard } from "@/types/player";

/**
 * The card and story images people save and share. Rendering takes about a
 * second (plus a cold start on a fresh server), which is too slow for the
 * phone share sheet, so each finished image is kept in Redis against the
 * fingerprint of what it shows (see imageVersion) and served from there until
 * something visible on the card changes.
 */
export interface ShareImage {
  bytes: Buffer;
  contentType: string;
}

const CONTENT_TYPE: Record<ImageKind, string> = { card: "image/png", story: "image/jpeg" };

const version = (card: PlayerCard, extra = "") => `${imageVersion(card)}|${extra}`;

async function cached(
  card: PlayerCard,
  kind: ImageKind,
  v: string,
  render: (avatar: string | null) => Promise<Buffer>,
): Promise<ShareImage> {
  const contentType = CONTENT_TYPE[kind];
  const hit = await getRenderedImage(card.athleteId, kind, v).catch(() => null);
  if (hit) return { bytes: hit, contentType };
  const avatar = await avatarDataUri(card.avatarUrl);
  const bytes = await render(avatar);
  // A photo that failed to load renders as initials; don't keep that for a week, retry next time.
  if (avatar || !card.avatarUrl) {
    await saveRenderedImage(card.athleteId, kind, v, bytes).catch((err) =>
      console.warn(`[kudex] couldn't cache ${kind} image:`, (err as Error).message),
    );
  }
  return { bytes, contentType };
}

const toBuffer = async (res: Response) => Buffer.from(await res.arrayBuffer());

/** Transparent PNG of the finished card. */
export function cardImage(card: PlayerCard): Promise<ShareImage> {
  return cached(card, "card", version(card), async (avatar) => toBuffer(await renderCardPng(card, avatar)));
}

/**
 * 1080×1920 story, sent as JPEG: the grainy backdrop makes the PNG ~2.4 MB,
 * the JPEG ~240 KB with no visible difference.
 */
export function storyImage(card: PlayerCard, host: string): Promise<ShareImage> {
  return cached(card, "story", version(card, host), async (avatar) => {
    const png = await toBuffer(await renderStoryPng(card, host, avatar));
    return sharp(png).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  });
}

/** The HTTP response for a share image. */
export function imageResponse({ bytes, contentType }: ShareImage, cacheControl: string, extra: Record<string, string> = {}): Response {
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": contentType, "Cache-Control": cacheControl, ...extra },
  });
}

/**
 * Draws both images ahead of time after a re-scout, so the first Save after a
 * change is served from Redis. Unchanged cards are a cache hit and cost one read.
 */
export async function prerenderShareImages(card: PlayerCard, host: string): Promise<void> {
  await Promise.all([cardImage(card), storyImage(card, host)]);
}
