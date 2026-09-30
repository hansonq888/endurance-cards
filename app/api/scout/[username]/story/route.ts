import type { NextRequest } from "next/server";
import { renderStoryPng } from "@/lib/card-renderer";
import { env } from "@/lib/env";
import { errorResponse } from "@/lib/errors";
import { cacheControlFor } from "@/lib/access";
import { getCardBySlug } from "@/lib/scout";
import { getSessionAthleteId } from "@/lib/session";

/** GET /api/scout/:username/story → 1080×1920 PNG for Instagram / TikTok / Snapchat stories. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/scout/[username]/story">) {
  const { username } = await ctx.params;
  try {
    const { card, viewer } = await getCardBySlug(username, await getSessionAthleteId());
    const host = new URL(env.appUrl ?? req.nextUrl.origin).host;
    // The story is signed with just the site's address: it's meant to be posted, and the secret link stays private.
    return await renderStoryPng(card, host, { headers: { "Cache-Control": cacheControlFor(viewer) } });
  } catch (err) {
    return errorResponse(err);
  }
}
