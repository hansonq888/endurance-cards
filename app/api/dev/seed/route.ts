import { calendarYears, yearCalendar } from "@/lib/calendar";
import { buildSharedCard, routesByDay } from "@/lib/engine";
import { PROFILES, syntheticAthlete } from "@/lib/fixtures";
import { defaultSettings } from "@/lib/access";
import { saveCard, saveRoutes, saveSettings, saveYearCalendar } from "@/lib/redis";
import { sharedActivities } from "@/lib/sharing";

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
      const built = buildSharedCard(raw, null, now);
      // Fake a few monthly scouts so the rating-history UI has something to show.
      const card = {
        ...built,
        history: [
          ...[5, 4, 3, 2, 1].map((monthsAgo, k) => ({
            date: new Date(now.getTime() - monthsAgo * 30 * 86_400_000).toISOString().slice(0, 10),
            overall: Math.max(1, built.overall - [6, 5, 3, 3, 1][k]),
          })),
          ...built.history,
        ],
      };
      await saveCard(card);
      // Demo cards open at their username without signing in (development only).
      await saveSettings(card.athleteId, { ...defaultSettings(), demo: true });
      await saveRoutes(card.athleteId, "recent", routesByDay(sharedActivities(raw.activities)));
      // Fake past calendar years too (real athletes fetch these from Strava on demand).
      for (const year of calendarYears(card, now)) {
        const yearEnd = new Date(Date.UTC(year, 11, 31, 12));
        const past = syntheticAthlete({ ...profile, seed: profile.seed * 1000 + year }, yearEnd);
        await saveYearCalendar(card.athleteId, yearCalendar(sharedActivities(past.activities), year, now));
        await saveRoutes(card.athleteId, year, routesByDay(sharedActivities(past.activities)));
      }
      return card.slug;
    }),
  );
  return Response.json({ seeded: slugs.map((s) => `/${s}`) });
}
