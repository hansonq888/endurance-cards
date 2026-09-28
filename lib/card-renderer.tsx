import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { PlayerCard } from "@/types/player";
import { CardFace } from "./card-face";
import { CARD_H, CARD_W, PNG_SCALE, TIER_THEMES } from "./card-theme";

/**
 * Server-side PNG rendering via next/og (Satori + Resvg), using the same card
 * face as the web. Satori can't use variable fonts, so a static instance of
 * Mona Sans Wide Black Italic is vendored alongside Barlow.
 */

type LoadedFont = { name: string; data: Buffer; weight: 500 | 700 | 800 | 900; style: "normal" | "italic" };
let fontsPromise: Promise<LoadedFont[]> | null = null;

const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file));

function loadFonts() {
  fontsPromise ??= Promise.all([
    ...([500, 700, 800] as const).map(async (weight) => ({
      name: "Barlow",
      data: await font(`barlow-latin-${weight}-normal.woff`),
      weight,
      style: "normal" as const,
    })),
    font("mona-sans-wide-black-italic.woff").then((data) => ({ name: "Mona Sans Wide", data, weight: 900 as const, style: "italic" as const })),
  ]).catch((err) => {
    fontsPromise = null;
    throw err;
  });
  return fontsPromise;
}

const PNG_FONTS = {
  display: { fontFamily: "Mona Sans Wide", fontWeight: 900, fontStyle: "italic" as const },
  body: { fontFamily: "Barlow" },
};

const AVATAR_HOSTS = /(^|\.)(strava\.com|cloudfront\.net|stravacdn\.com)$/i;

/** Inlines the avatar so a slow/broken Strava CDN can't fail the whole render. */
async function avatarDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:" || !AVATAR_HOSTS.test(hostname)) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 400_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function renderCardPng(card: PlayerCard, init?: { headers?: Record<string, string> }): Promise<ImageResponse> {
  const [fonts, avatar] = await Promise.all([loadFonts(), avatarDataUri(card.avatarUrl)]);
  return new ImageResponse(<CardFace card={card} u={(n) => n * PNG_SCALE} fonts={PNG_FONTS} avatarSrc={avatar} />, {
    width: CARD_W * PNG_SCALE,
    height: CARD_H * PNG_SCALE,
    fonts,
    headers: init?.headers,
  });
}

/** Story format for Instagram / TikTok / Snapchat. */
export const STORY_W = 1080;
export const STORY_H = 1920;
const STORY_SCALE = 3; // card is 900 × 1260 px

/** Tier-tinted grainy gradient backdrop (Nike year-in-review style) as an SVG data URI. */
function storyBackdrop(card: PlayerCard): string {
  const [a, b] = TIER_THEMES[card.tier].holo;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${STORY_W}" height="${STORY_H}">
<defs>
<radialGradient id="g1" cx="0.85" cy="0.1" r="0.9"><stop offset="0" stop-color="${a}" stop-opacity="0.55"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></radialGradient>
<radialGradient id="g2" cx="0.1" cy="0.95" r="0.8"><stop offset="0" stop-color="#3c465a" stop-opacity="0.85"/><stop offset="1" stop-color="#3c465a" stop-opacity="0"/></radialGradient>
<radialGradient id="g3" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${b}" stop-opacity="0.18"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient>
<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
</defs>
<rect width="100%" height="100%" fill="#110c0a"/>
<rect width="100%" height="100%" fill="url(#g1)"/>
<rect width="100%" height="100%" fill="url(#g2)"/>
<rect width="100%" height="100%" fill="url(#g3)"/>
<rect width="100%" height="100%" filter="url(#n)" opacity="0.16"/>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** 1080×1920 story image: the card on a grainy tier gradient with the wordmark and link. */
export async function renderStoryPng(card: PlayerCard, host: string, init?: { headers?: Record<string, string> }): Promise<ImageResponse> {
  const [fonts, avatar] = await Promise.all([loadFonts(), avatarDataUri(card.avatarUrl)]);
  const t = TIER_THEMES[card.tier];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", position: "relative", color: "#ece6da" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={storyBackdrop(card)} alt="" width={STORY_W} height={STORY_H} style={{ position: "absolute", top: 0, left: 0 }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 150 }}>
          <span style={{ ...PNG_FONTS.body, fontSize: 30, fontWeight: 700, letterSpacing: 8, color: "#a89d92" }}>
            {`${t.label.toUpperCase()} · ${t.terrain.toUpperCase()}`}
          </span>
          <span style={{ ...PNG_FONTS.display, fontSize: 64, marginTop: 14 }}>MY PLAYER CARD</span>
        </div>
        <div style={{ display: "flex", marginTop: 70, borderRadius: 48, boxShadow: "0 40px 120px rgba(0,0,0,0.6)" }}>
          <CardFace card={card} u={(n) => n * STORY_SCALE} fonts={PNG_FONTS} avatarSrc={avatar} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "auto", marginBottom: 130 }}>
          {/* Two flex items: the italic's overhang otherwise reads as a gap. */}
          <div style={{ ...PNG_FONTS.display, display: "flex", fontSize: 52 }}>
            <span>STRAVA</span>
            <span style={{ color: "#fc4c02", marginLeft: -10 }}>-FUT</span>
          </div>
          <span style={{ ...PNG_FONTS.body, fontSize: 30, fontWeight: 500, color: "#a89d92", marginTop: 12 }}>{`${host}/${card.slug}`}</span>
        </div>
      </div>
    ),
    { width: STORY_W, height: STORY_H, fonts, headers: init?.headers },
  );
}
