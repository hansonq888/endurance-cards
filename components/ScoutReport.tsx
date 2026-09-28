import { Flame, Gauge, Layers, Mountain, Timer, Zap, type LucideIcon } from "lucide-react";
import { OVR_WEIGHTS } from "@/lib/engine";
import { holoVars } from "@/lib/card-theme";
import { explainStat, ratingWord } from "@/lib/explain";
import { formatValue, LEVEL_NUMERALS, TROPHIES, trophyProgress } from "@/lib/trophies";
import { ATTRIBUTE_KEYS, type AttributeKey, type PlayerCard } from "@/types/player";
import { SectionHeading } from "./SectionHeading";
import { SportDonut } from "./SportDonut";
import { TrophyBadges, type BadgeItem } from "./TrophyBadges";

/** Panel container shared by the sections around the card. */
export const PANEL = "grain rounded-2xl border border-line p-5";

export const STAT_ICONS: Record<AttributeKey, LucideIcon> = {
  PAC: Gauge,
  END: Timer,
  PWR: Mountain,
  CONS: Flame,
  VAR: Layers,
  PHY: Zap,
};

/** Map-style scale bar: orange fill with tick marks every 25. */
export function ScaleBar({ value, className = "h-1.5" }: { value: number; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-full bg-white/[0.07] ${className}`}>
      <div
        className="h-full rounded-full"
        style={{ width: `${value}%`, background: "linear-gradient(90deg, #b8380a, var(--strava) 60%, #ff8a3d)" }}
      />
      {[25, 50, 75].map((tick) => (
        <span key={tick} className="absolute inset-y-0 w-px bg-background/70" style={{ left: `${tick}%` }} />
      ))}
    </div>
  );
}

export function StatBreakdown({ card }: { card: PlayerCard }) {
  return (
    <section className={PANEL}>
      <SectionHeading>Scout report</SectionHeading>
      <ul className="divide-y divide-line">
        {ATTRIBUTE_KEYS.map((key) => {
          const a = card.attributes[key];
          const Icon = STAT_ICONS[key];
          const { measures, facts, headline } = explainStat(card, key);
          const more = facts.filter((f) => f !== headline);
          return (
            <li key={key} className="font-accent">
              {/* Compact by default; click a stat for what it measures and the rest of its facts. */}
              <details className="group py-3">
                <summary className="cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
                  <div className="mb-1.5 flex items-baseline gap-2">
                    <span className="w-9 shrink-0 text-2xl font-medium leading-none tabular-nums">{a.value}</span>
                    <Icon className="h-3.5 w-3.5 shrink-0 self-center text-strava" aria-hidden />
                    <span className="text-xs font-medium uppercase tracking-wider">{a.label}</span>
                    <span className="ml-auto text-[11px] uppercase tracking-wider text-strava">{ratingWord(a.value)}</span>
                    <span className="w-3 text-center text-muted transition-transform group-open:rotate-90" aria-hidden>
                      ›
                    </span>
                  </div>
                  <div className="pl-11 pr-5">
                    <ScaleBar value={a.value} />
                    <p className="mt-1.5 truncate text-[11px] text-muted group-open:hidden">{headline}</p>
                  </div>
                </summary>
                <div className="pl-11 pr-5 pt-1.5 text-[11px] leading-relaxed">
                  <p className="text-muted">{measures}</p>
                  <ul className="mt-1 space-y-0.5">
                    {[headline, ...more].map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      {card.legacyCapped && (
        <p className="mt-3 border-l-2 border-strava pl-3 font-accent text-xs text-muted">
          Capped at 89: Icon status needs 3+ years on Strava, 1,500+ lifetime hours and 9 of the last 12 weeks active.
        </p>
      )}
      <details className="group mt-2 border-t border-line pt-3 font-accent text-[11px] text-muted">
        <summary className="cursor-pointer list-none select-none hover:text-foreground">
          <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>How is the overall calculated?
        </summary>
        <p className="mt-2 leading-relaxed">
          Your overall is a weighted average:{" "}
          {ATTRIBUTE_KEYS.map((k) => `${card.attributes[k].label} ${Math.round(OVR_WEIGHTS[k] * 100)}%`).join(", ")}. Each sport is
          rated against people who do that sport, then blended by how much time you spend on it. 90+ (Icon) needs 3+ years on
          Strava, 1,500+ lifetime hours and 9 of the last 12 weeks active.
        </p>
      </details>
    </section>
  );
}

/**
 * Earned trophies as medallion badges for everyone. The owner additionally sees
 * the count, progress to the next level, and locked badges — visitors never
 * receive that data.
 */
export function TrophyCabinet({ card, isOwner = false }: { card: PlayerCard; isOwner?: boolean }) {
  const progress = new Map(trophyProgress(card.inputs).map((p) => [p.def.id, p]));
  const progressText = (id: string) => {
    const p = progress.get(id);
    if (!isOwner || !p || p.next === null) return undefined;
    return `${formatValue(p.def, p.value)} / ${formatValue(p.def, p.next)} ${p.def.unit} to ${LEVEL_NUMERALS[p.level as 0 | 1 | 2]}`;
  };
  const earned: BadgeItem[] = card.trophies.map((t) => ({
    id: t.id,
    name: t.name,
    level: t.level,
    description: t.description,
    progressText: progressText(t.id),
  }));
  const locked: BadgeItem[] = isOwner
    ? [...progress.values()]
        .filter((p) => p.level === 0)
        .sort((a, b) => b.fraction - a.fraction)
        .map((p) => ({
          id: p.def.id,
          name: p.def.name,
          level: 0,
          description: p.def.measure,
          progress: p.fraction,
          progressText: progressText(p.def.id),
        }))
    : [];

  return (
    <section className={PANEL} style={holoVars(card.tier)}>
      <div className="mb-4 flex items-end justify-between gap-3 border-b border-line pb-2">
        <SectionHeading bare>Trophy cabinet</SectionHeading>
        {isOwner && (
          <span className="font-accent text-[11px] uppercase tracking-wider text-muted">
            {card.trophies.length} / {TROPHIES.length} earned
          </span>
        )}
      </div>
      {earned.length || locked.length ? (
        <TrophyBadges items={[...earned, ...locked]} />
      ) : (
        <p className="font-accent text-sm text-muted">No silverware yet. Streaks, long days and new sports unlock trophies.</p>
      )}
    </section>
  );
}

export function SportMix({ card }: { card: PlayerCard }) {
  const figures: [value: string, unit: string][] = [
    [card.inputs.activityCount.toLocaleString("en-US"), "activities"],
    [Math.round(card.inputs.windowHours).toLocaleString("en-US"), "hours"],
    [Math.round(card.inputs.windowElevationM / 1000).toLocaleString("en-US"), "km climbed"],
  ];
  return (
    <section className={PANEL}>
      <SectionHeading>Last 12 months</SectionHeading>
      {/* Nike year-in-review style: big number, small unit tucked top-right. */}
      <dl className="mb-5 grid grid-cols-3 gap-2 font-accent">
        {figures.map(([value, unit]) => (
          <div key={unit} className="min-w-0">
            <dt className="sr-only">{unit}</dt>
            <dd className="flex items-start gap-1">
              <span className="text-3xl font-medium leading-none tracking-tight tabular-nums">{value}</span>
              <span className="mt-0.5 text-[10px] leading-tight text-muted">{unit}</span>
            </dd>
          </div>
        ))}
      </dl>
      <SportDonut sports={card.inputs.sports} />
    </section>
  );
}

/** Overall across past scouts: sparkline plus change since the first point. Centred under the card. */
export function RatingTrend({ card, className = "" }: { card: PlayerCard; className?: string }) {
  const h = card.history ?? [];
  if (h.length < 2) return null;
  const first = h[0];
  const delta = card.overall - first.overall;
  const lo = Math.min(...h.map((p) => p.overall)) - 1;
  const hi = Math.max(...h.map((p) => p.overall)) + 1;
  const W = 120;
  const H = 26;
  const pts = h.map((p, i) => [(i / (h.length - 1)) * W, H - ((p.overall - lo) / (hi - lo)) * H] as const);
  const since = new Date(`${first.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  return (
    <div className={`flex items-center justify-center gap-3 font-accent ${className}`}>
      <svg viewBox={`-3 -3 ${W + 6} ${H + 6}`} className="h-7 w-28 shrink-0 overflow-visible" role="img" aria-label={`Overall rating over ${h.length} scouts`}>
        <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--strava)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r={3} fill="var(--strava)" stroke="var(--background)" strokeWidth={1.5} />
      </svg>
      <p className="text-xs leading-tight">
        <span className={delta >= 0 ? "text-strava" : "text-muted"}>
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {delta > 0 ? "+" : ""}
          {delta} OVR
        </span>
        <span className="block text-[11px] text-muted">since {since}</span>
      </p>
    </div>
  );
}

const fmtTime = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

/** Races Strava has tagged this year, most recent first. Hidden when there are none. */
export function RaceLog({ card }: { card: PlayerCard }) {
  const races = card.inputs.races ?? [];
  if (!races.length) return null;
  return (
    <section className={PANEL}>
      <SectionHeading>Races · {races.length}</SectionHeading>
      <ul className="divide-y divide-line font-accent">
        {races.slice(0, 5).map((r) => (
          <li key={r.date + r.name} className="flex items-baseline gap-3 py-2 text-xs first:pt-0">
            <span className="w-12 shrink-0 text-[11px] text-muted">
              {new Date(`${r.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
            </span>
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            <span className="text-muted tabular-nums">{r.distanceKm} km</span>
            <span className="w-16 text-right tabular-nums">{fmtTime(r.movingTime)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
