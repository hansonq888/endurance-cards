import type { NextRequest } from "next/server";
import { getRoutesForDay } from "@/lib/calendar";
import { errorResponse } from "@/lib/errors";

/** GET /api/scout/:username/routes?date=2026-05-04 → that day's route shapes (location-free). */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/scout/[username]/routes">) {
  const { username } = await ctx.params;
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "bad_request", message: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  try {
    const routes = await getRoutesForDay(username, date);
    return Response.json({ date, routes }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } });
  } catch (err) {
    return errorResponse(err);
  }
}
