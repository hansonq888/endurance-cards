import "server-only";
import { resolveViewer } from "./access";
import { SHARED_MAX_LEVEL, sharedActivities } from "./sharing";
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
export async function getCalendarYear(slug: string, year: number, sessionAthleteId: number | null): Promise<YearCalendar> {
  const viewer = await resolveViewer(slug, sessionAthleteId);
  if (!viewer.isOwner && !viewer.settings.showCalendar) throw new NotFoundError("This athlete keeps their calendar private");
  const { athleteId } = viewer;
  const card = await getCachedCard(athleteId);
  if (!card || !calendarYears(card).includes(year)) throw new NotFoundError(`No ${year} calendar for this athlete`);

  const cached = await getYearCalendar(athleteId, year);
  // Years cached before the shared-only rule may include Only You activities: rebuild those.
  if (cached?.shared) return cached;

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
    const shared = sharedActivities(activities);
    const cal = yearCalendar(shared, year, new Date());
    await saveYearCalendar(athleteId, cal);
    await saveRoutes(athleteId, year, routesByDay(shared));
    return cal;
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
export async function getRoutesForDay(slug: string, date: string, sessionAthleteId: number | null): Promise<RouteShape[]> {
  const viewer = await resolveViewer(slug, sessionAthleteId);
  if (!viewer.isOwner && !(viewer.settings.showCalendar && viewer.settings.showRoutes)) {
    throw new NotFoundError("This athlete keeps their routes private");
  }
  const { athleteId } = viewer;
  const recent = await getRoutes(athleteId, "recent");
  const routes = recent?.[date] ?? (await getRoutes(athleteId, Number(date.slice(0, 4))))?.[date] ?? [];
  // Only You routes aren't stored any more; the filter also covers buckets saved before that
  // (untagged shapes count as Only You).
  return routes.filter((r) => (r.level ?? 2) <= SHARED_MAX_LEVEL);
}

/** A finished year's daily series, from the (already shared-only) activities given. */
export function yearCalendar(activities: StravaSummaryActivity[], year: number, fetchedAt: Date): YearCalendar {
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000;
  const endDate = `${year}-12-31`;
  return { year, endDate, ...dailySeries(activities, endDate, days), shared: true, fetchedAt: fetchedAt.toISOString() };
}
