/**
 * The topo card face, shared by the web component and the PNG renderer.
 *
 * Written against Satori's CSS subset (inline styles, absolute positioning,
 * explicit `display: flex`) so the same tree renders in the browser and in
 * next/og. Sizes are card design units passed through `u()`: the web maps
 * them to container-query units, the PNG to pixels.
 */
import type { CSSProperties } from "react";
import type { PlayerCard } from "@/types/player";
import { CARD_H, CARD_W, TIER_THEMES } from "./card-theme";
import { cardArtSvg, PHOTO_R, RIDGE_KEY_BASELINE, RIDGE_TOP, ridgePoints, SUMMIT, svgDataUri } from "./topo";

export interface CardFaceProps {
  card: PlayerCard;
  /** Design units → CSS length (e.g. `n => n * 2` for PNG, `n => \`${n / 3}cqw\`` for web). */
  u: (n: number) => number | string;
  /** Font styles for the display face (wide black italic) and body face (Barlow). */
  fonts: { display: CSSProperties; body: CSSProperties };
  /** Avatar image source (URL on the web, data URI in the PNG), or null for initials. */
  avatarSrc: string | null;
}

function initials(name: string) {
  return (
    name
      .replace(/[^A-Za-z ]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export function CardFace({ card, u, fonts, avatarSrc }: CardFaceProps) {
  const t = TIER_THEMES[card.tier];
  // Lengths embedded in strings need explicit units (Satori won't accept bare numbers there).
  const len = (n: number) => {
    const v = u(n);
    return typeof v === "number" ? `${v}px` : v;
  };
  const halo = { textShadow: `0 0 ${len(2)} ${t.bg}, 0 0 ${len(4)} ${t.bg}, 0 0 ${len(6)} ${t.bg}` };
  const small = (size: number, weight: number, extra: CSSProperties = {}): CSSProperties => ({
    ...fonts.body,
    fontSize: u(size),
    fontWeight: weight,
    lineHeight: 1,
    color: t.muted,
    ...halo,
    ...extra,
  });
  const inner = PHOTO_R - 3;
  // Shrink long names to fit, down to a readable floor; beyond that, ellipsis.
  const nameSize = Math.max(13, Math.min(20, Math.floor(165 / Math.max(1, card.displayName.length))));

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: u(CARD_W),
        height: u(CARD_H),
        borderRadius: u(16),
        overflow: "hidden",
        background: t.bg,
        color: t.ink,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={svgDataUri(cardArtSvg(card))} alt="" width={CARD_W} height={CARD_H} style={{ position: "absolute", top: 0, left: 0, width: u(CARD_W), height: u(CARD_H) }} />

      {/* Photo on the summit */}
      {avatarSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarSrc}
          alt=""
          width={inner * 2}
          height={inner * 2}
          referrerPolicy="no-referrer"
          style={{
            position: "absolute",
            left: u(SUMMIT.x - inner),
            top: u(SUMMIT.y - inner),
            width: u(inner * 2),
            height: u(inner * 2),
            borderRadius: u(inner),
            objectFit: "cover",
          }}
        />
      ) : (
        <div
          style={{
            ...fonts.display,
            position: "absolute",
            left: u(SUMMIT.x - inner),
            top: u(SUMMIT.y - inner),
            width: u(inner * 2),
            height: u(inner * 2),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: u(30),
            color: t.bg,
          }}
        >
          {initials(card.name || card.displayName)}
        </div>
      )}

      {/* Rating block */}
      <div style={{ ...fonts.display, position: "absolute", left: u(20), top: u(16), fontSize: u(60), lineHeight: 1, display: "flex" }}>
        {card.overall}
      </div>
      <div style={{ position: "absolute", left: u(20), top: u(86), display: "flex", flexDirection: "column", gap: u(5) }}>
        <span style={small(11, 700, { letterSpacing: u(2.75) })}>{card.position}</span>
        <span style={small(11, 700, { letterSpacing: u(2.75) })}>{t.terrain.toUpperCase()}</span>
      </div>

      {/* Ridge labels */}
      {ridgePoints(card).map((p) => (
        <div key={p.key} style={{ position: "absolute", left: u(p.x - 20), width: u(40), top: 0, height: u(CARD_H), display: "flex" }}>
          <span
            style={{
              ...fonts.body,
              position: "absolute",
              top: u(p.y - 21),
              width: u(40),
              display: "flex",
              justifyContent: "center",
              fontSize: u(13),
              fontWeight: 800,
              lineHeight: 1,
              color: t.ink,
              ...halo,
            }}
          >
            {p.value}
          </span>
          <span
            style={small(9.5, 700, {
              position: "absolute",
              top: u(RIDGE_TOP + RIDGE_KEY_BASELINE - 8),
              width: u(40),
              display: "flex",
              justifyContent: "center",
              letterSpacing: u(1.2),
            })}
          >
            {p.key}
          </span>
        </div>
      ))}

      {/* Name + highlight */}
      <div
        style={{
          position: "absolute",
          left: u(20),
          right: u(20),
          top: u(364),
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: u(12),
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
          <span style={{ ...fonts.display, fontSize: u(nameSize), lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: t.ink }}>
            {card.displayName}
          </span>
          <span style={small(10, 700, { marginTop: u(6), letterSpacing: u(2) })}>{card.archetype.toUpperCase()}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: u(3) }}>
            {card.highlight.climb && (
              <svg viewBox="0 0 8 7" style={{ width: u(8), height: u(7) }}>
                <path d="M4 0 L8 7 L0 7 Z" fill={t.ink} />
              </svg>
            )}
            <span style={{ ...fonts.body, fontSize: u(14), fontWeight: 800, lineHeight: 1, color: t.ink, ...halo }}>{card.highlight.value}</span>
          </div>
          <span style={small(10, 700, { marginTop: u(3), letterSpacing: u(1) })}>{card.highlight.label}</span>
        </div>
      </div>
    </div>
  );
}
