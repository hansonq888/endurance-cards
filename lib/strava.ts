import "server-only";
import { env } from "./env";
import { RateLimitError, StravaApiError, StravaAuthError } from "./errors";
import { getRateBudget, recordRateBudget, saveTokens, type RateBudget } from "./redis";
import type {
  StoredTokens,
  StravaAthlete,
  StravaAthleteStats,
  StravaSummaryActivity,
  StravaTokenResponse,
} from "@/types/strava";

const API_BASE = "https://www.strava.com/api/v3";
const OAUTH_BASE = "https://www.strava.com/oauth";
export const STRAVA_SCOPES = "read,activity:read_all";
const REQUEST_TIMEOUT_MS = 10_000;
/** Requests we keep in reserve per 15-min window so OAuth callbacks never get starved. */
const SHORT_WINDOW_RESERVE = 10;
const DAILY_RESERVE = 50;
/** Refresh access tokens this long before they actually expire. */
const TOKEN_REFRESH_SKEW_SECONDS = 5 * 60;

// ---------- OAuth ----------

export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.stravaClientId,
    response_type: "code",
    redirect_uri: redirectUri,
    approval_prompt: "auto",
    scope: STRAVA_SCOPES,
    state,
  });
  return `${OAUTH_BASE}/authorize?${params}`;
}

async function tokenRequest(body: Record<string, string>): Promise<StravaTokenResponse> {
  const res = await fetch(`${OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.stravaClientId,
      client_secret: env.stravaClientSecret,
      ...body,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (res.status === 400 || res.status === 401) throw new StravaAuthError();
  if (res.status === 429) throw new RateLimitError("Strava rate limit reached", secondsUntilNextWindow());
  if (!res.ok) throw new StravaApiError(`Strava token endpoint returned ${res.status}`, res.status);
  return (await res.json()) as StravaTokenResponse;
}

export async function exchangeCode(code: string): Promise<StravaTokenResponse & { athlete: StravaAthlete }> {
  const data = await tokenRequest({ code, grant_type: "authorization_code" });
  if (!data.athlete) throw new StravaApiError("Strava token response missing athlete", 502);
  return data as StravaTokenResponse & { athlete: StravaAthlete };
}

/** Returns tokens guaranteed valid for at least a few minutes, refreshing + persisting if needed. */
export async function ensureFreshTokens(tokens: StoredTokens): Promise<StoredTokens> {
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expiresAt - TOKEN_REFRESH_SKEW_SECONDS > now) return tokens;
  const data = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refreshToken });
  const next: StoredTokens = {
    ...tokens,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  };
  await saveTokens(next);
  return next;
}

export async function deauthorize(accessToken: string): Promise<void> {
  // Best effort: the user is leaving either way.
  await fetch(`${OAUTH_BASE}/deauthorize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => undefined);
}

// ---------- Rate-limit budget ----------

/** Strava's short window resets on the natural quarter hour (:00, :15, :30, :45). */
function secondsUntilNextWindow(now = new Date()): number {
  const msIntoWindow = (now.getUTCMinutes() % 15) * 60_000 + now.getUTCSeconds() * 1000 + now.getUTCMilliseconds();
  return Math.max(1, Math.ceil((15 * 60_000 - msIntoWindow) / 1000));
}

function secondsUntilUtcMidnight(now = new Date()): number {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.ceil((midnight - now.getTime()) / 1000);
}

function sameShortWindow(a: number, b: number): boolean {
  return Math.floor(a / 900_000) === Math.floor(b / 900_000);
}

function sameUtcDay(a: number, b: number): boolean {
  return Math.floor(a / 86_400_000) === Math.floor(b / 86_400_000);
}

/**
 * Throws before we spend requests we don't have. `cost` is the number of API
 * calls the caller is about to make.
 */
export async function assertBudget(cost: number): Promise<void> {
  const budget = await getRateBudget();
  if (!budget) return;
  const now = Date.now();
  if (sameUtcDay(budget.at, now) && budget.dailyUsage + cost > budget.dailyLimit - DAILY_RESERVE) {
    throw new RateLimitError("Daily Strava API budget exhausted — try again tomorrow", secondsUntilUtcMidnight());
  }
  if (sameShortWindow(budget.at, now) && budget.shortUsage + cost > budget.shortLimit - SHORT_WINDOW_RESERVE) {
    throw new RateLimitError("Scouting is busy — try again in a few minutes", secondsUntilNextWindow());
  }
}

function parsePair(header: string | null): [number, number] | null {
  if (!header) return null;
  const [a, b] = header.split(",").map((n) => Number(n.trim()));
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
}

async function trackRateHeaders(res: Response): Promise<void> {
  // Strava reports overall and (newer) read-specific limits; the read ones are tighter for our GETs.
  const limit = parsePair(res.headers.get("x-readratelimit-limit")) ?? parsePair(res.headers.get("x-ratelimit-limit"));
  const usage = parsePair(res.headers.get("x-readratelimit-usage")) ?? parsePair(res.headers.get("x-ratelimit-usage"));
  if (!limit || !usage) return;
  const budget: RateBudget = {
    shortLimit: limit[0],
    dailyLimit: limit[1],
    shortUsage: usage[0],
    dailyUsage: usage[1],
    at: Date.now(),
  };
  await recordRateBudget(budget).catch((err) => console.warn("[kudex] failed to record rate budget", err));
}

// ---------- API client ----------

async function apiGet<T>(path: string, accessToken: string, attempt = 0): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    if (attempt < 1) return apiGet<T>(path, accessToken, attempt + 1);
    throw new StravaApiError(`Strava request failed: ${(err as Error).message}`, 0);
  }

  await trackRateHeaders(res);

  if (res.ok) return (await res.json()) as T;
  if (res.status === 401) throw new StravaAuthError();
  if (res.status === 429) {
    const usage = parsePair(res.headers.get("x-ratelimit-usage"));
    const limit = parsePair(res.headers.get("x-ratelimit-limit"));
    const daily = usage && limit && usage[1] >= limit[1];
    throw new RateLimitError(
      "Strava rate limit reached",
      daily ? secondsUntilUtcMidnight() : secondsUntilNextWindow(),
    );
  }
  if (res.status >= 500 && attempt < 1) {
    await new Promise((r) => setTimeout(r, 400));
    return apiGet<T>(path, accessToken, attempt + 1);
  }
  throw new StravaApiError(`Strava ${path} returned ${res.status}`, res.status);
}

export function fetchAthlete(accessToken: string): Promise<StravaAthlete> {
  return apiGet<StravaAthlete>("/athlete", accessToken);
}

export function fetchAthleteStats(accessToken: string, athleteId: number): Promise<StravaAthleteStats> {
  return apiGet<StravaAthleteStats>(`/athletes/${athleteId}/stats`, accessToken);
}

export const ACTIVITY_PAGE_SIZE = 200;
export const MAX_ACTIVITY_PAGES = 3;

/**
 * Fetches activities newer than `sinceEpochSeconds`, newest first, up to
 * MAX_ACTIVITY_PAGES. Paging newest-first (rather than with `after`, which
 * pages oldest-first) means very high-volume athletes get truncated on their
 * *oldest* history, keeping recent consistency data intact.
 */
export async function fetchActivities(
  accessToken: string,
  sinceEpochSeconds: number,
): Promise<{ activities: StravaSummaryActivity[]; truncated: boolean }> {
  const sinceMs = sinceEpochSeconds * 1000;
  const all: StravaSummaryActivity[] = [];
  for (let page = 1; page <= MAX_ACTIVITY_PAGES; page++) {
    const batch = await apiGet<StravaSummaryActivity[]>(
      `/athlete/activities?per_page=${ACTIVITY_PAGE_SIZE}&page=${page}`,
      accessToken,
    );
    all.push(...batch.filter((a) => Date.parse(a.start_date) >= sinceMs));
    const oldest = batch.at(-1);
    if (batch.length < ACTIVITY_PAGE_SIZE || !oldest || Date.parse(oldest.start_date) < sinceMs) {
      return { activities: all, truncated: false };
    }
  }
  return { activities: all, truncated: true };
}

/** Page cap for a single calendar-year fetch (2,000 activities is ~5 a day). */
export const MAX_YEAR_PAGES = 10;

/**
 * Fetches every activity between two instants (epoch seconds). With `after`,
 * Strava pages oldest-first, so we stop at the first short page.
 */
export async function fetchActivitiesBetween(
  accessToken: string,
  afterEpochSeconds: number,
  beforeEpochSeconds: number,
): Promise<StravaSummaryActivity[]> {
  const all: StravaSummaryActivity[] = [];
  for (let page = 1; page <= MAX_YEAR_PAGES; page++) {
    const batch = await apiGet<StravaSummaryActivity[]>(
      `/athlete/activities?after=${afterEpochSeconds}&before=${beforeEpochSeconds}&per_page=${ACTIVITY_PAGE_SIZE}&page=${page}`,
      accessToken,
    );
    all.push(...batch);
    if (batch.length < ACTIVITY_PAGE_SIZE) break;
  }
  return all;
}

/** Worst-case number of API calls one full scout makes. */
export const SCOUT_REQUEST_COST = 2 + MAX_ACTIVITY_PAGES;
