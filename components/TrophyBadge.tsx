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

function FoilStops() {
  return (
    <>
      <stop offset="0" style={{ stopColor: "var(--holo-1, #fc4c02)" }} />
      <stop offset="0.33" style={{ stopColor: "var(--holo-2, #ffb238)" }} />
      <stop offset="0.66" style={{ stopColor: "var(--holo-3, #ff7a59)" }} />
      <stop offset="1" style={{ stopColor: "var(--holo-4, #ffe29a)" }} />
    </>
  );
}

const R = 28;
const C = 2 * Math.PI * R;

/**
 * GitHub-achievement-style medallion. The ring shows the level: I plain,
 * II Strava orange, III tier foil with a glow. Locked badges are greyed with an
 * orange arc showing progress toward level I.
 *
 * Foil colours come from --holo-1..4 on an ancestor (see holoVars()).
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
  const gradId = `badge-foil-${id}`;
  const ring = level === 3 ? `url(#${gradId})` : level === 2 ? "var(--strava)" : level === 1 ? "#a89d92" : "var(--line)";

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full" aria-hidden style={level === 3 ? { filter: "drop-shadow(0 0 6px color-mix(in srgb, var(--holo-2) 45%, transparent))" } : undefined}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <FoilStops />
          </linearGradient>
          {/*
            Icon foil in the icon's own 24-unit space. A bounding-box gradient
            would vanish on perfectly straight strokes (zero-height bbox).
          */}
          <linearGradient id={`${gradId}-icon`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="24">
            <FoilStops />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r={R} fill="var(--surface-2)" />
        <circle cx="32" cy="32" r={R - 5} fill="none" stroke="var(--line)" strokeWidth="1" />
        <circle cx="32" cy="32" r={R} fill="none" stroke={ring} strokeWidth={level === 3 ? 3.5 : 2.5} strokeDasharray={level === 0 ? "3 3" : undefined} />
        {level === 0 && progress !== undefined && progress > 0 && (
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke="var(--strava)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${progress * C} ${C}`}
            transform="rotate(-90 32 32)"
          />
        )}
      </svg>
      <Icon
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: size * 0.36, height: size * 0.36 }}
        stroke={level === 3 ? `url(#${gradId}-icon)` : level === 0 ? "var(--muted)" : "var(--foreground)"}
        strokeWidth={2}
        aria-hidden
      />
      {level > 0 && (
        <span
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-1.5 font-accent text-[9px] font-medium leading-[14px] tracking-wider"
          style={
            level === 3
              ? { background: "linear-gradient(90deg, var(--holo-1), var(--holo-2), var(--holo-3), var(--holo-4))", color: "#140f0c" }
              : { background: level === 2 ? "var(--strava)" : "#3a302a", color: level === 2 ? "#140f0c" : "var(--foreground)" }
          }
        >
          {LEVEL_NUMERALS[level - 1]}
        </span>
      )}
    </span>
  );
}
