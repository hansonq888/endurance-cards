"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

const MAX_TILT = 10; // degrees
const CARD_RADIUS = "5.333cqw"; // 16 design units on a 300-unit-wide card

/**
 * Trading-card hover: tilts toward the pointer in 3D with a moving light sheen,
 * plus a tier-tinted foil sheen on "holo rare" (Gold/Icon) cards.
 * Mouse/pen only (touch would fight scrolling); on phones, `ambient` cards
 * follow the device's tilt instead. `ambient` also adds an idle float, a
 * periodic light sweep and (holo cards) a faint drifting shimmer, so the
 * card looks alive before anyone touches it. All off under prefers-reduced-motion.
 * Writes styles directly on the element, so pointer moves never re-render React.
 */
export function TiltCard({
  children,
  className = "",
  style,
  holo,
  ambient = false,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Idle float, light sweep and phone-tilt support (home page showcase). */
  ambient?: boolean;
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
    point((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
  }

  /** Tilt, glare and foil toward a point on the card (0..1 each way). */
  function point(x: number, y: number) {
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

  // Phones: tilting the device plays the part of the cursor.
  useEffect(() => {
    if (!ambient || !window.matchMedia("(pointer: coarse)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      // Held upright-ish (beta ≈ 45°) is the neutral pose.
      point(clamp((e.gamma + 25) / 50), clamp((e.beta - 20) / 50));
    };
    window.addEventListener("deviceorientation", onTilt);
    return () => window.removeEventListener("deviceorientation", onTilt);
  }, [ambient]);

  /** iOS only reports device tilt after a user gesture grants permission. */
  function askForTilt() {
    const DOE = (typeof window !== "undefined" ? window.DeviceOrientationEvent : undefined) as
      | (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> })
      | undefined;
    if (ambient && DOE?.requestPermission) DOE.requestPermission().catch(() => {});
  }

  return (
    <div
      className={`[container-type:inline-size] ${ambient ? "card-float" : ""} ${className}`}
      style={style}
      onPointerMove={move}
      onPointerLeave={leave}
      onClick={askForTilt}
    >
      <div ref={tilt} className="relative will-change-transform [transform-style:preserve-3d]">
        {children}
        {ambient && holo && (
          <div aria-hidden className="holo-foil holo-ambient pointer-events-none absolute inset-0" style={{ ...holo, borderRadius: CARD_RADIUS }} />
        )}
        {ambient && <div aria-hidden className="card-shine pointer-events-none absolute inset-0" style={{ borderRadius: CARD_RADIUS }} />}
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
