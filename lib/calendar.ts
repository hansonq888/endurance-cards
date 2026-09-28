import "server-only";
import { dailySeries, routesByDay } from "./engine";
import { AppError, NotFoundError, StravaAuthError } from "./errors";
import {
  acquireCalendarLock,
  getCachedCard,
  getRoutes,
  getTokens,
  getYearCalendar,
  releaseCalendarLock,
  resolveSlug,
  saveRoutes,
  saveYearCalendar,
} from "./redis";
import { assertBudget, ensureFreshTokens, fetchActivitiesBetween, MAX_YEAR_PAGES } from "./strava";
import type { PlayerCard, RouteShape, YearCalendar } from "@/types/player";

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
export async function getCalendarYear(slug: string, year: number): Promise<YearCalendar> {
  const athleteId = await resolveSlug(slug);
  if (athleteId === null) throw new NotFoundError(`No scouted player named "${slug}"`);
  const card = await getCachedCard(athleteId);
  if (!card || !calendarYears(card).includes(year)) throw new NotFoundError(`No ${year} calendar for this athlete`);

  const cached = await getYearCalendar(athleteId, year);
  if (cached) return cached;

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
    const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000;
    const endDate = `${year}-12-31`;
    const cal: YearCalendar = { year, endDate, ...dailySeries(activities, endDate, days), fetchedAt: new Date().toISOString() };
    await saveYearCalendar(athleteId, cal);
    await saveRoutes(athleteId, year, routesByDay(activities));
    return cal;
  } finally {
    await releaseCalendarLock(athleteId, year);
  }
}

/**
 * Route shapes for one local date. Looks in the rolling window first, then in
 * that year's bucket (present once the year has been opened in the calendar).
 */
export async function getRoutesForDay(slug: string, date: string): Promise<RouteShape[]> {
  const athleteId = await resolveSlug(slug);
  if (athleteId === null) throw new NotFoundError(`No scouted player named "${slug}"`);
  const recent = await getRoutes(athleteId, "recent");
  if (recent?.[date]) return recent[date];
  const year = await getRoutes(athleteId, Number(date.slice(0, 4)));
  return year?.[date] ?? [];
}
