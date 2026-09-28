import type { NextRequest } from "next/server";
import { getCalendarYear } from "@/lib/calendar";
import { errorResponse } from "@/lib/errors";
import { getSessionAthleteId } from "@/lib/session";

/** GET /api/scout/:username/calendar?year=2024 → one past year of daily training. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/scout/[username]/calendar">) {
  const { username } = await ctx.params;
  const year = Number(req.nextUrl.searchParams.get("year"));
  if (!Number.isInteger(year)) return Response.json({ error: "bad_request", message: "year is required" }, { status: 400 });
  try {
    const cal = await getCalendarYear(username, year, await getSessionAthleteId());
    // Finished years never change, so let browsers and CDNs keep them.
    return Response.json(cal, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (err) {
    return errorResponse(err);
  }
}
