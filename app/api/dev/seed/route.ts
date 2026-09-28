import { calendarYears, yearCalendar } from "@/lib/calendar";
import { buildAudienceCards, routesByDay } from "@/lib/engine";
import { PROFILES, syntheticAthlete } from "@/lib/fixtures";
import { defaultSettings } from "@/lib/access";
import { saveCardViews, saveRoutes, saveSettings, saveYearCalendar } from "@/lib/redis";

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
      const built = buildAudienceCards(raw, {}, now);
      // Fake a few monthly scouts so the rating-history UI has something to show.
      const withFakeHistory = <T extends { overall: number; history: { date: string; overall: number }[] }>(c: T): T => ({
        ...c,
        history: [
          ...[5, 4, 3, 2, 1].map((monthsAgo, k) => ({
            date: new Date(now.getTime() - monthsAgo * 30 * 86_400_000).toISOString().slice(0, 10),
            overall: Math.max(1, c.overall - [6, 5, 3, 3, 1][k]),
          })),
          ...c.history,
        ],
      });
      const cards = { owner: withFakeHistory(built.owner), link: withFakeHistory(built.link), public: withFakeHistory(built.public) };
      const card = cards.owner;
      await saveCardViews(cards);
      // Demo athletes are public so the pages work without signing in.
      await saveSettings(card.athleteId, { ...defaultSettings(), visibility: "public" });
      await saveRoutes(card.athleteId, "recent", routesByDay(raw.activities));
      // Fake past calendar years too (real athletes fetch these from Strava on demand).
      for (const year of calendarYears(card, now)) {
        const yearEnd = new Date(Date.UTC(year, 11, 31, 12));
        const past = syntheticAthlete({ ...profile, seed: profile.seed * 1000 + year }, yearEnd);
        await saveYearCalendar(card.athleteId, yearCalendar(past.activities, year, now));
        await saveRoutes(card.athleteId, year, routesByDay(past.activities));
      }
      return card.slug;
    }),
  );
  return Response.json({ seeded: slugs.map((s) => `/${s}`) });
}
