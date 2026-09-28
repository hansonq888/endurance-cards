import type { CardTier } from "@/types/player";

/**
 * Tier colourways for the topo card. Tiers are named after landscapes; the
 * rank label (Bronze…Icon) is still used in page titles and copy.
 */
export interface TierTheme {
  /** Rank name, e.g. "Gold". */
  label: string;
  /** Landscape colourway printed on the card, e.g. "Alpenglow". */
  terrain: string;
  bg: string;
  contour: string;
  ink: string;
  muted: string;
  accent: string;
  /** Four foil colours for holographic effects, tinted to the tier's landscape. */
  holo: [string, string, string, string];
  /** Whether the card itself gets the holo sheen (a reward for the top tiers). */
  holoCard: boolean;
  /**
   * Optional pearlescent finish printed into the card art (so PNGs get it too):
   * a gradient background and iridescent lines in place of flat colours.
   */
  pearl?: { bg: [string, string, string, string]; lines: [string, string, string, string] };
}

export const TIER_THEMES: Record<CardTier, TierTheme> = {
  bronze: {
    label: "Bronze",
    terrain: "Canyon",
    bg: "#1f130c",
    contour: "#c7773f",
    ink: "#f3e1d0",
    muted: "#c9a58a",
    accent: "#e8863f",
    holo: ["#e8863f", "#ffb27a", "#c7773f", "#ffd9b8"],
    holoCard: false,
  },
  silver: {
    label: "Silver",
    terrain: "Granite",
    bg: "#12161c",
    contour: "#8394a8",
    ink: "#e8eef4",
    muted: "#9aa9b9",
    accent: "#cfdbe8",
    holo: ["#cfdbe8", "#8fb4ff", "#e8eef4", "#9aa9b9"],
    holoCard: false,
  },
  gold: {
    label: "Gold",
    terrain: "Alpenglow",
    bg: "#0c0b09",
    contour: "#e6b54a",
    ink: "#fbf0d4",
    muted: "#d2bd8a",
    accent: "#f2b72f",
    holo: ["#f2b72f", "#ffe28a", "#c98a1e", "#fff4c8"],
    holoCard: true,
  },
  icon: {
    label: "Icon",
    terrain: "Glacier",
    bg: "#edf0ec",
    contour: "#2f5566",
    ink: "#0f1f28",
    muted: "#4d6572",
    accent: "#fc4c02",
    holo: ["#8fd3ff", "#ffffff", "#bfe9ff", "#d9c8ff"],
    holoCard: true,
    pearl: {
      bg: ["#fbfbfd", "#e6eff8", "#eee6f7", "#f8f2ea"],
      lines: ["#4f9fd4", "#8f7de0", "#d9789f", "#3fb5a6"],
    },
  },
};

/** Card design units. The web card scales these; the PNG renders them at 2×. */
export const CARD_W = 300;
export const CARD_H = 420;
export const PNG_SCALE = 2;

/** CSS custom properties that drive the .holo-* styles for a tier. */
export function holoVars(tier: CardTier): Record<string, string> {
  const [a, b, c, d] = TIER_THEMES[tier].holo;
  return { "--holo-1": a, "--holo-2": b, "--holo-3": c, "--holo-4": d };
}
