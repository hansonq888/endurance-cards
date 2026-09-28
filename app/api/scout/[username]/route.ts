import type { NextRequest } from "next/server";
import { errorResponse } from "@/lib/errors";
import { cacheControlFor, parsePreview, redactForViewer } from "@/lib/access";
import { getCardBySlug, removeBySlug, rescoutBySlug } from "@/lib/scout";
import { clearSession, getSessionAthleteId } from "@/lib/session";

/**
 * GET    /api/scout/:username            → card JSON
 * POST   /api/scout/:username            → owner re-scout (cooldown-limited)
 * DELETE /api/scout/:username            → owner removes card + revokes Strava access
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/scout/[username]">) {
  const { username } = await ctx.params;
  try {
    const { viewer, ...envelope } = await getCardBySlug(username, await getSessionAthleteId(), {
      preview: parsePreview(req.nextUrl.searchParams.get("view")),
    });
    return Response.json(redactForViewer(envelope, viewer), { headers: { "Cache-Control": cacheControlFor(viewer) } });
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
