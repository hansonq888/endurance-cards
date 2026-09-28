"use client";

import { useRef, type ReactNode } from "react";

const MAX_TILT = 10; // degrees
const CARD_RADIUS = "5.333cqw"; // 16 design units on a 300-unit-wide card

/**
 * Trading-card hover: tilts toward the pointer in 3D with a moving light sheen,
 * plus a tier-tinted foil sheen on "holo rare" (Gold/Icon) cards.
 * Mouse/pen only (touch would fight scrolling) and off under prefers-reduced-motion.
 * Writes styles directly on the element, so pointer moves never re-render React.
 */
export function TiltCard({
  children,
  className = "",
  holo,
}: {
  children: ReactNode;
  className?: string;
  /** Foil colours (CSS vars from holoVars()) to add a holographic sheen — Gold and Icon cards only. */
  holo?: Record<string, string>;
}) {
  const tilt = useRef<HTMLDivElement>(null);
  const glare = useRef<HTMLDivElement>(null);
  const foil = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width; // 0..1
    const y = (e.clientY - rect.top) / rect.height;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (tilt.current) {
        tilt.current.style.transition = "transform 80ms ease-out";
        tilt.current.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 2 * MAX_TILT}deg) rotateY(${(x - 0.5) * 2 * MAX_TILT}deg) scale(1.03)`;
      }
      if (glare.current) {
        glare.current.style.opacity = "1";
        glare.current.style.background = `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(255,255,255,0.22), rgba(255,255,255,0) 55%)`;
      }
      if (foil.current) {
        // Softer than the route panel's foil: a hint of shimmer, not a wash over the art.
        foil.current.style.opacity = "0.5";
        foil.current.style.setProperty("--mx", `${x * 100}%`);
        foil.current.style.setProperty("--my", `${y * 100}%`);
      }
    });
  }

  function leave() {
    cancelAnimationFrame(frame.current);
    if (tilt.current) {
      tilt.current.style.transition = "transform 500ms cubic-bezier(0.22, 1, 0.36, 1)";
      tilt.current.style.transform = "";
    }
    if (glare.current) glare.current.style.opacity = "0";
    if (foil.current) foil.current.style.opacity = "0";
  }

  return (
    <div className={`[container-type:inline-size] ${className}`} onPointerMove={move} onPointerLeave={leave}>
      <div ref={tilt} className="relative will-change-transform [transform-style:preserve-3d]">
        {children}
        {holo && (
          <div
            ref={foil}
            aria-hidden
            className="holo-foil pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300"
            style={{ ...holo, borderRadius: CARD_RADIUS }}
          />
        )}
        <div
          ref={glare}
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 mix-blend-soft-light transition-opacity duration-300"
          style={{ borderRadius: CARD_RADIUS }}
        />
      </div>
    </div>
  );
}
