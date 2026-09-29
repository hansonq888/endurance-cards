import type { CSSProperties } from "react";
import { PlayerCard } from "./PlayerCard";
import { TiltCard } from "./TiltCard";
import { holoVars, TIER_THEMES } from "@/lib/card-theme";
import type { PlayerCard as PlayerCardData } from "@/types/player";

/** Foil sheen for "holo rare" tiers only. */
const holoFor = (card: PlayerCardData) => (TIER_THEMES[card.tier].holoCard ? holoVars(card.tier) : undefined);

/**
 * Three cards fanned out like a hand, dealt in on load: the middle one first,
 * then the sides swinging in from a tilt. Cards use container-query sizing, so
 * each needs an explicit width.
 */
export function CardFan({ cards, className = "" }: { cards: [PlayerCardData, PlayerCardData, PlayerCardData]; className?: string }) {
  const [left, middle, right] = cards;
  const side = "deal z-0 w-[34%] shrink-0 translate-y-4 opacity-90 transition-opacity hover:z-20 hover:opacity-100";
  return (
    <div className={`mx-auto flex w-full max-w-[540px] items-center justify-center py-6 ${className}`}>
      <TiltCard style={{ "--d": "380ms", "--deal-r": "-10deg" } as CSSProperties} className={`${side} -rotate-6`} holo={holoFor(left)}>
        <PlayerCard card={left} className="w-full" />
      </TiltCard>
      <TiltCard style={{ "--d": "200ms" } as CSSProperties} className="deal z-10 -mx-[5%] w-[40%] shrink-0 hover:z-20" holo={holoFor(middle)}>
        <PlayerCard card={middle} className="w-full" />
      </TiltCard>
      <TiltCard style={{ "--d": "520ms", "--deal-r": "10deg" } as CSSProperties} className={`${side} rotate-6`} holo={holoFor(right)}>
        <PlayerCard card={right} className="w-full" />
      </TiltCard>
    </div>
  );
}
