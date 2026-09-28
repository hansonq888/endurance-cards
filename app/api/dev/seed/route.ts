import { calendarYears } from "@/lib/calendar";
import { buildCard, dailySeries, routesByDay } from "@/lib/engine";
import { PROFILES, syntheticAthlete } from "@/lib/fixtures";
import { saveCard, saveRoutes, saveYearCalendar } from "@/lib/redis";

/**
 * Development only: seeds the cache with synthetic athletes so the profile
 * page and PNG embeds can be exercised without Strava credentials.
 *   GET /api/dev/seed → /demo-casualjogger, /demo-triathlete, …
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const now = new Date();
  const slugs = await Promise.all(
    Object.entries(PROFILES).map(async ([name, profile]) => {
      const raw = syntheticAthlete(profile, now);
      raw.athlete.username = `demo-${name.toLowerCase()}`;
      raw.athlete.firstname = name.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
      raw.athlete.lastname = "";
      const built = buildCard(raw, now);
      // Fake a few monthly scouts so the rating-history UI has something to show.
      const history = [5, 4, 3, 2, 1].map((monthsAgo, k) => ({
        date: new Date(now.getTime() - monthsAgo * 30 * 86_400_000).toISOString().slice(0, 10),
        overall: Math.max(1, built.overall - [6, 5, 3, 3, 1][k]),
      }));
      const card = { ...built, history: [...history, ...built.history] };
      await saveCard(card);
      await saveRoutes(card.athleteId, "recent", routesByDay(raw.activities));
      // Fake past calendar years too (real athletes fetch these from Strava on demand).
      for (const year of calendarYears(card, now)) {
        const yearEnd = new Date(Date.UTC(year, 11, 31, 12));
        const past = syntheticAthlete({ ...profile, seed: profile.seed * 1000 + year }, yearEnd);
        const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000;
        const endDate = `${year}-12-31`;
        await saveYearCalendar(card.athleteId, { year, endDate, ...dailySeries(past.activities, endDate, days), fetchedAt: now.toISOString() });
        await saveRoutes(card.athleteId, year, routesByDay(past.activities));
      }
      return card.slug;
    }),
  );
  return Response.json({ seeded: slugs.map((s) => `/${s}`) });
}
