import type { NextRequest } from "next/server";
import { ensureSettings, newShareToken, requireOwner } from "@/lib/access";
import { errorResponse } from "@/lib/errors";
import { saveSettings } from "@/lib/redis";
import { getSessionAthleteId } from "@/lib/session";
import type { CardSettings, Visibility } from "@/types/player";

const VISIBILITIES: Visibility[] = ["public", "unlisted", "private"];

/**
 * PATCH /api/scout/:username/settings  (owner only)
 * Body: { visibility?, showCalendar?, showRoutes?, resetLink? }
 */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/scout/[username]/settings">) {
  const { username } = await ctx.params;
  try {
    const athleteId = await requireOwner(username, await getSessionAthleteId());
    const parsed: unknown = await req.json().catch(() => null);
    const body = (parsed && typeof parsed === "object" ? parsed : {}) as Partial<CardSettings> & { resetLink?: boolean };
    const current = await ensureSettings(athleteId);
    const next: CardSettings = {
      visibility: VISIBILITIES.includes(body.visibility as Visibility) ? (body.visibility as Visibility) : current.visibility,
      showCalendar: typeof body.showCalendar === "boolean" ? body.showCalendar : current.showCalendar,
      showRoutes: typeof body.showRoutes === "boolean" ? body.showRoutes : current.showRoutes,
      // Resetting the link invalidates every copy of the old one.
      shareToken: body.resetLink ? newShareToken() : current.shareToken,
    };
    // Once they pick a visibility themselves, it's theirs: stop describing it as "set from Strava".
    if (current.autoVisibility && body.visibility === undefined) next.autoVisibility = true;
    await saveSettings(athleteId, next, current.shareToken);
    return Response.json(next, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
