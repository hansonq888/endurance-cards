import { describe, expect, it } from "vitest";
import { activityLevel, isShared, privacyMix, sharedActivities } from "@/lib/sharing";
import { buildSharedCard, routesByDay } from "@/lib/engine";
import { PROFILES, syntheticAthlete } from "@/lib/fixtures";
import type { StravaSummaryActivity } from "@/types/strava";

const NOW = new Date("2026-09-27T12:00:00Z");

describe("activity visibility levels", () => {
  it("maps Strava visibility to levels", () => {
    expect(activityLevel({ visibility: "everyone", private: false })).toBe(0);
    expect(activityLevel({ visibility: "followers_only", private: false })).toBe(1);
    expect(activityLevel({ visibility: "only_me", private: true })).toBe(2);
  });

  it("trusts the private flag even if visibility disagrees", () => {
    expect(activityLevel({ visibility: "everyone", private: true })).toBe(2);
  });

  it("treats a missing field as Followers: shared, never assumed public", () => {
    expect(activityLevel({})).toBe(1);
    expect(activityLevel({ private: false })).toBe(1);
    expect(activityLevel({ private: true })).toBe(2);
  });

  it("puts Everyone and Followers activities on the card, never Only You", () => {
    expect(isShared({ visibility: "everyone" })).toBe(true);
    expect(isShared({ visibility: "followers_only" })).toBe(true);
    expect(isShared({ visibility: "only_me", private: true })).toBe(false);
  });
});

describe("the shared card", () => {
  const raw = syntheticAthlete(PROFILES.triathlete, NOW);
  const count = (v: StravaSummaryActivity["visibility"]) => raw.activities.filter((a) => a.visibility === v).length;

  it("fixtures include every visibility level", () => {
    expect(count("everyone")).toBeGreaterThan(0);
    expect(count("followers_only")).toBeGreaterThan(0);
    expect(count("only_me")).toBeGreaterThan(0);
  });

  it("is built without Only You activities", () => {
    const card = buildSharedCard(raw, null, NOW);
    expect(card.inputs.activityCount).toBe(count("everyone") + count("followers_only"));
    expect(sharedActivities(raw.activities).some((a) => a.visibility === "only_me")).toBe(false);
  });

  it("records the privacy mix (counts only) so the athlete can see what was left out", () => {
    const card = buildSharedCard(raw, null, NOW);
    expect(card.privacy?.activities).toEqual([count("everyone"), count("followers_only"), count("only_me")]);
    expect(privacyMix([]).activities).toEqual([0, 0, 0]);
  });

  it("keeps rating history across rebuilds", () => {
    const first = buildSharedCard(raw, null, NOW);
    const next = buildSharedCard(raw, first, new Date(NOW.getTime() + 86_400_000));
    expect(next.history.map((h) => h.overall)).toEqual([first.overall, next.overall]);
  });

  it("an athlete whose activities are all Only You gets an empty card", () => {
    const hidden = { ...raw, activities: raw.activities.map((a) => ({ ...a, visibility: "only_me" as const, private: true })) };
    const card = buildSharedCard(hidden, null, NOW);
    expect(card.inputs.activityCount).toBe(0);
    expect(card.inputs.races).toEqual([]);
    expect(card.privacy?.activities[2]).toBe(raw.activities.length);
  });

  it("stores no Only You route shapes", () => {
    const routes = Object.values(routesByDay(sharedActivities(raw.activities))).flat();
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.every((r) => r.level === 0 || r.level === 1)).toBe(true);
  });
});
