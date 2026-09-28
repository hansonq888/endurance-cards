import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * App icon (favicon, and the image uploaded to the Strava API app page):
 * a bold "99" over orange topo contour rings on the site background.
 */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** Wobbly nested rings around a summit, like the card's contour lines. */
function rings(cx: number, cy: number): string {
  const harmonics = [
    { k: 2, a: 0.06, p: 0.8 },
    { k: 3, a: 0.04, p: 2.1 },
    { k: 5, a: 0.02, p: 4.0 },
  ];
  let out = "";
  for (let i = 0; i < 9; i++) {
    const r = 46 + i * 38;
    let d = "";
    for (let j = 0; j <= 96; j++) {
      const t = (j / 96) * Math.PI * 2;
      const w = 1 + harmonics.reduce((s, h) => s + h.a * Math.sin(h.k * t + h.p), 0);
      d += `${j ? "L" : "M"}${(cx + Math.cos(t) * r * w * 1.1).toFixed(1)} ${(cy + Math.sin(t) * r * w).toFixed(1)}`;
    }
    const index = (i + 1) % 3 === 0;
    out += `<path d="${d}Z" fill="none" stroke="#fc4c02" stroke-opacity="${index ? 0.7 : 0.35}" stroke-width="${index ? 5 : 3}"/>`;
  }
  return out;
}

export default async function Icon() {
  const font = await readFile(join(process.cwd(), "assets/fonts/mona-sans-wide-black-italic.woff"));
  const art = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
<defs><radialGradient id="g" cx="0.72" cy="0.28" r="0.8"><stop offset="0" stop-color="#fc4c02" stop-opacity="0.35"/><stop offset="1" stop-color="#fc4c02" stop-opacity="0"/></radialGradient></defs>
<rect width="512" height="512" fill="#140f0c"/>
<rect width="512" height="512" fill="url(#g)"/>
${rings(360, 150)}
</svg>`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative" }}>
        <img src={`data:image/svg+xml;base64,${Buffer.from(art).toString("base64")}`} alt="" width={512} height={512} style={{ position: "absolute", top: 0, left: 0 }} />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 70,
            display: "flex",
            justifyContent: "center",
            fontFamily: "Mona Sans Wide",
            fontWeight: 900,
            fontStyle: "italic",
            fontSize: 250,
            lineHeight: 1,
            color: "#ece6da",
          }}
        >
          99
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Mona Sans Wide", data: font, weight: 900, style: "italic" }] },
  );
}
