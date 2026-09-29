"use client";

import { useState, type CSSProperties } from "react";
import { PlayerCard } from "./PlayerCard";
import { TiltCard } from "./TiltCard";
import { holoVars, TIER_THEMES } from "@/lib/card-theme";
import type { PlayerCard as PlayerCardData } from "@/types/player";

/** Foil sheen for "holo rare" tiers only. */
const holoFor = (card: PlayerCardData) => (TIER_THEMES[card.tier].holoCard ? holoVars(card.tier) : undefined);

/** Where each seat of the fan sits: left, centre, right. */
const SEATS: CSSProperties[] = [
  { left: "0%", zIndex: 1, transform: "translateY(7%) rotate(-8deg) scale(0.92)", opacity: 0.9 },
  { left: "30%", zIndex: 3, transform: "none", opacity: 1 },
  { left: "60%", zIndex: 1, transform: "translateY(7%) rotate(8deg) scale(0.92)", opacity: 0.9 },
];
/** Dealt in centre first, then the sides; each also floats a little out of step. */
const DEAL = [
  { d: "380ms", r: "-10deg", float: "-2.3s" },
  { d: "200ms", r: "0deg", float: "0s" },
  { d: "520ms", r: "10deg", float: "-4.6s" },
];

/**
 * Three cards fanned out like a hand. They float and catch the light on their
 * own; tap (or click) a side card and it swings into the centre.
 */
export function CardFan({ cards, className = "" }: { cards: [PlayerCardData, PlayerCardData, PlayerCardData]; className?: string }) {
  // seatOf[i] = which seat card i sits in.
  const [seatOf, setSeatOf] = useState([0, 1, 2]);

  function bringForward(i: number) {
    const from = seatOf[i];
    if (from === 1) return;
    setSeatOf(seatOf.map((seat, j) => (j === i ? 1 : seat === 1 ? from : seat)));
  }

  return (
    <div className={`relative mx-auto aspect-[100/66] w-full max-w-[620px] ${className}`}>
      {cards.map((card, i) => {
        const front = seatOf[i] === 1;
        return (
          <div
            key={card.slug + i}
            role={front ? undefined : "button"}
            tabIndex={front ? undefined : 0}
            aria-label={front ? undefined : `Bring the ${TIER_THEMES[card.tier].label} card to the front`}
            onClick={() => bringForward(i)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), bringForward(i))}
            className={`absolute top-0 w-[40%] transition-[left,transform,opacity] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
              front ? "" : "cursor-pointer hover:opacity-100"
            }`}
            style={SEATS[seatOf[i]]}
          >
            <div className="deal" style={{ "--d": DEAL[i].d, "--deal-r": DEAL[i].r } as CSSProperties}>
              <TiltCard ambient holo={holoFor(card)} style={{ "--float-delay": DEAL[i].float } as CSSProperties}>
                <PlayerCard card={card} className="w-full" />
              </TiltCard>
            </div>
          </div>
        );
      })}
    </div>
  );
}
