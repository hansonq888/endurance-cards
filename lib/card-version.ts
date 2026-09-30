import { createHash } from "node:crypto";
import { ATTRIBUTE_KEYS, type PlayerCard } from "@/types/player";

/** Bump when the card or story artwork changes, so saved images are redrawn. */
const ARTWORK_VERSION = 1;

/**
 * Fingerprint of what the card image actually shows. A daily re-scout that
 * moves no visible number keeps the same fingerprint, so the rendered images
 * (and the owner's browser copy, via `?v=`) stay valid.
 */
export function imageVersion(card: PlayerCard): string {
  const face = {
    art: ARTWORK_VERSION,
    id: card.athleteId,
    name: card.name,
    displayName: card.displayName,
    avatarUrl: card.avatarUrl,
    overall: card.overall,
    tier: card.tier,
    position: card.position,
    archetype: card.archetype,
    highlight: card.highlight,
    stats: ATTRIBUTE_KEYS.map((k) => [card.attributes[k].value, card.attributes[k].measured !== false]),
  };
  return createHash("sha256").update(JSON.stringify(face)).digest("base64url").slice(0, 12);
}
