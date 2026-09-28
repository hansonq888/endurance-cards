import type { NextRequest } from "next/server";
import { renderCardPng } from "@/lib/card-renderer";
import { errorResponse } from "@/lib/errors";
import { cacheControlFor } from "@/lib/access";
import { getCardBySlug } from "@/lib/scout";
import { getSessionAthleteId } from "@/lib/session";
import { PUBLIC_CACHE } from "../route";

/** GET /api/scout/:username/card → card PNG. Also served at /:username.png via a rewrite. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/scout/[username]/card">) {
  const { username } = await ctx.params;
  try {
    const { card, stale, viewer } = await getCardBySlug(username, await getSessionAthleteId());
    return await renderCardPng(card, { headers: { "Cache-Control": cacheControlFor(viewer, PUBLIC_CACHE), "X-Card-Stale": String(stale) } });
  } catch (err) {
    return errorResponse(err);
  }
}
