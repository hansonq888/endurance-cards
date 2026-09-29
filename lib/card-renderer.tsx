import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { PlayerCard } from "@/types/player";
import { TURTLE_ON_DARK, turtleDataUri } from "./turtle";
import { CardFace } from "./card-face";
import { isDemoAvatar } from "./engine";
import { CARD_H, CARD_W, PNG_SCALE, TIER_THEMES } from "./card-theme";
import { contourPaths, SUMMIT } from "./topo";

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

/**
 * Where Strava profile photos live: its own CDNs, plus Google and Facebook for
 * accounts that signed up with them. Only these are fetched (the renderer runs
 * server-side, so it shouldn't fetch arbitrary URLs).
 */
const AVATAR_HOSTS = /(^|\.)(strava\.com|cloudfront\.net|stravacdn\.com|googleusercontent\.com|fbcdn\.net|fbsbx\.com|facebook\.com)$/i;
/** The PNG renderer (Satori) decodes these; anything else is skipped rather than breaking the image. */
const AVATAR_TYPES = /^image\/(jpeg|jpg|png|gif)/i;

/** Inlines the avatar so a slow or odd photo URL can't fail the whole render (it falls back to initials). */
async function avatarDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (isDemoAvatar(url)) {
    // Bundled demo photo: read it from disk (traced into the PNG routes in next.config.ts).
    const buf = await readFile(join(process.cwd(), "public", url)).catch(() => null);
    return buf ? `data:image/jpeg;base64,${buf.toString("base64")}` : null;
  }
  const skip = (reason: string) => {
    console.warn(`[kudex] card image without photo (${reason}): ${safeHost(url)}`);
    return null;
  };
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:") parsed.protocol = "https:"; // some older Strava photo URLs are plain http
    if (parsed.protocol !== "https:") return skip("not https");
    if (!AVATAR_HOSTS.test(parsed.hostname)) return skip("host not allowed");
    const res = await fetch(parsed, { signal: AbortSignal.timeout(6000), redirect: "follow" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok) return skip(`HTTP ${res.status}`);
    if (!AVATAR_TYPES.test(type)) return skip(`type ${type || "unknown"}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 2_000_000) return skip("too large");
    return `data:${type.split(";")[0]};base64,${buf.toString("base64")}`;
  } catch (err) {
    return skip((err as Error).name);
  }
}

/** Hostname only, for logs (photo URLs can carry ids). */
function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid url";
  }
}

const rgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/**
 * The card as a printed object, for images people download and share: a thin
 * light-catching edge (tier foil on holo cards), a diagonal glare, a baked-in
 * foil band on Gold and Icon, and a soft drop shadow. The web card gets these
 * live from TiltCard; a PNG has to have them painted in.
 */
function FinishedCard({ card, scale, avatar }: { card: PlayerCard; scale: number; avatar: string | null }) {
  const t = TIER_THEMES[card.tier];
  const radius = 16 * scale;
  const edge = 1.6 * scale;
  const [h1, h2, h3, h4] = t.holo;
  const fill = { position: "absolute", top: 0, left: 0, width: CARD_W * scale, height: CARD_H * scale } as const;
  return (
    <div
      style={{
        display: "flex",
        padding: edge,
        borderRadius: radius + edge,
        backgroundImage: t.holoCard
          ? `linear-gradient(135deg, ${h1}, ${h2}, ${h3}, ${h4})`
          : "linear-gradient(160deg, rgba(255,255,255,0.4), rgba(255,255,255,0.06) 45%, rgba(255,255,255,0.2))",
        boxShadow: `0 ${14 * scale}px ${34 * scale}px rgba(0,0,0,0.55), 0 ${4 * scale}px ${10 * scale}px rgba(0,0,0,0.35)`,
      }}
    >
      <div style={{ display: "flex", position: "relative", borderRadius: radius, overflow: "hidden" }}>
        <CardFace card={card} u={(n) => n * scale} fonts={PNG_FONTS} avatarSrc={avatar} />
        {t.holoCard && (
          <div
            style={{
              ...fill,
              backgroundImage: `linear-gradient(115deg, rgba(0,0,0,0) 18%, ${rgba(h1, 0.18)} 34%, ${rgba(h2, 0.22)} 44%, ${rgba(h3, 0.16)} 54%, ${rgba(h4, 0.14)} 64%, rgba(0,0,0,0) 80%)`,
            }}
          />
        )}
        <div
          style={{
            ...fill,
            backgroundImage:
              "linear-gradient(125deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.05) 28%, rgba(255,255,255,0) 42%, rgba(255,255,255,0) 72%, rgba(255,255,255,0.08) 100%)",
          }}
        />
      </div>
    </div>
  );
}

/** Room around the card (design units) for its shadow; more below, where the shadow falls. */
const PNG_PAD = { x: 22, top: 16, bottom: 34 };

export async function renderCardPng(card: PlayerCard, init?: { headers?: Record<string, string> }): Promise<ImageResponse> {
  const [fonts, avatar] = await Promise.all([loadFonts(), avatarDataUri(card.avatarUrl)]);
  // Transparent canvas, so the card and its shadow sit naturally on any page, README or chat.
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          paddingTop: PNG_PAD.top * PNG_SCALE,
        }}
      >
        <FinishedCard card={card} scale={PNG_SCALE} avatar={avatar} />
      </div>
    ),
    {
      width: (CARD_W + PNG_PAD.x * 2) * PNG_SCALE,
      height: (CARD_H + PNG_PAD.top + PNG_PAD.bottom) * PNG_SCALE,
      fonts,
      headers: init?.headers,
    },
  );
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

/** 1080×1920 story image: the finished card on a grainy tier gradient, signed off with the turtle and link. */
export async function renderStoryPng(card: PlayerCard, link: string, init?: { headers?: Record<string, string> }): Promise<ImageResponse> {
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
        <div style={{ display: "flex", alignItems: "flex-start", marginTop: 70 }}>
          <FinishedCard card={card} scale={STORY_SCALE} avatar={avatar} />
        </div>
        {/* Sign-off: the turtle with the link people can open underneath. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "auto", marginBottom: 110 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={turtleDataUri(TURTLE_ON_DARK, 130)} alt="" width={130} height={130} />
          <span style={{ ...PNG_FONTS.body, fontSize: 30, fontWeight: 500, color: "#a89d92", marginTop: 4 }}>{link}</span>
        </div>
      </div>
    ),
    { width: STORY_W, height: STORY_H, fonts, headers: init?.headers },
  );
}

/** Social link-preview size (Open Graph / X large card). */
export const OG_W = 1200;
export const OG_H = 630;

/** Faint topo contours for the preview background, from the same generator as the card art. */
function ogBackdrop(): string {
  const rings = contourPaths(7, 24)
    .map((r) => `<path d="${r.d}" fill="none" stroke="#fc4c02" stroke-opacity="${r.index ? 0.3 : 0.13}" stroke-width="${r.index ? 1.3 : 0.8}"/>`)
    .join("");
  // Centre the summit behind the card fan (right of centre).
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="${SUMMIT.x - 430} ${SUMMIT.y - 210} 600 315">
<rect x="-2000" y="-2000" width="5000" height="5000" fill="#140f0c"/>
<defs><radialGradient id="glow" cx="0.72" cy="0.55" r="0.5"><stop offset="0" stop-color="#fc4c02" stop-opacity="0.35"/><stop offset="1" stop-color="#fc4c02" stop-opacity="0"/></radialGradient></defs>
${rings}
<rect x="${SUMMIT.x - 430}" y="${SUMMIT.y - 210}" width="600" height="315" fill="url(#glow)"/>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * The site's link preview: turtle and headline on the left, a fanned hand of
 * finished demo cards on the right, over faint topo lines and a warm glow.
 */
export async function renderSiteOgImage(link: string, cards: [PlayerCard, PlayerCard, PlayerCard]): Promise<ImageResponse> {
  const [fonts, ...avatars] = await Promise.all([loadFonts(), ...cards.map((c) => avatarDataUri(c.avatarUrl))]);
  const scale = 0.9; // card ≈ 270 × 378
  // Silver left, Gold centre (on top), Icon right.
  const seats = [
    { left: 668, top: 150, rotate: -9 },
    { left: 782, top: 118, rotate: 0 },
    { left: 895, top: 150, rotate: 9 },
  ];
  // Side cards first so the middle one paints on top.
  const order = [0, 2, 1];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", color: "#ece6da" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ogBackdrop()} alt="" width={OG_W} height={OG_H} style={{ position: "absolute", top: 0, left: 0 }} />
        <div style={{ position: "absolute", left: 72, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={turtleDataUri(TURTLE_ON_DARK, 220)} alt="" width={220} height={220} style={{ margin: "-38px -34px -38px -50px" }} />
            <div style={{ display: "flex", flexDirection: "column", ...PNG_FONTS.display, fontSize: 66, lineHeight: 0.9, letterSpacing: -2 }}>
              <span>YOUR</span>
              <span>TRAINING</span>
              <span style={{ color: "#fc4c02" }}>RATED 99</span>
            </div>
          </div>
          <span style={{ ...PNG_FONTS.body, fontSize: 27, fontWeight: 500, color: "#a89d92", marginTop: 34, maxWidth: 500 }}>
            Your Strava year as a player card: six stats, four tiers, twelve trophies.
          </span>
          <span style={{ ...PNG_FONTS.body, fontSize: 24, fontWeight: 700, letterSpacing: 2, color: "#fc4c02", marginTop: 26 }}>{link}</span>
        </div>
        {order.map((i) => (
          <div
            key={i}
            style={{ position: "absolute", left: seats[i].left, top: seats[i].top, display: "flex", transform: `rotate(${seats[i].rotate}deg)` }}
          >
            <FinishedCard card={cards[i]} scale={scale} avatar={avatars[i]} />
          </div>
        ))}
      </div>
    ),
    { width: OG_W, height: OG_H, fonts },
  );
}
