import { contourPaths, SUMMIT } from "@/lib/topo";

/**
 * Big, faint topo contours — the card art's signature — used as a backdrop.
 * Same generator as the cards (lib/topo.ts), centred on its summit.
 */
export function TopoBackdrop({ seed = 7, className = "" }: { seed?: number; className?: string }) {
  const rings = contourPaths(seed, 22);
  const size = 640;
  return (
    <svg
      aria-hidden
      viewBox={`${SUMMIT.x - size / 2} ${SUMMIT.y - size / 2} ${size} ${size}`}
      className={`pointer-events-none ${className}`}
      fill="none"
      stroke="var(--strava)"
    >
      {rings.map((r, i) => (
        <path key={i} d={r.d} strokeOpacity={r.index ? 0.32 : 0.14} strokeWidth={r.index ? 1.2 : 0.7} />
      ))}
    </svg>
  );
}
