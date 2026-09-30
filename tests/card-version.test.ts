import { describe, expect, it } from "vitest";
import { imageVersion } from "@/lib/card-version";
import { buildCard } from "@/lib/engine";
import { PROFILES, syntheticAthlete } from "@/lib/fixtures";

const now = new Date("2026-06-01T12:00:00Z");
const card = buildCard(syntheticAthlete(PROFILES.triathlete, now), now);

describe("imageVersion", () => {
  it("ignores re-scouts that change nothing on the card face", () => {
    const rescouted = { ...card, scoutedAt: new Date(now.getTime() + 86_400_000).toISOString(), history: [], trophies: [] };
    expect(imageVersion(rescouted)).toBe(imageVersion(card));
  });

  it("changes when something visible changes", () => {
    expect(imageVersion({ ...card, overall: card.overall + 1 })).not.toBe(imageVersion(card));
    expect(imageVersion({ ...card, avatarUrl: "https://example.com/new.jpg" })).not.toBe(imageVersion(card));
    const pac = { ...card.attributes.PAC, value: card.attributes.PAC.value + 1 };
    expect(imageVersion({ ...card, attributes: { ...card.attributes, PAC: pac } })).not.toBe(imageVersion(card));
  });
});
