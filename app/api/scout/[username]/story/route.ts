import type { NextRequest } from "next/server";
import { renderStoryPng } from "@/lib/card-renderer";
import { env } from "@/lib/env";
import { errorResponse } from "@/lib/errors";
import { cacheControlFor, parsePreview } from "@/lib/access";
import { getCardBySlug } from "@/lib/scout";
import { getSessionAthleteId } from "@/lib/session";

/** GET /api/scout/:username/story → 1080×1920 PNG for Instagram / TikTok / Snapchat stories. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/scout/[username]/story">) {
  const { username } = await ctx.params;
  try {
    const { card, viewer } = await getCardBySlug(username, await getSessionAthleteId(), {
      preview: parsePreview(req.nextUrl.searchParams.get("view")),
    });
    const host = new URL(env.appUrl ?? req.nextUrl.origin).host;
    // The link printed on the story must be one its viewers can open: the username only when public.
    const link = viewer.settings.visibility === "private" ? host : `${host}/${viewer.shareSlug}`;
    return await renderStoryPng(card, link, { headers: { "Cache-Control": cacheControlFor(viewer) } });
  } catch (err) {
    return errorResponse(err);
  }
}
