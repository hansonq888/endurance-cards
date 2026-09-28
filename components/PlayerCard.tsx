import { CardFace } from "@/lib/card-face";
import { CARD_H, CARD_W, TIER_THEMES } from "@/lib/card-theme";
import type { PlayerCard as Card } from "@/types/player";

const WEB_FONTS = {
  display: { fontFamily: "var(--font-display)", fontWeight: 900, fontStretch: "125%", fontStyle: "italic" as const },
  body: { fontFamily: "var(--font-card), system-ui, sans-serif" },
};

/**
 * Web rendition of the topo card. Uses the same face as the PNG export, sized
 * with container-query units so it scales to whatever width it is given.
 */
export function PlayerCard({ card, className = "" }: { card: Card; className?: string }) {
  const t = TIER_THEMES[card.tier];
  return (
    <div
      className={`relative select-none [container-type:inline-size] ${className}`}
      style={{ aspectRatio: `${CARD_W} / ${CARD_H}`, filter: "drop-shadow(0 18px 36px rgba(0,0,0,0.45))" }}
      role="img"
      aria-label={`${card.name}: ${card.overall} overall, ${t.label} (${t.terrain}) card`}
    >
      <CardFace card={card} u={(n) => `${(n / CARD_W) * 100}cqw`} fonts={WEB_FONTS} avatarSrc={card.avatarUrl} />
    </div>
  );
}
