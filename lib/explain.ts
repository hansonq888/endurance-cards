/**
 * Plain-English explanations of a card's stats for the scout report. Pure and
 * presentation-only: the engine's `detail` strings stay as the terse API form.
 */
import { MIN_PR_HOURS, PR_SPORTS_TEXT, prTotals } from "./rating";
import { SPORT_LABELS, countedSports } from "./sports";
import type { AttributeKey, PlayerCard, SportBreakdown } from "@/types/player";
import { mmss, n0 } from "./format";

export interface StatExplanation {
  /** What the stat measures, in one line. */
  measures: string;
  /** Two or three facts behind the number. */
  facts: string[];
  /** The single most telling fact, shown when the row is collapsed. */
  headline: string;
}

/** A word for "is this good?" — the same bands for every stat. */
/** Rating words and where each band starts — the same bands for every stat. */
export const RATING_BANDS = [
  { min: 1, word: "Building" },
  { min: 40, word: "Solid" },
  { min: 55, word: "Good" },
  { min: 70, word: "Strong" },
  { min: 85, word: "Elite" },
] as const;

export function ratingWord(value: number): string {
  return [...RATING_BANDS].reverse().find((b) => value >= b.min)?.word ?? "Building";
}

/** One-line "what this measures" per stat — shared by the scout report and the guide. */
const STAT_MEASURES: Record<AttributeKey, string> = {
  PAC: "Your typical fast pace in each sport",
  END: "How long you can go, and how much you train",
  PRS: "How often you beat your own best",
  CONS: "How regularly you show up",
  VAR: "How many sports you do, and how evenly",
  PHY: "Your training history over the years",
};

function pace(s: SportBreakdown): string | null {
  if (!s.paceMps) return null;
  if (s.family === "swim") return `${SPORT_LABELS.swim} ${mmss(100 / s.paceMps)} /100m`;
  if (s.family === "ride") return `${SPORT_LABELS.ride} ${(s.paceMps * 3.6).toFixed(1)} km/h`;
  return `${SPORT_LABELS[s.family]} ${mmss(1000 / s.paceMps)} /km`;
}

export function explainStat(card: PlayerCard, key: AttributeKey): StatExplanation {
  const e = explainParts(card, key);
  // For versatility the sport split says more than the count.
  const headline = (key === "VAR" ? e.facts[1] : undefined) ?? e.facts[0];
  return { ...e, headline };
}

function explainParts(card: PlayerCard, key: AttributeKey): Omit<StatExplanation, "headline"> {
  const i = card.inputs;
  const sports = countedSports(card.inputs.sports);
  switch (key) {
    case "PAC": {
      const facts = sports.map(pace).filter((f): f is string => f !== null).slice(0, 3);
      return {
        measures: STAT_MEASURES.PAC,
        facts: facts.length ? facts : ["Not enough timed runs, rides or swims yet"],
      };
    }
    case "END": {
      const longest = sports.slice(0, 2).map((s) =>
        s.family === "gym" || s.family === "other"
          ? `Longest ${SPORT_LABELS[s.family].toLowerCase()} session ${s.longestHours.toFixed(1)} h`
          : `Longest ${SPORT_LABELS[s.family].toLowerCase()} ${s.longestKm} km`,
      );
      return { measures: STAT_MEASURES.END, facts: [...longest, `${n0(i.windowHours)} h this year`] };
    }
    case "PRS": {
      const { hours, prs } = prTotals(i);
      if (card.attributes.PRS?.measured === false) {
        return { measures: STAT_MEASURES.PRS, facts: [`Not measured yet: needs ${MIN_PR_HOURS}+ hours of ${PR_SPORTS_TEXT}`] };
      }
      return {
        measures: STAT_MEASURES.PRS,
        facts: [`${n0(prs)} PRs this year`, `${((prs / hours) * 10).toFixed(1)} per 10 hours of ${PR_SPORTS_TEXT}`],
      };
    }
    case "CONS":
      return {
        measures: STAT_MEASURES.CONS,
        facts: [`Active ${i.activeDaysLast30} of the last 30 days`, `${i.activeWeeksLast12} of the last 12 weeks`],
      };
    case "VAR": {
      const total = sports.reduce((s, f) => s + f.hours, 0) || 1;
      return {
        measures: STAT_MEASURES.VAR,
        facts: [
          `${sports.length} ${sports.length === 1 ? "sport" : "sports"}`,
          sports
            .slice(0, 3)
            .map((s) => `${SPORT_LABELS[s.family]} ${Math.round((s.hours / total) * 100)}%`)
            .join(" / "),
          ...(i.hasTriathlonMix ? ["Triathlon bonus"] : []),
        ],
      };
    }
    case "PHY":
      return {
        measures: STAT_MEASURES.PHY,
        facts: [`${n0(i.lifetimeHours)} lifetime hours`, `${i.tenureYears} years on Strava`],
      };
  }
}

/** Guide: how each stat is worked out (one or two short sentences) and the single best way to raise it. */
export const STAT_DETAIL: Record<AttributeKey, { how: string; tip: string }> = {
  PAC: {
    how: "Your faster sessions in each sport, compared with people who do that sport. Easy days don't drag it down.",
    tip: "Add one speed or tempo session a week",
  },
  END: {
    how: "Your longest session in each sport, plus your total hours this year.",
    tip: "Build one longer session a week",
  },
  PRS: {
    how: `Personal records Strava gave you this year, per 10 hours of ${PR_SPORTS_TEXT}. Swim- or gym-only athletes show “–” and aren't marked down.`,
    tip: "Go after a segment or distance you've done before",
  },
  CONS: {
    how: "Active days in the last 30, plus active weeks in the last 12.",
    tip: "Short sessions count: just show up",
  },
  VAR: {
    how: "How many sports you do regularly, and how evenly your time is split.",
    tip: "Add a second sport, even easy sessions",
  },
  PHY: {
    how: "Your lifetime hours on Strava, plus years since you joined.",
    tip: "Keep going: it grows every year",
  },
};
