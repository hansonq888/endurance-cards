import type { NextRequest } from "next/server";
import { imageCacheControl } from "@/lib/access";
import { errorResponse } from "@/lib/errors";
import { getCardBySlug } from "@/lib/scout";
import { getSessionAthleteId } from "@/lib/session";
import { cardImage } from "@/lib/share-images";

/** GET /api/scout/:username/card → card PNG. Also served at /:username.png via a rewrite. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/scout/[username]/card">) {
  const { username } = await ctx.params;
  try {
    const { card, stale, viewer } = await getCardBySlug(username, await getSessionAthleteId());
    const { bytes, contentType } = await cardImage(card);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": imageCacheControl(viewer, req.nextUrl.searchParams.has("v")),
        "X-Card-Stale": String(stale),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
