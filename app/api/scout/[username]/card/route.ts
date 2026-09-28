import type { NextRequest } from "next/server";
import { renderCardPng } from "@/lib/card-renderer";
import { errorResponse } from "@/lib/errors";
import { getCardBySlug } from "@/lib/scout";
import { PUBLIC_CACHE } from "../route";

/** GET /api/scout/:username/card → card PNG. Also served at /:username.png via a rewrite. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/scout/[username]/card">) {
  const { username } = await ctx.params;
  try {
    const { card, stale } = await getCardBySlug(username);
    return await renderCardPng(card, { headers: { "Cache-Control": PUBLIC_CACHE, "X-Card-Stale": String(stale) } });
  } catch (err) {
    return errorResponse(err);
  }
}
