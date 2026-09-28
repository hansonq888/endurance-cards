import { describe, expect, it } from "vitest";
import {
  activitiesFor,
  activityLevel,
  defaultVisibilityFor,
  privacyMix,
  visibleShare,
  visibleTo,
  visitorAudience,
  type PrivacyMix,
} from "@/lib/audience";
import { buildAudienceCards, routesByDay } from "@/lib/engine";
import { PROFILES, syntheticAthlete } from "@/lib/fixtures";
import type { StravaSummaryActivity } from "@/types/strava";

const NOW = new Date("2026-09-27T12:00:00Z");
const act = (v: Partial<Pick<StravaSummaryActivity, "visibility" | "private">>, moving_time = 3600) => ({ ...v, moving_time });

describe("activity visibility levels", () => {
  it("maps Strava visibility to levels", () => {
    expect(activityLevel({ visibility: "everyone", private: false })).toBe(0);
    expect(activityLevel({ visibility: "followers_only", private: false })).toBe(1);
    expect(activityLevel({ visibility: "only_me", private: true })).toBe(2);
  });

  it("trusts the private flag even if visibility disagrees", () => {
    expect(activityLevel({ visibility: "everyone", private: true })).toBe(2);
  });

  it("never treats a missing field as public", () => {
    expect(activityLevel({})).toBe(1);
    expect(activityLevel({ private: false })).toBe(1);
    expect(activityLevel({ private: true })).toBe(2);
  });

  it("gives each audience only what it could see on Strava", () => {
    expect([0, 1, 2].map((l) => visibleTo(l as 0 | 1 | 2, "public"))).toEqual([true, false, false]);
    expect([0, 1, 2].map((l) => visibleTo(l as 0 | 1 | 2, "link"))).toEqual([true, true, false]);
    expect([0, 1, 2].map((l) => visibleTo(l as 0 | 1 | 2, "owner"))).toEqual([true, true, true]);
  });

  it("hides untagged (pre-audience) data from visitors", () => {
    expect(visibleTo(undefined, "public")).toBe(false);
    expect(visibleTo(undefined, "link")).toBe(false);
    expect(visibleTo(undefined, "owner")).toBe(true);
  });

  it("maps card visibility to the visitor audience", () => {
    expect(visitorAudience("public")).toBe("public");
    expect(visitorAudience("unlisted")).toBe("link");
    expect(visitorAudience("private")).toBeNull();
  });
});

describe("default visibility from Strava habits", () => {
  const mix = (everyone: number, followers: number, onlyMe: number): PrivacyMix =>
    privacyMix([
      ...Array.from({ length: everyone }, () => act({ visibility: "everyone" })),
      ...Array.from({ length: followers }, () => act({ visibility: "followers_only" })),
      ...Array.from({ length: onlyMe }, () => act({ visibility: "only_me", private: true })),
    ]);

  it("Public when most training is public", () => {
    expect(defaultVisibilityFor(mix(90, 5, 5))).toBe("public");
    expect(defaultVisibilityFor(mix(75, 25, 0))).toBe("public");
  });

  it("Link only when most is followers-only", () => {
    expect(defaultVisibilityFor(mix(20, 70, 10))).toBe("unlisted");
    expect(defaultVisibilityFor(mix(74, 26, 0))).toBe("unlisted");
  });

  it("Private when most is Only You", () => {
    expect(defaultVisibilityFor(mix(10, 10, 80))).toBe("private");
  });

  it("Link only for someone with no activities yet", () => {
    expect(defaultVisibilityFor(mix(0, 0, 0))).toBe("unlisted");
  });

  it("weighs by training time, not activity count", () => {
    // Ten short public walks don't make four long private rides public.
    const m = privacyMix([
      ...Array.from({ length: 10 }, () => act({ visibility: "everyone" }, 600)),
      ...Array.from({ length: 4 }, () => act({ visibility: "only_me", private: true }, 4 * 3600)),
    ]);
    expect(visibleShare(m, "public")).toBeLessThan(0.2);
    expect(defaultVisibilityFor(m)).toBe("private");
  });
});

describe("audience cards", () => {
  const raw = syntheticAthlete(PROFILES.triathlete, NOW);
  const cards = buildAudienceCards(raw, {}, NOW);
  const count = (v: StravaSummaryActivity["visibility"]) => raw.activities.filter((a) => a.visibility === v).length;

  it("fixtures include every visibility level", () => {
    expect(count("everyone")).toBeGreaterThan(0);
    expect(count("followers_only")).toBeGreaterThan(0);
    expect(count("only_me")).toBeGreaterThan(0);
  });

  it("builds each card only from the activities its audience may see", () => {
    const total = cards.owner.inputs.activityCount;
    expect(cards.link.inputs.activityCount).toBe(total - count("only_me"));
    expect(cards.public.inputs.activityCount).toBe(total - count("only_me") - count("followers_only"));
    expect(activitiesFor(raw.activities, "public").every((a) => a.visibility === "everyone")).toBe(true);
  });

  it("drops hidden activities from the calendar series too", () => {
    const minutes = (c: typeof cards.owner) => c.inputs.daily.minutes.reduce((s, m) => s + m, 0);
    expect(minutes(cards.public)).toBeLessThan(minutes(cards.link));
    expect(minutes(cards.link)).toBeLessThan(minutes(cards.owner));
  });

  it("labels each card with its audience; only the owner card carries the privacy mix", () => {
    expect([cards.owner.audience, cards.link.audience, cards.public.audience]).toEqual(["owner", "link", "public"]);
    expect(cards.owner.privacy?.activities).toEqual([count("everyone"), count("followers_only"), count("only_me")]);
    expect(cards.link.privacy).toBeUndefined();
    expect(cards.public.privacy).toBeUndefined();
  });

  it("keeps a separate rating history per audience", () => {
    const next = buildAudienceCards(raw, cards, new Date(NOW.getTime() + 86_400_000));
    expect(next.public.history.map((h) => h.overall)).toEqual([cards.public.overall, next.public.overall]);
    expect(next.owner.history.map((h) => h.overall)).toEqual([cards.owner.overall, next.owner.overall]);
  });

  it("an athlete with nothing public gets an empty public card", () => {
    const hidden = { ...raw, activities: raw.activities.map((a) => ({ ...a, visibility: "only_me" as const, private: true })) };
    const c = buildAudienceCards(hidden, {}, NOW);
    expect(c.public.inputs.activityCount).toBe(0);
    expect(c.public.inputs.races).toEqual([]);
    expect(c.owner.inputs.activityCount).toBeGreaterThan(0);
  });

  it("tags every route shape with its activity's level", () => {
    const routes = Object.values(routesByDay(raw.activities)).flat();
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.every((r) => r.level === 0 || r.level === 1 || r.level === 2)).toBe(true);
    expect(routes.some((r) => r.level === 2)).toBe(true);
  });
});
