import { describe, expect, it } from "vitest";
import { buildCard } from "@/lib/engine";
import { PROFILES, syntheticAthlete } from "@/lib/fixtures";

/** The home page and guide build these demo cards live, so they must stay in their tier whatever the date. */
const INTENDED = {
  casualJogger: "bronze",
  dedicatedRunner: "silver",
  triathlete: "gold",
  eliteMountainRunner: "icon",
} as const;

describe("demo athletes stay in their tier", () => {
  const start = Date.parse("2026-09-01T12:00:00Z");
  for (const [profile, tier] of Object.entries(INTENDED)) {
    it(`${profile} is ${tier} on every day for 60 days`, () => {
      const wrong: string[] = [];
      for (let d = 0; d < 60; d++) {
        const now = new Date(start + d * 86_400_000);
        const card = buildCard(syntheticAthlete(PROFILES[profile as keyof typeof INTENDED], now), now);
        if (card.tier !== tier) wrong.push(`${now.toISOString().slice(0, 10)}: ${card.overall} ${card.tier}`);
      }
      expect(wrong).toEqual([]);
    });
  }
});
