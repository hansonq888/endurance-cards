import type { NextRequest } from "next/server";
import sharp from "sharp";
import { renderStoryPng } from "@/lib/card-renderer";
import { env } from "@/lib/env";
import { errorResponse } from "@/lib/errors";
import { imageCacheControl } from "@/lib/access";
import { getCardBySlug } from "@/lib/scout";
import { getSessionAthleteId } from "@/lib/session";

/**
 * GET /api/scout/:username/story → 1080×1920 JPEG for Instagram / TikTok / Snapchat stories.
 * Rendered as PNG, then sent as JPEG: the grainy backdrop makes the PNG ~2.4 MB,
 * the JPEG ~240 KB with no visible difference, which matters on mobile data.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/scout/[username]/story">) {
  const { username } = await ctx.params;
  try {
    const { card, viewer } = await getCardBySlug(username, await getSessionAthleteId());
    const host = new URL(env.appUrl ?? req.nextUrl.origin).host;
    // The story is signed with just the site's address: it's meant to be posted, and the secret link stays private.
    const png = Buffer.from(await (await renderStoryPng(card, host)).arrayBuffer());
    const jpeg = await sharp(png).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    return new Response(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": imageCacheControl(viewer, req.nextUrl.searchParams.has("v")),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
