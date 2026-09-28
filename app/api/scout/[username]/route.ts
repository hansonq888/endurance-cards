import type { NextRequest } from "next/server";
import { renderCardPng } from "@/lib/card-renderer";
import { errorResponse } from "@/lib/errors";
import { cacheControlFor, redactForViewer } from "@/lib/access";
import { getCardBySlug, removeBySlug, rescoutBySlug } from "@/lib/scout";
import { clearSession, getSessionAthleteId } from "@/lib/session";

/**
 * Short shared-cache window for public cards. Redis does the real caching; this
 * just absorbs embed bursts. Kept short so switching a card to link-only or
 * private takes effect on CDNs within minutes.
 */
export const PUBLIC_CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

/**
 * GET    /api/scout/:username            → card JSON
 * GET    /api/scout/:username?format=png → card PNG (see also ./card and /:username.png)
 * POST   /api/scout/:username            → owner re-scout (cooldown-limited)
 * DELETE /api/scout/:username            → owner removes card + revokes Strava access
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/scout/[username]">) {
  const { username } = await ctx.params;
  try {
    const { viewer, ...envelope } = await getCardBySlug(username, await getSessionAthleteId());
    const headers = { "Cache-Control": cacheControlFor(viewer, PUBLIC_CACHE) };
    if (req.nextUrl.searchParams.get("format") === "png") {
      return await renderCardPng(envelope.card, { headers: { ...headers, "X-Card-Stale": String(envelope.stale) } });
    }
    return Response.json(redactForViewer(envelope, viewer), { headers });
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
