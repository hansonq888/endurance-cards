import type { NextRequest } from "next/server";
import { resolveViewer } from "@/lib/access";
import { getCachedCard } from "@/lib/redis";
import { getSessionAthleteId } from "@/lib/session";

/**
 * GET /api/find?q=… → { path } for a card the caller is allowed to see, else 404.
 *
 * Accepts a username ("hanson", "@hanson"), a Kudex link, or a Strava profile
 * URL (strava.com/athletes/123). Redis-only: never calls Strava. Goes through
 * the same visibility gate as every other doorway, and answers "not found" the
 * same way for missing, link-only and private cards, so search can't reveal
 * that a hidden card exists.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const headers = { "Cache-Control": "private, no-store" };
  const notFound = () => Response.json({ message: "No public card found for that username." }, { status: 404, headers });
  if (!q || q.length > 200) return notFound();

  const stravaId = q.match(/strava\.com\/athletes\/(\d+)/i)?.[1];
  // Last path segment of any other URL, minus a leading "@" or a ".png" suffix.
  const raw = stravaId ?? q.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() ?? "";
  const term = raw.replace(/^@/, "").replace(/\.png$/i, "").toLowerCase();
  if (!/^[a-z0-9_-]{1,64}$/.test(term)) return notFound();

  // A bare number is an athlete id: find its current slug (a username, if it has one).
  const slug = /^\d+$/.test(term) ? ((await getCachedCard(Number(term)))?.slug ?? term) : term;
  try {
    await resolveViewer(slug, await getSessionAthleteId());
    return Response.json({ path: `/${slug}` }, { headers });
  } catch {
    return notFound();
  }
}
