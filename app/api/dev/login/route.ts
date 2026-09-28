import { NextResponse, type NextRequest } from "next/server";
import { resolveSlug } from "@/lib/redis";
import { setSession } from "@/lib/session";

/**
 * Development only: signs this browser in as a seeded demo athlete so the
 * owner-only UI (re-scout, locked trophies, progress) can be tested.
 *   GET /api/dev/login?slug=demo-triathlete
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  const athleteId = await resolveSlug(slug);
  if (athleteId === null) return new Response(`Unknown slug "${slug}" — seed first at /api/dev/seed`, { status: 404 });
  await setSession(athleteId);
  return NextResponse.redirect(new URL(`/${slug}`, req.nextUrl.origin));
}
