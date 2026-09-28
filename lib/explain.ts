/**
 * Plain-English explanations of a card's stats for the scout report. Pure and
 * presentation-only: the engine's `detail` strings stay as the terse API form.
 */
import type { AttributeKey, PlayerCard, SportBreakdown, SportFamily } from "@/types/player";

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

/** What feeds each stat, in plain words (guide). */
export const STAT_INPUTS: Record<AttributeKey, string> = {
  PAC: "Your faster runs, rides and swims, each judged against that sport",
  END: "Longest session per sport, plus total hours this year",
  PWR: "Climbing on runs, rides and hikes; heart-rate effort on flat sports",
  CONS: "Active days in the last 30, and active weeks in the last 12",
  VAR: "Number of sports, and how evenly your time is split",
  PHY: "Lifetime hours on Strava, and years since you joined",
};

/** One-line "what this measures" per stat — shared by the scout report and the guide. */
export const STAT_MEASURES: Record<AttributeKey, string> = {
  PAC: "Your typical fast pace in each sport",
  END: "How long you can go, and how much you train",
  PWR: "How hard you push: hills, or heart rate on flat sports",
  CONS: "How regularly you show up",
  VAR: "How many sports you do, and how evenly",
  PHY: "Your training history over the years",
};

const SPORT: Record<SportFamily, string> = {
  run: "Run",
  ride: "Ride",
  swim: "Swim",
  foot: "Hike",
  snow: "Snow",
  water: "Paddle",
  gym: "Gym",
  other: "Other",
};

const n0 = (n: number) => Math.round(n).toLocaleString("en-US");
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

function pace(s: SportBreakdown): string | null {
  if (!s.paceMps) return null;
  if (s.family === "swim") return `${SPORT.swim} ${mmss(100 / s.paceMps)} /100m`;
  if (s.family === "ride") return `${SPORT.ride} ${(s.paceMps * 3.6).toFixed(1)} km/h`;
  return `${SPORT[s.family]} ${mmss(1000 / s.paceMps)} /km`;
}

/** Sports that matter for the athlete (≥2 sessions or ≥3 h), most time first. */
function mainSports(card: PlayerCard) {
  const counted = card.inputs.sports.filter((s) => s.activities >= 2 || s.hours >= 3);
  return counted.length ? counted : card.inputs.sports;
}

export function explainStat(card: PlayerCard, key: AttributeKey): StatExplanation {
  const e = explainParts(card, key);
  // For versatility the sport split says more than the count.
  const headline = (key === "VAR" ? e.facts[1] : undefined) ?? e.facts[0];
  return { ...e, headline };
}

function explainParts(card: PlayerCard, key: AttributeKey): Omit<StatExplanation, "headline"> {
  const i = card.inputs;
  const sports = mainSports(card);
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
          ? `Longest ${SPORT[s.family].toLowerCase()} session ${s.longestHours.toFixed(1)} h`
          : `Longest ${SPORT[s.family].toLowerCase()} ${s.longestKm} km`,
      );
      return { measures: STAT_MEASURES.END, facts: [...longest, `${n0(i.windowHours)} h this year`] };
    }
    case "PWR": {
      const facts: string[] = [];
      if (i.windowElevationM > 0) facts.push(`${n0(i.windowElevationM / 1000)} km climbed this year`);
      const hrSport = sports.find((s) => s.hrIntensity !== null && s.climbRateMPerH === null);
      if (hrSport) facts.push(`${SPORT[hrSport.family]}s at ${Math.round(hrSport.hrIntensity! * 100)}% of max heart rate`);
      const steepest = sports.filter((s) => s.hillyShare !== null).sort((a, b) => (b.hillyShare ?? 0) - (a.hillyShare ?? 0))[0];
      if (steepest && steepest.hillyShare! > 0) facts.push(`${Math.round(steepest.hillyShare! * 100)}% of ${SPORT[steepest.family].toLowerCase()}s are hilly`);
      return {
        measures: STAT_MEASURES.PWR,
        facts: facts.length ? facts : ["No climbing or heart-rate data yet"],
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
            .map((s) => `${SPORT[s.family]} ${Math.round((s.hours / total) * 100)}%`)
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
