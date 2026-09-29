import { renderSiteOgImage, OG_H, OG_W } from "@/lib/card-renderer";
import { demoCards } from "@/lib/demo-cards";

/** The site's link preview (iMessage, X, Discord, Slack…). Profile pages override it with their own card. */
export const alt = "Kudex: your Strava training as a player card, rated out of 99";
export const size = { width: OG_W, height: OG_H };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const host = new URL(process.env.APP_URL ?? "https://endurance-cards.vercel.app").host;
  return renderSiteOgImage(host, demoCards());
}
