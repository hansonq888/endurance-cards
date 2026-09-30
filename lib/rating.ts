/**
 * Stage 2 of the engine: ScoutInputs → six stats, overall, tier, position,
 * archetype, highlight and trophies. Pure; tuned formulas bump ENGINE_VERSION.
 */
import type { AttributeKey, AttributeScore, CardHighlight, CardTier, ScoutInputs, SportBreakdown, SportFamily, Trophy } from "@/types/player";
import { awardTrophies } from "./trophies";
import { fmtPer100, fmtPerKm, n0 } from "./format";
import { clamp, logScale, ratioScale, saturate, toRating, weighted } from "./scales";
import { SPORT_BENCHMARKS, SPORT_LABELS, countedSports, isCountedSport } from "./sports";

const sportName = (f: SportFamily) => SPORT_LABELS[f].toLowerCase();
import { WINDOW_DAYS } from "./extract";

/** Bump whenever formulas change — cached cards with an older version are re-rated. */
export const ENGINE_VERSION = 6;

// ---------- Stage 2: rating ----------

const LABELS: Record<AttributeKey, string> = {
  PAC: "Pace",
  END: "Endurance",
  PRS: "Records",
  CONS: "Consistency",
  VAR: "Versatility",
  PHY: "Physicality",
};

/** PRS is the noisiest stat (it favours improving athletes), so it carries the least weight with VAR. */
export const OVR_WEIGHTS: Record<AttributeKey, number> = {
  PAC: 0.2,
  END: 0.22,
  PRS: 0.1,
  CONS: 0.18,
  VAR: 0.1,
  PHY: 0.2,
};

/** Requirements to break the 89 ceiling into Icon territory. */
export const LEGACY_GATE = { minTenureYears: 3, minLifetimeHours: 1500, minActiveWeeksLast12: 9 } as const;

export const TIER_THRESHOLDS: { tier: CardTier; min: number }[] = [
  { tier: "icon", min: 90 },
  { tier: "gold", min: 70 },
  { tier: "silver", min: 55 },
  { tier: "bronze", min: 1 },
];



/** Share-weighted average over the sports that produced a score. Null if none did. */
function blend(parts: { score: number; share: number }[]): number | null {
  const total = parts.reduce((s, p) => s + p.share, 0);
  if (!parts.length || total <= 0) return null;
  return Math.round(parts.reduce((s, p) => s + p.score * p.share, 0) / total);
}

function paceScore(s: SportBreakdown): number | null {
  const band = SPORT_BENCHMARKS[s.family].pace;
  return band && s.paceMps ? ratioScale(s.paceMps, band.floor, band.ceiling) : null;
}

function ratePace(i: ScoutInputs): AttributeScore {
  const parts = countedSports(i.sports).flatMap((s) => {
    const score = paceScore(s);
    return score === null ? [] : [{ s, score, share: s.share }];
  });
  const value = blend(parts);
  if (value === null) {
    return { key: "PAC", label: LABELS.PAC, value: 1, measured: false, detail: "Not enough timed runs, rides or swims to measure pace" };
  }
  const text = parts.map(({ s }) =>
    s.family === "swim" ? `swim ${fmtPer100(s.paceMps!)}` : s.family === "ride" ? `ride ${(s.paceMps! * 3.6).toFixed(1)} km/h` : `run ${fmtPerKm(s.paceMps!)}`,
  );
  return { key: "PAC", label: LABELS.PAC, value, detail: `Upper-quartile pace: ${text.join(" · ")}` };
}

function rateEndurance(i: ScoutInputs): AttributeScore {
  const parts = countedSports(i.sports).map((s) => {
    const b = SPORT_BENCHMARKS[s.family].longest;
    return { s, score: logScale(b.unit === "km" ? s.longestKm : s.longestHours, b.floor, b.ceiling), share: s.share };
  });
  const longest = blend(parts) ?? 1;
  // Time is the one sport-neutral currency, so total volume is rated in hours.
  const volume = logScale(i.windowHours, 10, 600);
  const top = parts
    .slice(0, 3)
    .map(({ s }) =>
      SPORT_BENCHMARKS[s.family].longest.unit === "km" ? `${s.longestKm} km ${sportName(s.family)}` : `${s.longestHours.toFixed(1)} h ${sportName(s.family)}`,
    );
  return {
    key: "END",
    label: LABELS.END,
    value: weighted([[longest, 0.45], [volume, 0.55]]),
    detail: `${top.length ? `Longest: ${top.join(" · ")} · ` : ""}${n0(i.windowHours)} h/yr moving`,
  };
}

/** Sports Strava awards PRs in: best efforts on runs, segment PRs on runs, rides and hikes. */
const PR_FAMILIES: ReadonlySet<SportFamily> = new Set<SportFamily>(["run", "ride", "foot"]);
/** The same sports, in words. */
export const PR_SPORTS_TEXT = "runs, rides and hikes";

/** Hours and PRs across the sports Strava awards PRs in. */
export function prTotals(i: Pick<ScoutInputs, "sports">): { hours: number; prs: number } {
  const prSports = i.sports.filter((s) => PR_FAMILIES.has(s.family));
  return { hours: prSports.reduce((sum, s) => sum + s.hours, 0), prs: prSports.reduce((sum, s) => sum + s.prs, 0) };
}
/** Hours of those sports needed before PRs are rated; fewer shows "–". */
export const MIN_PR_HOURS = 10;
/** Small samples are pulled toward a typical ~2 PRs per 10 h until there's enough to trust. */
const PR_PRIOR = { per10: 2, hours: 10 };

/**
 * How often you beat your own best: PRs per 10 hours of runs, rides and hikes.
 * Per hour, so training more doesn't win on its own; PRs from other sports
 * don't count. 0.2 → 1, 2 → 50, 20 → 99 (log of the rate).
 */
function ratePRs(i: ScoutInputs): AttributeScore {
  const { hours, prs } = prTotals(i);
  if (hours < MIN_PR_HOURS) {
    return { key: "PRS", label: LABELS.PRS, value: 1, measured: false, detail: `Needs ${MIN_PR_HOURS}+ hours of ${PR_SPORTS_TEXT}` };
  }
  const per10 = ((prs + (PR_PRIOR.per10 / 10) * PR_PRIOR.hours) / (hours + PR_PRIOR.hours)) * 10;
  return {
    key: "PRS",
    label: LABELS.PRS,
    value: ratioScale(per10, 0.2, 20),
    detail: `${n0(prs)} PRs in ${n0(hours)} h of ${PR_SPORTS_TEXT} · ${((prs / hours) * 10).toFixed(1)} per 10 h`,
  };
}

function rateConsistency(i: ScoutInputs): AttributeScore {
  const days = saturate(i.activeDaysLast30, 9);
  const weeks = toRating(i.activeWeeksLast12 / 12);
  return {
    key: "CONS",
    label: LABELS.CONS,
    value: weighted([[days, 0.65], [weeks, 0.35]]),
    detail: `${i.activeDaysLast30} active days in last 30 · ${i.activeWeeksLast12}/12 weeks active`,
  };
}

function rateVersatility(i: ScoutInputs): AttributeScore {
  const fams = i.sports.filter(isCountedSport);
  if (!fams.length) return { key: "VAR", label: LABELS.VAR, value: 1, detail: "No activities in the last year" };
  const breadth = toRating(1 - Math.exp(-0.55 * fams.length));
  // Shannon evenness of time split, normalised so 4 evenly-split sports = 1.
  const totalHours = fams.reduce((s, f) => s + f.hours, 0) || 1;
  const entropy = -fams.reduce((s, f) => {
    const p = f.hours / totalHours;
    return p > 0 ? s + p * Math.log(p) : s;
  }, 0);
  const evenness = toRating(entropy / Math.log(4));
  const triBonus = i.hasTriathlonMix ? 6 : 0;
  return {
    key: "VAR",
    label: LABELS.VAR,
    value: clamp(weighted([[breadth, 0.5], [evenness, 0.5]]) + triBonus, 1, 99),
    detail: `${fams.length} ${fams.length === 1 ? "sport" : "sports"}: ${fams
      .map((f) => `${sportName(f.family)} ${Math.round((f.hours / totalHours) * 100)}%`)
      .join(", ")}${triBonus ? " · triathlon bonus" : ""}`,
  };
}

function ratePhysicality(i: ScoutInputs): AttributeScore {
  const volume = logScale(i.lifetimeHours, 20, 6000);
  const tenure = logScale(i.tenureYears, 0.25, 12);
  return {
    key: "PHY",
    label: LABELS.PHY,
    value: weighted([[volume, 0.7], [tenure, 0.3]]),
    detail: `${n0(i.lifetimeHours)} lifetime hours · ${i.tenureYears} yrs on Strava`,
  };
}

export function tierFor(overall: number): CardTier {
  return TIER_THRESHOLDS.find((t) => overall >= t.min)?.tier ?? "bronze";
}

const POSITION_BY_FAMILY: Record<SportFamily, string> = {
  run: "RUN",
  ride: "CYC",
  swim: "SWM",
  foot: "HIK",
  snow: "SKI",
  water: "ROW",
  gym: "GYM",
  other: "ATH",
};

const ARCHETYPES: Record<AttributeKey, string> = {
  PAC: "Speedster",
  END: "Diesel Engine",
  PRS: "Record Breaker",
  CONS: "Metronome",
  VAR: "Swiss Army Knife",
  PHY: "Veteran Workhorse",
};

/** The sport-specific number on the card: what that kind of athlete brags about. */
function highlightFor(i: ScoutInputs, position: string): CardHighlight {
  const perYear = (n: number) => n * (WINDOW_DAYS / i.windowDays);
  const km = (fam: SportFamily) => perYear(i.sports.find((s) => s.family === fam)?.distanceKm ?? 0);
  const fmtKm = (n: number) => n0(n);
  switch (position) {
    case "RUN":
      return { value: `${fmtKm(km("run"))} KM`, label: "RUN / YR", climb: false };
    case "SWM":
      return { value: `${fmtKm(km("swim"))} KM`, label: "SWUM / YR", climb: false };
    case "ROW":
      return { value: `${fmtKm(km("water"))} KM`, label: "PADDLED / YR", climb: false };
    case "CYC":
    case "HIK":
    case "SKI":
      return { value: `${fmtKm(i.windowElevationM / 1000)} KM`, label: "CLIMBED / YR", climb: true };
    default:
      return { value: `${n0(i.windowHours)} H`, label: "TRAINED / YR", climb: false };
  }
}

/** False only for stats the athlete's sports give us no data for (shown as "–"). */
export const isMeasured = (a: Pick<AttributeScore, "measured">) => a.measured !== false;

export interface Rating {
  attributes: Record<AttributeKey, AttributeScore>;
  overall: number;
  tier: CardTier;
  legacyCapped: boolean;
  position: string;
  archetype: string;
  highlight: CardHighlight;
  trophies: Trophy[];
}

export function rateInputs(i: ScoutInputs): Rating {
  const list = [ratePace(i), rateEndurance(i), ratePRs(i), rateConsistency(i), rateVersatility(i), ratePhysicality(i)];
  const attributes = Object.fromEntries(list.map((a) => [a.key, a])) as Record<AttributeKey, AttributeScore>;
  // Stats we couldn't measure sit out; `weighted` renormalises over the rest.
  const measured = list.filter(isMeasured);

  let overall = weighted(measured.map((a) => [a.value, OVR_WEIGHTS[a.key]]));
  let legacyCapped = false;
  const legacyOk =
    i.tenureYears >= LEGACY_GATE.minTenureYears &&
    i.lifetimeHours >= LEGACY_GATE.minLifetimeHours &&
    i.activeWeeksLast12 >= LEGACY_GATE.minActiveWeeksLast12;
  if (overall >= 90 && !legacyOk) {
    overall = 89;
    legacyCapped = true;
  }
  overall = clamp(overall, 1, 99);

  const top = [...measured].sort((a, b) => b.value - a.value)[0];
  const primary = i.sports[0]?.family;
  const position =
    i.hasTriathlonMix && attributes.VAR.value >= 70 ? "TRI" : primary ? POSITION_BY_FAMILY[primary] : "ATH";

  return {
    attributes,
    overall,
    tier: tierFor(overall),
    legacyCapped,
    position,
    archetype: ARCHETYPES[top.key],
    highlight: highlightFor(i, position),
    trophies: awardTrophies(i),
  };
}
