import type { NextRequest } from "next/server";
import { renderStoryPng } from "@/lib/card-renderer";
import { env } from "@/lib/env";
import { errorResponse } from "@/lib/errors";
import { getCardBySlug } from "@/lib/scout";
import { PUBLIC_CACHE } from "../route";

/** GET /api/scout/:username/story → 1080×1920 PNG for Instagram / TikTok / Snapchat stories. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/scout/[username]/story">) {
  const { username } = await ctx.params;
  try {
    const { card } = await getCardBySlug(username);
    const host = new URL(env.appUrl ?? req.nextUrl.origin).host;
    return await renderStoryPng(card, host, { headers: { "Cache-Control": PUBLIC_CACHE } });
  } catch (err) {
    return errorResponse(err);
  }
}
