/**
 * The Kudex turtle: a top-down tortoise whose shell is a topo map. One SVG
 * string, shared by the nav mark (components/TurtleMark.tsx), the app icons
 * and the story image, so it looks identical everywhere.
 */

export interface TurtleColors {
  /** Shell fill. */
  shell: string;
  /** Contour lines on the shell. */
  rings: string;
  ringOpacity: number;
  /** Head, legs and tail. */
  limbs: string;
  /** Optional rounded-square tile behind the turtle (app icons). */
  tile?: string;
}

export const TURTLE_ON_DARK: TurtleColors = { shell: "#fc4c02", rings: "#140f0c", ringOpacity: 0.42, limbs: "#ece6da" };
export const TURTLE_ICON: TurtleColors = { ...TURTLE_ON_DARK, tile: "#140f0c" };
export const TURTLE_ICON_ORANGE: TurtleColors = { shell: "#140f0c", rings: "#fc4c02", ringOpacity: 0.65, limbs: "#ece6da", tile: "#fc4c02" };

const CX = 65;
const CY = 68;
const RX = 30;
const RY = 35;
/** Summit of the shell's topo map: up and right of centre, like a hill on the card. */
const SUMMIT = { x: 70, y: 60 };

/**
 * Clean nested ovals, evenly spaced, each centre drifting from the summit back
 * toward the middle of the shell, so they read as a hill without crossing.
 */
function contourRings(): string[] {
  const out: string[] = [];
  for (let i = 0; i < 4; i++) {
    const rx = [6, 13, 21, 30][i];
    out.push(`<ellipse cx="${SUMMIT.x - i}" cy="${SUMMIT.y + i * 2}" rx="${rx}" ry="${Math.round(rx * 1.15)}"/>`);
  }
  return out;
}

const RINGS = contourRings();

/** The turtle as an SVG string on a 130×130 viewBox. `id` keeps clip ids unique per page. */
export function turtleSvg(colors: TurtleColors, id = "kt", size?: number): string {
  const { shell, rings, ringOpacity, limbs, tile } = colors;
  const dims = size ? ` width="${size}" height="${size}"` : "";
  // With a tile, shrink the turtle a little so it sits inside the rounded square.
  const body = `
<g fill="${limbs}">
  <ellipse cx="65" cy="25" rx="9.5" ry="10.5"/>
  <ellipse cx="38" cy="45" rx="11" ry="6.5" transform="rotate(-35 38 45)"/>
  <ellipse cx="92" cy="45" rx="11" ry="6.5" transform="rotate(35 92 45)"/>
  <ellipse cx="40" cy="93" rx="10" ry="6" transform="rotate(35 40 93)"/>
  <ellipse cx="90" cy="93" rx="10" ry="6" transform="rotate(-35 90 93)"/>
  <path d="M60 99 Q65 113 70 99 Z"/>
</g>
<ellipse cx="${CX}" cy="${CY}" rx="${RX}" ry="${RY}" fill="${shell}"/>
<g clip-path="url(#${id}-shell)" fill="none" stroke="${rings}" stroke-opacity="${ringOpacity}" stroke-width="2.6" stroke-linejoin="round">
  ${RINGS.join("")}
</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 130"${dims}>
<defs><clipPath id="${id}-shell"><ellipse cx="${CX}" cy="${CY}" rx="${RX}" ry="${RY}"/></clipPath></defs>
${tile ? `<rect width="130" height="130" rx="28" fill="${tile}"/><g transform="translate(65 66) scale(0.86) translate(-65 -66)">${body}</g>` : body}
</svg>`;
}

export function turtleDataUri(colors: TurtleColors, size?: number): string {
  return `data:image/svg+xml;base64,${Buffer.from(turtleSvg(colors, "kt", size)).toString("base64")}`;
}
