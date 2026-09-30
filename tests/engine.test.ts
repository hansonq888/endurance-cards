import { describe, expect, it } from "vitest";
import { OVR_WEIGHTS, buildCard, displayNameFor, routesByDay, withHistory, RATING_HISTORY_MAX, extractInputs, logScale, ratioScale, rateInputs, rerateCard, slugFor, tierFor } from "@/lib/engine";
import { PROFILES, syntheticAthlete } from "@/lib/fixtures";
import { decodePolyline, encodePolyline, routeShape } from "@/lib/polyline";
import { levelFor, TROPHIES, trophyProgress } from "@/lib/trophies";
import { canView } from "@/lib/visibility";
import { ATTRIBUTE_KEYS, type ScoutInputs } from "@/types/player";

const NOW = new Date("2026-09-27T12:00:00Z");
type Profile = keyof typeof PROFILES;
const card = (p: Profile) => buildCard(syntheticAthlete(PROFILES[p], NOW), NOW);

describe("scaling primitives", () => {
  it("clamps to 1..99", () => {
    expect(logScale(0, 10, 100)).toBe(1);
    expect(logScale(-5, 10, 100)).toBe(1);
    expect(logScale(1e9, 10, 100)).toBe(99);
    expect(ratioScale(0, 1, 5)).toBe(1);
    expect(ratioScale(50, 1, 5)).toBe(99);
  });

  it("is monotonic and compresses outliers", () => {
    const a = logScale(100, 10, 600);
    const b = logScale(200, 10, 600);
    const c = logScale(300, 10, 600);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    // The same extra 100 hours is worth less at the top than at the bottom.
    expect(c - b).toBeLessThan(b - a);
  });
});

describe("rating engine", () => {
  it("produces every attribute in range", () => {
    for (const p of Object.keys(PROFILES) as Profile[]) {
      const c = card(p);
      for (const key of ATTRIBUTE_KEYS) {
        expect(c.attributes[key].value).toBeGreaterThanOrEqual(1);
        expect(c.attributes[key].value).toBeLessThanOrEqual(99);
      }
      expect(c.overall).toBeGreaterThanOrEqual(1);
      expect(c.overall).toBeLessThanOrEqual(99);
    }
  });

  it("orders athletes sensibly", () => {
    const casual = card("casualJogger");
    const runner = card("dedicatedRunner");
    const elite = card("eliteMountainRunner");
    expect(runner.overall).toBeGreaterThan(casual.overall);
    expect(elite.overall).toBeGreaterThan(runner.overall);
    expect(casual.tier).toBe("bronze");
    expect(runner.attributes.PRS.measured).not.toBe(false);
  });

  it("rewards multi-sport athletes on VAR", () => {
    const tri = card("triathlete");
    const runner = card("dedicatedRunner");
    expect(tri.attributes.VAR.value).toBeGreaterThanOrEqual(70);
    expect(tri.attributes.VAR.value).toBeGreaterThan(runner.attributes.VAR.value + 25);
    expect(tri.position).toBe("TRI");
    expect(tri.trophies.map((t) => t.id)).toContain("triathlete");
  });

  it("rates swimmers against swimmers, and doesn't hold missing PRs against them", () => {
    const swimmer = card("poolSwimmer");
    expect(swimmer.position).toBe("SWM");
    // ~1:20/100m upper quartile is quick for a swimmer.
    expect(swimmer.attributes.PAC.value).toBeGreaterThanOrEqual(70);
    // Strava doesn't award swim PRs: not measured, so it sits out of the overall.
    expect(swimmer.attributes.PRS.measured).toBe(false);
    expect(swimmer.highlight.label).toBe("SWUM / YR");
  });

  it("gives gym-goers hours as their highlight, and only counts PRs from their runs", () => {
    const gym = card("gymGoer");
    expect(gym.position).toBe("GYM");
    const runPrs = gym.inputs.sports.find((s) => s.family === "run")?.prs ?? 0;
    expect(gym.attributes.PRS.detail).toContain(`${runPrs} PRs`);
    expect(gym.attributes.PRS.value).toBeLessThan(90);
    expect(gym.highlight).toMatchObject({ label: "TRAINED / YR", climb: false });
  });

  it("picks a sport-specific highlight", () => {
    expect(card("dedicatedRunner").highlight.label).toBe("RUN / YR");
    expect(card("eliteMountainRunner").highlight.label).toBe("RUN / YR");
  });

  it("caps 90+ behind the legacy gate", () => {
    const inputs = extractInputs(syntheticAthlete(PROFILES.eliteMountainRunner, NOW), NOW);
    const maxed: ScoutInputs = {
      ...inputs,
      windowHours: 900,
      activeDaysLast30: 30,
      activeWeeksLast12: 12,
      lifetimeHours: 9000,
      tenureYears: 12,
      sports: inputs.sports.map((s) => ({ ...s, paceMps: s.paceMps ? 6 : null, longestKm: 500, longestHours: 20, prs: s.hours * 5 })),
    };
    expect(rateInputs(maxed).overall).toBeGreaterThanOrEqual(90);
    // Maxed everywhere but only 8/12 recent weeks active: still 90+ raw, but fails the gate.
    const gated = rateInputs({ ...maxed, activeWeeksLast12: 8 });
    expect(gated.overall).toBe(89);
    expect(gated.legacyCapped).toBe(true);
  });

  it("handles an athlete with no activities", () => {
    const raw = syntheticAthlete({ ...PROFILES.casualJogger, sessions: [] }, NOW);
    const c = buildCard(raw, NOW);
    expect(c.inputs.activityCount).toBe(0);
    expect(c.attributes.VAR.value).toBe(1);
    expect(c.attributes.PAC.measured).toBe(false);
    expect(c.attributes.PRS.measured).toBe(false);
    expect(c.tier).toBe("bronze");
  });

  it("leaves unmeasured stats out of the overall", () => {
    const swimmer = card("poolSwimmer");
    expect(swimmer.attributes.PRS.measured).toBe(false);
    const measured = ATTRIBUTE_KEYS.filter((k) => swimmer.attributes[k].measured !== false);
    const total = measured.reduce((s, k) => s + OVR_WEIGHTS[k], 0);
    expect(swimmer.overall).toBe(Math.round(measured.reduce((s, k) => s + swimmer.attributes[k].value * OVR_WEIGHTS[k], 0) / total));
    expect(swimmer.archetype).not.toBe("Record Breaker");
  });

  it("rates PRs per hour of runs, rides and hikes, with small samples pulled to the middle", () => {
    const inputs = extractInputs(syntheticAthlete(PROFILES.dedicatedRunner, NOW), NOW);
    const withRuns = (prs: number, hours: number): ScoutInputs => ({
      ...inputs,
      sports: inputs.sports.map((s) => (s.family === "run" ? { ...s, prs, hours } : s)),
    });
    const prs = (i: ScoutInputs) => rateInputs(i).attributes.PRS;
    // Same rate at double the volume: no reward for volume alone.
    expect(prs(withRuns(100, 400)).value).toBe(prs(withRuns(200, 800)).value);
    expect(prs(withRuns(300, 400)).value).toBeGreaterThan(prs(withRuns(100, 400)).value);
    // 12 PRs in 12 h is a hot streak, but too little to be sure: pulled well below the long-run equivalent.
    expect(prs(withRuns(12, 12)).value).toBeLessThan(prs(withRuns(400, 400)).value);
    // Under 10 h of PR sports there's nothing to judge.
    expect(prs({ ...inputs, sports: [{ ...inputs.sports.find((s) => s.family === "run")!, hours: 8, prs: 5 }] }).measured).toBe(false);
  });

  it("ignores PRs from sports Strava doesn't award them in", () => {
    const inputs = extractInputs(syntheticAthlete(PROFILES.gymGoer, NOW), NOW);
    const base = rateInputs(inputs).attributes.PRS.value;
    const noisyGym = { ...inputs, sports: inputs.sports.map((s) => (s.family === "gym" ? { ...s, prs: 500 } : s)) };
    expect(rateInputs(noisyGym).attributes.PRS.value).toBe(base);
  });

  it("annualises volume when the fetch was truncated", () => {
    const raw = syntheticAthlete(PROFILES.dedicatedRunner, NOW);
    const cutoff = NOW.getTime() - 120 * 86_400_000;
    const partial = { ...raw, truncated: true, activities: raw.activities.filter((a) => Date.parse(a.start_date) >= cutoff) };
    const full = extractInputs(raw, NOW);
    const truncated = extractInputs(partial, NOW);
    expect(truncated.windowDays).toBeLessThan(130);
    expect(truncated.windowHours / full.windowHours).toBeGreaterThan(0.75);
    expect(truncated.windowHours / full.windowHours).toBeLessThan(1.3);
  });

  it("records daily minutes for the heatmap", () => {
    const i = extractInputs(syntheticAthlete(PROFILES.dedicatedRunner, NOW), NOW);
    expect(i.daily.minutes).toHaveLength(365);
    expect(i.daily.endDate).toBe("2026-09-27");
    const total = i.daily.minutes.reduce((a, b) => a + b, 0) / 60;
    // Everything in the window lands on some day (activities dated "today" included).
    expect(Math.abs(total - i.windowHours)).toBeLessThan(i.windowHours * 0.02);
  });

  it("tracks PRs and races", () => {
    const i = extractInputs(syntheticAthlete(PROFILES.dedicatedRunner, NOW), NOW);
    expect(i.prCount).toBeGreaterThan(0);
    expect(i.daily.prs.reduce((a, b) => a + b, 0)).toBe(i.prCount);
    expect(i.races.length).toBeGreaterThan(0);
    expect(i.races.length).toBeLessThanOrEqual(12);
    // Most recent first.
    expect([...i.races].sort((a, b) => b.date.localeCompare(a.date))).toEqual(i.races);
  });

  it("keeps a rating history across scouts", () => {
    const first = card("triathlete");
    const later = { ...first, overall: first.overall + 2, history: [{ date: "2026-10-27", overall: first.overall + 2 }] };
    const merged = withHistory(later, first);
    expect(merged.history.map((h) => h.overall)).toEqual([first.overall, first.overall + 2]);
    // Same-day re-scout replaces rather than appends.
    expect(withHistory(later, merged).history).toHaveLength(2);
    // Capped.
    const long = { ...first, history: Array.from({ length: 40 }, (_, d) => ({ date: `2025-01-${String(d + 1).padStart(2, "0")}`, overall: 50 })) };
    expect(withHistory(later, long).history).toHaveLength(RATING_HISTORY_MAX);
  });

  it("round-trips encoded polylines", () => {
    const track: [number, number][] = [
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ];
    // Strava/Google's reference example.
    expect(encodePolyline(track)).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual(track);
  });

  it("reduces routes to location-free shapes with trimmed ends", () => {
    // A 5 km straight line heading east from a "home" point.
    const home: [number, number] = [40.015, -105.27];
    const track = Array.from({ length: 51 }, (_, i) => [home[0], home[1] + (i * 100) / (111_320 * Math.cos((home[0] * Math.PI) / 180))] as [number, number]);
    const shape = routeShape(track)!;
    expect(shape).toHaveLength(128);
    // Normalised into the unit box: no coordinate survives.
    expect(Math.max(...shape)).toBeLessThanOrEqual(1);
    expect(Math.min(...shape)).toBeGreaterThanOrEqual(0);
    // Too short once 400 m is trimmed from each end.
    expect(routeShape(track.slice(0, 10))).toBeNull();
  });

  it("keeps a location-free route per outdoor activity, keyed by day", () => {
    const raw = syntheticAthlete(PROFILES.triathlete, NOW);
    const byDay = routesByDay(raw.activities);
    const shapes = Object.values(byDay).flat();
    const withGps = raw.activities.filter((a) => a.map?.summary_polyline && !a.trainer && !a.manual).length;
    expect(shapes.length).toBeGreaterThan(0);
    expect(shapes.length).toBeLessThanOrEqual(withGps);
    expect(shapes.every((r) => r.family !== "swim")).toBe(true);
    for (const [date, list] of Object.entries(byDay)) expect(list.every((r) => r.date === date)).toBe(true);
  });

  it("levels trophies I–III and reports progress to the next target", () => {
    const everest = TROPHIES.find((t) => t.id === "everest-club")!;
    expect(levelFor(everest, 5000)).toBe(0);
    expect(levelFor(everest, 8849)).toBe(1);
    expect(levelFor(everest, 50_000)).toBe(2);
    expect(levelFor(everest, 100_000)).toBe(3);
    for (const p of trophyProgress(extractInputs(syntheticAthlete(PROFILES.dedicatedRunner, NOW), NOW))) {
      expect(p.fraction).toBeGreaterThanOrEqual(0);
      expect(p.fraction).toBeLessThanOrEqual(1);
      expect(p.next === null).toBe(p.level === 3);
    }
  });

  it("keeps level III rare", () => {
    const casual = card("casualJogger");
    expect(casual.trophies.every((t) => t.level < 3)).toBe(true);
    // Earned trophies are sorted best-first.
    const tri = card("triathlete");
    expect([...tri.trophies].sort((a, b) => b.level - a.level)).toEqual(tri.trophies);
  });

  it("re-rates current-schema cards and refuses older ones", () => {
    const c = card("triathlete");
    expect(rerateCard({ ...c, engineVersion: 0 })?.overall).toBe(c.overall);
    expect(rerateCard({ ...c, inputs: { ...c.inputs, schema: 5 as never } })).toBeNull();
  });

  it("applies card visibility", () => {
    const link = { visibility: "unlisted" as const };
    const priv = { visibility: "private" as const };
    // Link only: the secret link opens it; the username page doesn't.
    expect(canView(link, false, false)).toBe(false);
    expect(canView(link, false, true)).toBe(true);
    // Private: even the secret link doesn't.
    expect(canView(priv, false, true)).toBe(false);
    for (const s of [link, priv]) expect(canView(s, true, false)).toBe(true);
    // Development demo cards open at their username.
    expect(canView({ ...link, demo: true }, false, false)).toBe(true);
  });

  it("never lets a username shadow app routes or share links", () => {
    expect(slugFor({ id: 7, username: "guide" })).toBe("7");
    expect(slugFor({ id: 7, username: "Privacy" })).toBe("7");
    expect(slugFor({ id: 7, username: "link-abc" })).toBe("7");
    expect(slugFor({ id: 7, username: "hanson" })).toBe("hanson");
  });

  it("tiers, slugs and names", () => {
    expect(tierFor(95)).toBe("icon");
    expect(tierFor(75)).toBe("gold");
    expect(tierFor(60)).toBe("silver");
    expect(tierFor(10)).toBe("bronze");
    expect(slugFor({ id: 42, username: null })).toBe("42");
    expect(slugFor({ id: 42, username: "Kipchoge" })).toBe("kipchoge");
    expect(displayNameFor({ firstname: "Hanson", lastname: "Qin" })).toBe("HANSON Q.");
    expect(displayNameFor({ firstname: "Eliud", lastname: "K." })).toBe("ELIUD K.");
    expect(displayNameFor({ firstname: "Cher", lastname: "" })).toBe("CHER");
  });
});
