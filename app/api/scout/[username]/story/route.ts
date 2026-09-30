import type { NextRequest } from "next/server";
import { imageCacheControl } from "@/lib/access";
import { env } from "@/lib/env";
import { errorResponse } from "@/lib/errors";
import { getCardBySlug } from "@/lib/scout";
import { getSessionAthleteId } from "@/lib/session";
import { storyImage } from "@/lib/share-images";

/** GET /api/scout/:username/story → 1080×1920 JPEG for Instagram / TikTok / Snapchat stories. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/scout/[username]/story">) {
  const { username } = await ctx.params;
  try {
    const { card, viewer } = await getCardBySlug(username, await getSessionAthleteId());
    // The story is signed with just the site's address: it's meant to be posted, and the secret link stays private.
    const host = new URL(env.appUrl ?? req.nextUrl.origin).host;
    const { bytes, contentType } = await storyImage(card, host);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": contentType, "Cache-Control": imageCacheControl(viewer, req.nextUrl.searchParams.has("v")) },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
