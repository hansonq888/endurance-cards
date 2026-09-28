import "server-only";
import { resolveViewer } from "./access";
import { activitiesFor, visibleTo, type Audience, type VisitorAudience } from "./audience";
import { dailySeries, routesByDay } from "./engine";
import { AppError, NotFoundError, StravaAuthError } from "./errors";
import {
  acquireCalendarLock,
  getCachedCard,
  getRoutes,
  getTokens,
  getYearCalendar,
  releaseCalendarLock,
  saveRoutes,
  saveYearCalendar,
} from "./redis";
import { assertBudget, ensureFreshTokens, fetchActivitiesBetween, MAX_YEAR_PAGES } from "./strava";
import type { PlayerCard, RouteShape, YearCalendar } from "@/types/player";
import type { StravaSummaryActivity } from "@/types/strava";

/** How far back the year picker goes, at most. */
const MAX_YEARS_BACK = 10;

/**
 * Past calendar years the athlete can browse, newest first. The current year
 * isn't listed: it's covered by the rolling "last 12 months" view.
 */
export function calendarYears(card: Pick<PlayerCard, "memberSince" | "inputs">, now = new Date()): number[] {
  const current = now.getUTCFullYear();
  const joined = card.memberSince ? new Date(card.memberSince).getUTCFullYear() : current - Math.ceil(card.inputs.tenureYears);
  const first = Math.max(joined, current - MAX_YEARS_BACK);
  const years: number[] = [];
  for (let y = current - 1; y >= first; y--) years.push(y);
  return years;
}

export class CalendarBusyError extends AppError {
  constructor() {
    super("That year is already loading — try again in a moment", 409, "calendar_busy");
  }
}

/**
 * One past year of training. Served from cache when we have it; otherwise
 * fetched from Strava once (1–10 API calls) and cached permanently, since a
 * finished year never changes.
 */
export async function getCalendarYear(
  slug: string,
  year: number,
  sessionAthleteId: number | null,
  opts: { preview?: VisitorAudience } = {},
): Promise<YearCalendar> {
  const viewer = await resolveViewer(slug, sessionAthleteId, opts);
  if (!viewer.isOwner && !viewer.settings.showCalendar) throw new NotFoundError("This athlete keeps their calendar private");
  const { athleteId } = viewer;
  const card = await getCachedCard(athleteId);
  if (!card || !calendarYears(card).includes(year)) throw new NotFoundError(`No ${year} calendar for this athlete`);

  const cached = await getYearCalendar(athleteId, year);
  // Years cached before audiences existed have only the owner's series: rebuild rather than show it to visitors.
  if (cached && (viewer.audience === "owner" || cached.audiences)) return forAudience(cached, viewer.audience);

  if (!(await acquireCalendarLock(athleteId, year))) throw new CalendarBusyError();
  try {
    const stored = await getTokens(athleteId);
    if (!stored) throw new StravaAuthError();
    // Worst case; most years need one or two pages.
    await assertBudget(MAX_YEAR_PAGES);
    const tokens = await ensureFreshTokens(stored);
    const after = Date.UTC(year, 0, 1) / 1000 - 14 * 3600; // local dates can sit up to 14h either side of UTC
    const before = Date.UTC(year + 1, 0, 1) / 1000 + 14 * 3600;
    const activities = await fetchActivitiesBetween(tokens.accessToken, after, before);
    const cal = yearCalendar(activities, year, new Date());
    await saveYearCalendar(athleteId, cal);
    await saveRoutes(athleteId, year, routesByDay(activities));
    return forAudience(cal, viewer.audience);
  } catch (err) {
    // Only the owner can fix a lost Strava connection; to visitors the year just isn't available.
    if (err instanceof StravaAuthError && !viewer.isOwner) throw new NotFoundError(`No ${year} calendar for this athlete`);
    throw err;
  } finally {
    await releaseCalendarLock(athleteId, year);
  }
}

/**
 * Route shapes for one local date. Looks in the rolling window first, then in
 * that year's bucket (present once the year has been opened in the calendar).
 */
export async function getRoutesForDay(
  slug: string,
  date: string,
  sessionAthleteId: number | null,
  opts: { preview?: VisitorAudience } = {},
): Promise<RouteShape[]> {
  const viewer = await resolveViewer(slug, sessionAthleteId, opts);
  if (!viewer.isOwner && !(viewer.settings.showCalendar && viewer.settings.showRoutes)) {
    throw new NotFoundError("This athlete keeps their routes private");
  }
  const { athleteId } = viewer;
  const recent = await getRoutes(athleteId, "recent");
  const routes = recent?.[date] ?? (await getRoutes(athleteId, Number(date.slice(0, 4))))?.[date] ?? [];
  // Only routes of activities this audience could see on Strava (untagged = Only You).
  return routes.filter((r) => visibleTo(r.level, viewer.audience));
}

/** A finished year's daily series for the owner, plus one per visitor audience. */
export function yearCalendar(activities: StravaSummaryActivity[], year: number, fetchedAt: Date): YearCalendar {
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000;
  const endDate = `${year}-12-31`;
  const series = (audience: Audience) => dailySeries(activitiesFor(activities, audience), endDate, days);
  return {
    year,
    endDate,
    ...series("owner"),
    audiences: { link: series("link"), public: series("public") },
    fetchedAt: fetchedAt.toISOString(),
  };
}

/** The year as one audience sees it; other audiences' series are never sent. */
function forAudience(cal: YearCalendar, audience: Audience): YearCalendar {
  const { audiences, ...rest } = cal;
  if (audience === "owner") return rest;
  return { ...rest, ...audiences![audience] };
}
