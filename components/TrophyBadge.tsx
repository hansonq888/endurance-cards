"use client";

import {
  Bike,
  CalendarCheck,
  Flag,
  Flame,
  Footprints,
  Hourglass,
  Layers,
  Medal,
  Mountain,
  ShieldCheck,
  Sunrise,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useId, useRef, type CSSProperties } from "react";
import { LEVEL_NUMERALS } from "@/lib/trophies";

const ICONS: Record<string, LucideIcon> = {
  "iron-streak": Flame,
  unbroken: CalendarCheck,
  workhorse: Hourglass,
  "long-runner": Footprints,
  century: Bike,
  "everest-club": Mountain,
  "pr-machine": Zap,
  racer: Flag,
  triathlete: Medal,
  polyglot: Layers,
  "dawn-patrol": Sunrise,
  veteran: ShieldCheck,
};

/**
 * Metal per level — the same on every card so levels read at a glance:
 * I bronze, II silver, III gold (plus a tier-foil ring from --holo-1..4). 0 = locked, unpolished.
 */
const METALS: Record<0 | 1 | 2 | 3, { hi: string; mid: string; lo: string; ink: string }> = {
  0: { hi: "#4a3f38", mid: "#2c241f", lo: "#171210", ink: "#8c8078" },
  1: { hi: "#ffd9b0", mid: "#c47e45", lo: "#6b3818", ink: "#4a2410" },
  2: { hi: "#ffffff", mid: "#b9c2cc", lo: "#5d6672", ink: "#39414c" },
  3: { hi: "#fff3c2", mid: "#e6b43c", lo: "#8a5a12", ink: "#4a3208" },
};

const R_RIM = 29;
const R_FACE = 23;
const C = 2 * Math.PI * R_RIM;
/** Rim copies stacked behind the face so the coin has visible thickness when it turns. */
const EDGE_LAYERS = 4;
/** Max lean toward the pointer, in degrees. */
const MAX_TILT = 28;

function CoinFace({ uid, level, children }: { uid: string; level: 0 | 1 | 2 | 3; children?: React.ReactNode }) {
  const m = METALS[level];
  return (
    <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        {/* Rim lit from the top-left; the face lit from the bottom-right, so it reads as recessed. */}
        <linearGradient id={`${uid}-rim`} x1="0.15" y1="0.1" x2="0.85" y2="0.95">
          <stop offset="0" style={{ stopColor: m.hi }} />
          <stop offset="0.5" style={{ stopColor: m.mid }} />
          <stop offset="1" style={{ stopColor: m.lo }} />
        </linearGradient>
        <linearGradient id={`${uid}-face`} x1="0.85" y1="0.95" x2="0.15" y2="0.1">
          <stop offset="0" style={{ stopColor: m.hi }} />
          <stop offset="0.55" style={{ stopColor: m.mid }} />
          <stop offset="1" style={{ stopColor: m.lo }} />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r={R_RIM} fill={`url(#${uid}-rim)`} />
      <circle cx="32" cy="32" r={R_FACE} fill={`url(#${uid}-face)`} />
      {/* Engraved inner ring: dark groove with a light lip. */}
      <circle cx="32" cy="32" r={R_FACE} fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="1" />
      <circle cx="32" cy="32" r={R_FACE + 0.9} fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="0.6" />
      {/* Knurled edge dots on the rim. */}
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return <circle key={i} cx={32 + Math.cos(a) * 26.2} cy={32 + Math.sin(a) * 26.2} r="0.55" fill="#000" fillOpacity="0.18" />;
      })}
      {level === 3 && (
        <>
          {/* Tier foil ring: what makes a III special on top of the gold. */}
          <linearGradient id={`${uid}-foil`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "var(--holo-1, #fc4c02)" }} />
            <stop offset="0.35" style={{ stopColor: "var(--holo-2, #ffe28a)" }} />
            <stop offset="0.7" style={{ stopColor: "var(--holo-3, #c98a1e)" }} />
            <stop offset="1" style={{ stopColor: "var(--holo-4, #fff4c8)" }} />
          </linearGradient>
          <circle cx="32" cy="32" r={R_RIM - 0.9} fill="none" stroke={`url(#${uid}-foil)`} strokeWidth="1.8" />
        </>
      )}
      {children}
    </svg>
  );
}

/**
 * A 3D metal medallion. Tilts toward the pointer; level III
 * coins flip over on hover to show an engraved "III" on the back. Locked
 * badges are dark, unpolished coins with an orange progress arc on the rim.
 * Motion is disabled under prefers-reduced-motion.
 */
export function TrophyBadge({
  id,
  level,
  progress,
  size = 64,
}: {
  id: string;
  /** 0 = locked. */
  level: 0 | 1 | 2 | 3;
  /** 0–1 progress toward the next level; drawn as an arc on locked badges. */
  progress?: number;
  size?: number;
}) {
  const Icon = ICONS[id] ?? Medal;
  const uid = useId().replace(/:/g, "");
  const tilt = useRef<HTMLSpanElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);
  const m = METALS[level];
  const iconSize = size * 0.36;

  function move(e: React.PointerEvent<HTMLSpanElement>) {
    if (e.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const el = tilt.current;
    if (!el) return;
    // Lift toward the viewer and lean hard toward the pointer; the shadow slides the other way.
    el.style.transform = `translateZ(${size * 0.12}px) scale(1.08) rotateX(${(0.5 - y) * MAX_TILT * 2}deg) rotateY(${(x - 0.5) * MAX_TILT * 2}deg)`;
    if (shadow.current) {
      shadow.current.style.transform = `translate(${(0.5 - x) * size * 0.16}px, ${size * 0.04}px) scale(0.85)`;
      shadow.current.style.opacity = "0.7";
    }
  }
  function leave() {
    const el = tilt.current;
    if (el) el.style.transform = "";
    if (shadow.current) {
      shadow.current.style.transform = "";
      shadow.current.style.opacity = "";
    }
  }

  // Embossed icon: dark shadow down-right, light highlight up-left, then the stamped icon.
  const stamped = (
    <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
      <Icon className="absolute" style={{ width: iconSize, height: iconSize, transform: "translate(0.8px, 1px)" }} stroke="#000" strokeOpacity={0.35} strokeWidth={2.4} />
      <Icon className="absolute" style={{ width: iconSize, height: iconSize, transform: "translate(-0.6px, -0.7px)" }} stroke="#fff" strokeOpacity={0.45} strokeWidth={2.2} />
      <Icon className="absolute" style={{ width: iconSize, height: iconSize, color: m.ink }} strokeWidth={2.2} />
    </span>
  );

  return (
    <span
      className="medal group relative inline-flex shrink-0"
      style={
        {
          width: size,
          height: size,
          perspective: size * 4,
          // Glow lives here, not on the 3D layers: a filter there would flatten the flip.
          filter: level === 3 ? "drop-shadow(0 0 6px color-mix(in srgb, var(--holo-2, #ffe28a) 45%, transparent))" : undefined,
        } as CSSProperties
      }
      onPointerMove={move}
      onPointerLeave={leave}
    >
      {/* Soft contact shadow under the coin. */}
      <span
        ref={shadow}
        aria-hidden
        className="medal-shadow absolute left-1/2 -translate-x-1/2 rounded-full bg-black/60 blur-[3px]"
        style={{ bottom: -size * 0.06, width: size * 0.7, height: size * 0.1 }}
      />
      <span
        ref={tilt}
        className="medal-tilt relative block h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
      >
        <span className={`relative block h-full w-full ${level === 3 ? "medal-flip" : ""}`} style={{ transformStyle: "preserve-3d" }}>
          {/* Edge thickness: rim-coloured discs stacked behind the face. */}
          {Array.from({ length: EDGE_LAYERS }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className="absolute inset-[2px] rounded-full"
              style={{ background: m.lo, transform: `translateZ(${-(i + 1) * (size / 64)}px)`, opacity: 0.9 }}
            />
          ))}

          {/* Front */}
          <span className="absolute inset-0 block [backface-visibility:hidden]">
            <CoinFace uid={`${uid}f`} level={level}>
              {level === 0 && progress !== undefined && progress > 0 && (
                <circle
                  cx="32"
                  cy="32"
                  r={R_RIM - 1.5}
                  fill="none"
                  stroke="var(--strava)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={`${progress * C} ${C}`}
                  transform="rotate(-90 32 32)"
                />
              )}
            </CoinFace>
            {stamped}
          </span>

          {/* Back (seen during a level III flip): engraved numeral. */}
          {level === 3 && (
            <span className="absolute inset-0 block [backface-visibility:hidden] [transform:rotateY(180deg)]" aria-hidden>
              <CoinFace uid={`${uid}b`} level={3} />
              <span
                className="absolute inset-0 flex items-center justify-center font-accent font-medium"
                style={{ fontSize: size * 0.26, color: m.ink, textShadow: "-0.6px -0.6px 0 rgba(255,255,255,0.5), 0.8px 0.8px 0 rgba(0,0,0,0.35)" }}
              >
                III
              </span>
            </span>
          )}
        </span>
      </span>

      {level > 0 && (
        <span
          className="absolute -bottom-1 left-1/2 z-10 -translate-x-1/2 rounded-full px-1.5 font-accent text-[9px] font-medium leading-[14px] tracking-wider shadow-sm"
          style={{
            background:
              level === 3
                ? "linear-gradient(90deg, var(--holo-1), var(--holo-2), var(--holo-3), var(--holo-4))"
                : `linear-gradient(135deg, ${m.hi}, ${m.mid})`,
            color: "#140f0c",
          }}
        >
          {LEVEL_NUMERALS[level - 1]}
        </span>
      )}
    </span>
  );
}
