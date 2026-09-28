/**
 * Topo card artwork, shared by the web card and the PNG export. Pure functions
 * only (no DOM, no Node APIs) so both renderers produce identical art.
 *
 * Everything is in card design units (CARD_W × CARD_H).
 */
import { ATTRIBUTE_KEYS, type AttributeKey, type PlayerCard } from "@/types/player";
import { CARD_H, CARD_W, TIER_THEMES } from "./card-theme";

/** Photo sits on the summit; contour rings start just outside it. */
export const SUMMIT = { x: 216, y: 92 } as const;
export const PHOTO_R = 46;
const CLEAR_R = PHOTO_R + 12;

/** Ridge (stat profile) band: SVG-local 0..215 placed at RIDGE_TOP on the card. */
export const RIDGE_TOP = 138;
const RIDGE_BASE = 196;
export const RIDGE_KEY_BASELINE = 210;

/** Mulberry32 — deterministic per athlete so the same person always gets the same terrain. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Nested contour rings around a single summit. Every ring is the same wobbly
 * shape scaled up (with the wobble easing in near the summit), so rings never cross.
 */
export function contourPaths(seed: number, rings = 16): { d: string; index: boolean }[] {
  const r = rng(seed);
  const harmonics = [2, 3, 5, 7].map((k) => ({ k, a: (0.05 + r() * 0.1) / (k / 2), p: r() * Math.PI * 2 }));
  const sx = 0.85 + r() * 0.4;
  const sy = 0.85 + r() * 0.4;
  const rot = r() * Math.PI;
  const spacing = 14 + r() * 4;
  const out: { d: string; index: boolean }[] = [];
  for (let i = 0; i < rings; i++) {
    const radius = CLEAR_R + i * spacing;
    const ease = Math.min(1, 0.35 + i * 0.15);
    let d = "";
    for (let j = 0; j <= 90; j++) {
      const th = (j / 90) * Math.PI * 2;
      const wob = 1 + harmonics.reduce((acc, h) => acc + h.a * Math.sin(h.k * th + h.p), 0) * ease;
      const ex = Math.cos(th) * radius * wob * sx;
      const ey = Math.sin(th) * radius * wob * sy;
      const x = SUMMIT.x + ex * Math.cos(rot) - ey * Math.sin(rot);
      const y = SUMMIT.y + ex * Math.sin(rot) + ey * Math.cos(rot);
      d += `${j ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    out.push({ d: `${d}Z`, index: (i + 1) % 5 === 0 });
  }
  return out;
}

/** Catmull-Rom → cubic Bézier so the profile reads as terrain, not a line chart. */
function smooth(pts: readonly (readonly [number, number])[]): string {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c = (a: number, b: number) => (a / 6 + b).toFixed(1);
    d += ` C${c(p2[0] - p0[0], p1[0])} ${c(p2[1] - p0[1], p1[1])} ${c(-(p3[0] - p1[0]), p2[0])} ${c(-(p3[1] - p1[1]), p2[1])} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export interface RidgePoint {
  key: AttributeKey;
  value: number;
  /** Card coordinates of the ridge vertex. */
  x: number;
  y: number;
}

export function ridgePoints(card: PlayerCard): RidgePoint[] {
  return ATTRIBUTE_KEYS.map((key, i) => {
    const value = card.attributes[key].value;
    return { key, value, x: 18 + i * 52.8, y: RIDGE_TOP + 190 - value * 1.55 };
  });
}

/** Full background artwork (contours, knock-outs, ridge, photo ring) as a standalone SVG string. */
export function cardArtSvg(card: PlayerCard): string {
  const t = TIER_THEMES[card.tier];
  const pts = ridgePoints(card);
  const local = pts.map((p) => [p.x, p.y - RIDGE_TOP] as const);
  const line = smooth(local);
  const first = local[0];
  const last = local[local.length - 1];
  // Pearl finish (Icon): iridescent strokes and a gradient ground instead of flat colours.
  const pearl = t.pearl;
  const lineColor = pearl ? "url(#iri)" : t.contour;
  const accent = pearl ? "url(#iri)" : t.accent;
  const contours = contourPaths(card.athleteId)
    .map(
      (c) =>
        `<path d="${c.d}" fill="none" stroke="${lineColor}" stroke-opacity="${c.index ? 0.63 : 0.35}" stroke-width="${c.index ? 1.4 : 0.8}"/>`,
    )
    .join("");
  const ticks = local
    .map(
      ([x, y]) =>
        `<line x1="${x}" x2="${x}" y1="${y + 6}" y2="${RIDGE_BASE}" stroke="${t.ink}" stroke-opacity="0.15"/>` +
        `<circle cx="${x}" cy="${y}" r="3.5" fill="${t.bg}" stroke="${accent}" stroke-width="2"/>`,
    )
    .join("");
  const stops = (colors: readonly string[], opacity = 1) =>
    colors.map((c, i) => `<stop offset="${i / (colors.length - 1)}" stop-color="${c}" stop-opacity="${opacity}"/>`).join("");

  const pearlDefs = pearl
    ? `<linearGradient id="pearl" x1="0" y1="0" x2="1" y2="1">${stops(pearl.bg)}</linearGradient>
<linearGradient id="iri" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${CARD_W}" y2="${CARD_H}">${stops(pearl.lines)}</linearGradient>
<linearGradient id="iriFill" x1="0" y1="0" x2="1" y2="0">${stops(pearl.lines, 0.42)}</linearGradient>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
<mask id="ridgeFade" maskUnits="userSpaceOnUse" x="0" y="0" width="${CARD_W}" height="${RIDGE_BASE}"><rect width="${CARD_W}" height="${RIDGE_BASE}" fill="url(#fade)"/></mask>
<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
    : "";
  const ground = pearl
    ? `<rect width="${CARD_W}" height="${CARD_H}" fill="url(#pearl)"/>
<path d="M-40 250 L${CARD_W + 40} 60 V120 L-40 310 Z" fill="url(#sheen)" opacity="0.55"/>`
    : `<rect width="${CARD_W}" height="${CARD_H}" fill="${t.bg}"/>`;
  const ridgeFill = pearl
    ? `<path d="${line} L${last[0]} ${RIDGE_BASE} L${first[0]} ${RIDGE_BASE} Z" fill="url(#iriFill)" mask="url(#ridgeFade)"/>`
    : `<path d="${line} L${last[0]} ${RIDGE_BASE} L${first[0]} ${RIDGE_BASE} Z" fill="url(#fill)"/>`;
  const frame = pearl
    ? `<rect x="6" y="6" width="${CARD_W - 12}" height="${CARD_H - 12}" rx="11" fill="none" stroke="url(#iri)" stroke-width="0.9" stroke-opacity="0.85"/>`
    : "";

  // Knock-outs: contours fade behind the rating block (top-left) and the name strip (bottom),
  // like the paint-out behind labels on a printed map.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
<defs>
<radialGradient id="tl" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(55 60) scale(115 95)"><stop offset="0.45" stop-color="black"/><stop offset="1" stop-color="white"/></radialGradient>
<linearGradient id="bt" x1="0" y1="${CARD_H - 95}" x2="0" y2="${CARD_H - 50}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
<mask id="mb" maskUnits="userSpaceOnUse" x="0" y="0" width="${CARD_W}" height="${CARD_H}"><rect width="${CARD_W}" height="${CARD_H}" fill="url(#bt)"/></mask>
<mask id="mt" maskUnits="userSpaceOnUse" x="0" y="0" width="${CARD_W}" height="${CARD_H}"><rect width="${CARD_W}" height="${CARD_H}" fill="url(#tl)"/></mask>
<linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.accent}" stop-opacity="0.5"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></linearGradient>
${pearlDefs}
</defs>
${ground}
<g mask="url(#mb)"><g mask="url(#mt)">${contours}</g></g>
<circle cx="${SUMMIT.x}" cy="${SUMMIT.y}" r="${PHOTO_R + 6}" fill="${pearl ? "url(#pearl)" : t.bg}"/>
<circle cx="${SUMMIT.x}" cy="${SUMMIT.y}" r="${PHOTO_R - 1.5}" fill="${t.contour}" stroke="${accent}" stroke-width="3"/>
<g transform="translate(0 ${RIDGE_TOP})">
${ridgeFill}
<path d="${line}" fill="none" stroke="${accent}" stroke-width="2.5"/>
${ticks}
</g>
${frame}
</svg>`;
}

export const svgDataUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
