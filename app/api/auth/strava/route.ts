import { NextResponse, type NextRequest } from "next/server";
import { randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { AppError, RateLimitError } from "@/lib/errors";
import { saveTokens } from "@/lib/redis";
import { scoutAthlete } from "@/lib/scout";
import { setSession } from "@/lib/session";
import { buildAuthorizeUrl, exchangeCode } from "@/lib/strava";

const STATE_COOKIE = "sfut_oauth_state";

function origin(req: NextRequest) {
  return env.appUrl ?? req.nextUrl.origin;
}

function home(req: NextRequest, error: string) {
  return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, origin(req)));
}

/**
 * Strava OAuth 2.0.
 *   GET /api/auth/strava              → redirect to Strava consent screen
 *   GET /api/auth/strava?code&state   → callback: exchange code, scout, redirect to card
 */
export async function GET(req: NextRequest) {
  try {
    return await handle(req);
  } catch (err) {
    console.error("[strava-fut] OAuth callback failed", err);
    if (err instanceof RateLimitError) return home(req, "rate_limited");
    return home(req, err instanceof AppError ? err.code : "internal");
  }
}

async function handle(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const redirectUri = `${origin(req)}/api/auth/strava`;

  if (params.get("error")) return home(req, "denied");

  const code = params.get("code");
  if (!code) {
    const state = randomToken();
    const res = NextResponse.redirect(buildAuthorizeUrl(redirectUri, state));
    res.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth/strava",
      maxAge: 600,
    });
    return res;
  }

  const expectedState = req.cookies.get(STATE_COOKIE)?.value;
  if (!expectedState || expectedState !== params.get("state")) return home(req, "state");

  // Users can untick scopes on Strava's consent screen; we need activity access.
  const granted = (params.get("scope") ?? "").split(",");
  if (!granted.some((s) => s === "activity:read" || s === "activity:read_all")) return home(req, "scope");

  const token = await exchangeCode(code);
  const athleteId = token.athlete.id;
  await saveTokens({
    athleteId,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_at,
    scope: granted.join(","),
  });
  await setSession(athleteId);
  const card = await scoutAthlete(athleteId);

  const res = NextResponse.redirect(new URL(`/${encodeURIComponent(card.slug)}`, origin(req)));
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth/strava" });
  return res;
}
