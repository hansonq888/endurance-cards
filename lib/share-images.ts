import "server-only";
import sharp from "sharp";
import { renderCardPng, renderStoryPng } from "./card-renderer";
import { getRenderedImage, saveRenderedImage, type ImageKind } from "./redis";
import type { PlayerCard } from "@/types/player";

/**
 * The card and story images people save and share. Rendering takes about a
 * second (plus a cold start on a fresh server), which is too slow for the
 * phone share sheet, so each finished image is kept in Redis against the
 * card version it was drawn from and served from there until the card changes.
 */
export interface ShareImage {
  bytes: Buffer;
  contentType: string;
}

const version = (card: PlayerCard, extra = "") => `${card.scoutedAt}|${card.engineVersion}|${extra}`;

async function cached(card: PlayerCard, kind: ImageKind, v: string, render: () => Promise<ShareImage>): Promise<ShareImage> {
  const contentType = kind === "story" ? "image/jpeg" : "image/png";
  const hit = await getRenderedImage(card.athleteId, kind, v).catch(() => null);
  if (hit) return { bytes: hit, contentType };
  const image = await render();
  await saveRenderedImage(card.athleteId, kind, v, image.bytes).catch((err) =>
    console.warn(`[kudex] couldn't cache ${kind} image:`, (err as Error).message),
  );
  return image;
}

/** Transparent PNG of the finished card. */
export function cardImage(card: PlayerCard): Promise<ShareImage> {
  return cached(card, "card", version(card), async () => ({
    bytes: Buffer.from(await (await renderCardPng(card)).arrayBuffer()),
    contentType: "image/png",
  }));
}

/**
 * 1080×1920 story, sent as JPEG: the grainy backdrop makes the PNG ~2.4 MB,
 * the JPEG ~240 KB with no visible difference.
 */
export function storyImage(card: PlayerCard, host: string): Promise<ShareImage> {
  return cached(card, "story", version(card, host), async () => {
    const png = Buffer.from(await (await renderStoryPng(card, host)).arrayBuffer());
    return { bytes: await sharp(png).jpeg({ quality: 90, mozjpeg: true }).toBuffer(), contentType: "image/jpeg" };
  });
}
