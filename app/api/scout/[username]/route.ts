import type { NextRequest } from "next/server";
import { renderCardPng } from "@/lib/card-renderer";
import { errorResponse } from "@/lib/errors";
import { getCardBySlug, removeBySlug, rescoutBySlug } from "@/lib/scout";
import { clearSession, getSessionAthleteId } from "@/lib/session";

/** Embeds are refreshed by the stale-while-revalidate cache, so let CDNs hold them too. */
export const PUBLIC_CACHE = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

/**
 * GET    /api/scout/:username            → card JSON
 * GET    /api/scout/:username?format=png → card PNG (see also ./card and /:username.png)
 * POST   /api/scout/:username            → owner re-scout (cooldown-limited)
 * DELETE /api/scout/:username            → owner removes card + revokes Strava access
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/scout/[username]">) {
  const { username } = await ctx.params;
  try {
    const envelope = await getCardBySlug(username);
    if (req.nextUrl.searchParams.get("format") === "png") {
      return await renderCardPng(envelope.card, {
        headers: { "Cache-Control": PUBLIC_CACHE, "X-Card-Stale": String(envelope.stale) },
      });
    }
    return Response.json(envelope, { headers: { "Cache-Control": PUBLIC_CACHE } });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/scout/[username]">) {
  const { username } = await ctx.params;
  try {
    const card = await rescoutBySlug(username, await getSessionAthleteId());
    return Response.json({ card, stale: false, source: "fresh" }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/scout/[username]">) {
  const { username } = await ctx.params;
  try {
    await removeBySlug(username, await getSessionAthleteId());
    await clearSession();
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
