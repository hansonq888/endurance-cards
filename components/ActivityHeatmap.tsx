"use client";

import { BarChart3, LayoutGrid } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CardTier, RaceResult, YearCalendar } from "@/types/player";
import { fmtDuration, HEAT_STEPS, heatStep } from "@/lib/viz";
import { DayRoutes } from "./DayRoutes";

const CELL = 12;
const GAP = 3;
const PITCH = CELL + GAP;
const LEFT = 28; // weekday / axis labels
const TOP = 18; // month labels
const MARKS = 16; // headroom above bars for PR / race markers
const DAY_MS = 86_400_000;
/** Form compares the last 6 weeks with the 6 before. */
const FORM_DAYS = 42;

interface Day {
  key: string; // YYYY-MM-DD
  date: Date;
  minutes: number;
  prs: number;
  week: number;
  weekday: number; // 0 = Sunday
}

interface Week {
  week: number;
  start: Date;
  minutes: number;
  prs: number;
  races: RaceResult[];
}

type Hover = { kind: "day"; day: Day } | { kind: "week"; week: Week };

function buildDays(endDate: string, minutes: number[], prs: number[]): Day[] {
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const first = new Date(end - (minutes.length - 1) * DAY_MS);
  const lead = first.getUTCDay(); // pad so column 0 starts on a Sunday
  return minutes.map((m, i) => {
    const date = new Date(first.getTime() + i * DAY_MS);
    const slot = i + lead;
    return { key: date.toISOString().slice(0, 10), date, minutes: m, prs: prs[i] ?? 0, week: Math.floor(slot / 7), weekday: slot % 7 };
  });
}

const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const fmtShort = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Bar with a 2px rounded top and a square base, growing from the baseline. */
function barPath(x: number, y: number, w: number, base: number, r = 2) {
  if (base - y < r) return `M${x} ${base}V${y}H${x + w}V${base}Z`;
  return `M${x} ${base}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${base}Z`;
}

/** A small pennant for race weeks. */
function flagPath(x: number, y: number) {
  return `M${x} ${y + 8}V${y}L${x + 6} ${y + 2.5}L${x} ${y + 5}`;
}

/**
 * Year of training in two views: a GitHub-style day grid (brighter orange =
 * more time) or weekly bars with markers where PRs were set and races run.
 */
export function ActivityHeatmap({
  slug,
  tier,
  years,
  recent,
  routesEnabled = true,
  view: previewView,
}: {
  slug: string;
  /** Owner previewing a visitor's version: fetch years and routes as that audience would see them. */
  view?: "link" | "public";
  /** False when the owner hides routes from visitors: days aren't clickable. */
  routesEnabled?: boolean;
  /** Tints the holographic route panel to the card's tier. */
  tier: CardTier;
  /** Past calendar years that can be loaded, newest first. */
  years: number[];
  /** The rolling last-12-months series that ships with the card. */
  recent: { endDate: string; minutes: number[]; prs: number[]; races: RaceResult[] };
}) {
  const [period, setPeriod] = useState<"recent" | number>("recent");
  const [loaded, setLoaded] = useState<Record<number, YearCalendar>>({});
  const [status, setStatus] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const data = period === "recent" ? recent : loaded[period];
  const shown = data ?? recent;
  const { endDate, minutes, prs, races } = shown;

  async function choose(next: "recent" | number) {
    setPeriod(next);
    setHover(null);
    setPicked(null);
    if (next === "recent" || loaded[next]) return setStatus({ loading: false, error: null });
    setStatus({ loading: true, error: null });
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const res = await fetch(`/api/scout/${encodeURIComponent(slug)}/calendar?year=${next}${previewView ? `&view=${previewView}` : ""}`);
        if (res.status === 409) {
          // Someone else is loading this year right now — wait for their result.
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(errorMessage(res.status, body.message));
        setLoaded((l) => ({ ...l, [next]: body as YearCalendar }));
        return setStatus({ loading: false, error: null });
      }
      throw new Error("Still loading — try again in a moment.");
    } catch (err) {
      setStatus({ loading: false, error: (err as Error).message });
    }
  }

  const [view, setView] = useState<"grid" | "bars">("grid");
  // Underline position, measured from the active tab so it fits any font or zoom.
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // Animate only when the tab actually changes, so the bar appears in place on load
  // (and isn't fooled by React re-running effects in development).
  const [indicator, setIndicator] = useState({ left: 0, width: 0, animate: false });
  const measuredView = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = tabRefs.current[view];
    if (!el) return;
    const changed = measuredView.current !== null && measuredView.current !== view;
    measuredView.current = view;
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth, animate: changed });
  }, [view]);
  const [hover, setHover] = useState<Hover | null>(null);
  const [picked, setPicked] = useState<Day | null>(null);
  const isRecent = period === "recent";
  const days = useMemo(() => buildDays(endDate, minutes, prs), [endDate, minutes, prs]);
  const weekCount = days.at(-1)!.week + 1;
  const scroller = useRef<HTMLDivElement>(null);

  const weeks = useMemo(() => {
    const out: Week[] = Array.from({ length: weekCount }, (_, w) => ({ week: w, start: new Date(0), minutes: 0, prs: 0, races: [] }));
    for (const d of days) {
      const w = out[d.week];
      if (w.start.getTime() === 0) w.start = new Date(d.date.getTime() - d.weekday * DAY_MS);
      w.minutes += d.minutes;
      w.prs += d.prs;
    }
    const weekOf = new Map(days.map((d) => [d.key, d.week]));
    for (const r of races) {
      const w = weekOf.get(r.date);
      if (w !== undefined) out[w].races.push(r);
    }
    return out;
  }, [days, weekCount, races]);

  // On narrow screens the chart scrolls; start at the most recent weeks.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [view, period, data]);

  const stats = useMemo(() => {
    let longest = 0;
    let run = 0;
    for (const d of days) {
      run = d.minutes > 0 ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    const sum = (from: number, to: number) => days.slice(from, to).reduce((s, d) => s + d.minutes, 0);
    const recent = sum(-FORM_DAYS, days.length);
    const before = sum(-2 * FORM_DAYS, -FORM_DAYS);
    const change = before > 0 ? (recent - before) / before : null;
    const form = change === null ? "New" : change > 0.1 ? "Building" : change < -0.1 ? "Tapering" : "Steady";
    return {
      totalHours: days.reduce((s, d) => s + d.minutes, 0) / 60,
      active: days.filter((d) => d.minutes > 0).length,
      longest,
      prs: days.reduce((s, d) => s + d.prs, 0),
      form,
      change,
      perWeek: recent / 60 / (FORM_DAYS / 7),
    };
  }, [days]);

  const months = days
    .filter((d) => d.date.getUTCDate() === 1 || d === days[0])
    .map((d) => ({ week: d.week, label: d.date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) }))
    .filter((m, i, arr) => i === 0 || m.week - arr[i - 1].week >= 3);

  const width = LEFT + weekCount * PITCH;
  const gridH = TOP + 7 * PITCH;
  const barsH = TOP + MARKS + 7 * PITCH;
  const base = barsH - 2;
  const plotTop = TOP + MARKS;
  const maxWeek = Math.max(60, ...weeks.map((w) => w.minutes));
  const barY = (m: number) => base - (m / maxWeek) * (base - plotTop);
  const hourTicks = [Math.round(maxWeek / 60 / 2), Math.round(maxWeek / 60)].filter((h, i, a) => h > 0 && a.indexOf(h) === i);

  const trend = stats.change === null ? "" : `${stats.change >= 0 ? "+" : ""}${Math.round(stats.change * 100)}%`;
  const caption = (() => {
    if (!hover) return null;
    if (hover.kind === "day") {
      const d = hover.day;
      return (
        <>
          <span className="text-foreground">{fmtDate(d.date)}</span> · {fmtDuration(d.minutes)}
          {d.prs > 0 && <> · {plural(d.prs, "PR")}</>}
        </>
      );
    }
    const w = hover.week;
    return (
      <>
        <span className="text-foreground">Week of {fmtShort(w.start)}</span> · {fmtDuration(w.minutes)}
        {w.prs > 0 && <> · {plural(w.prs, "PR")}</>}
        {w.races.map((r) => (
          <span key={r.date + r.name}> · Race: {r.name}</span>
        ))}
      </>
    );
  })();

  return (
    <div className="font-accent">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-line pb-2">
        <h2 className="display text-sm leading-none tracking-tight">Training calendar</h2>
        {/* Underline tabs: the active one's orange bar sits on the header rule and slides between tabs. */}
        <div role="tablist" aria-label="Calendar view" className="relative -mb-2 flex items-end gap-5 self-end">
          {(
            [
              ["grid", "Grid", LayoutGrid],
              ["bars", "Weekly", BarChart3],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              ref={(el) => {
                tabRefs.current[v] = el;
              }}
              role="tab"
              aria-selected={view === v}
              onClick={() => {
                setView(v);
                setHover(null);
              }}
              className={`flex items-center gap-1.5 pb-2 text-[11px] uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-strava/60 ${
                view === v ? "text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${view === v ? "text-strava" : ""}`} aria-hidden />
              {label}
            </button>
          ))}
          <span
            aria-hidden
            className={`absolute bottom-0 h-0.5 rounded-full bg-strava ${indicator.animate ? "transition-[left,width] duration-300 ease-out" : ""}`}
            style={{ left: indicator.left, width: indicator.width, opacity: indicator.width ? 1 : 0 }}
          />
        </div>
      </div>

      {/* Main column (stats, chart, day detail) with a controls sidebar on the right — above it on phones. */}
      <div className="flex flex-col gap-5 lg:flex-row lg:gap-8">
        <aside className={`shrink-0 lg:order-last lg:w-36 ${years.length ? "" : "hidden"}`}>
          {years.length > 0 && (
            // Years as a list: a sideways swipe row on phones, a vertical scroller beside the chart on desktop.
            <div
              role="listbox"
              aria-label="Period"
              className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:max-h-56 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:px-0 lg:pr-1"
            >
              {(["recent", ...years] as const).map((p) => {
                const active = period === p;
                return (
                  <button
                    key={p}
                    role="option"
                    aria-selected={active}
                    onClick={() => choose(p)}
                    className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-left text-[11px] uppercase tracking-wider tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-strava/60 ${
                      active ? "bg-strava font-medium text-[#140f0c]" : "text-muted hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    {p === "recent" ? "Last 12 months" : p}
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <div className="min-w-0 flex-1">
          <dl className="mb-4 flex flex-wrap gap-x-8 gap-y-2 text-xs">
            {isRecent && (
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-muted">Form</dt>
                <dd className="mt-0.5 text-base font-medium">
                  {stats.form}{" "}
                  {trend && (
                    <span className={stats.change! >= 0 ? "text-strava" : "text-muted"}>
                      {stats.change! >= 0 ? "↑" : "↓"} {trend}
                    </span>
                  )}
                </dd>
              </div>
            )}
            {(isRecent
              ? [
                  ["Last 6 weeks", `${stats.perWeek.toFixed(1)} h / week`],
                  ["PRs this year", String(stats.prs)],
                  ["Active days", `${stats.active} / ${days.length}`],
                  ["Longest streak", plural(stats.longest, "day")],
                ]
              : [
                  ["Total", `${Math.round(stats.totalHours).toLocaleString("en-US")} h`],
                  ["PRs", String(stats.prs)],
                  ["Races", String(races.length)],
                  ["Active days", `${stats.active} / ${days.length}`],
                  ["Longest streak", plural(stats.longest, "day")],
                ]
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] uppercase tracking-wider text-muted">{k}</dt>
                <dd className="mt-0.5 text-base font-medium">{v}</dd>
              </div>
            ))}
          </dl>

          {(status.loading || status.error) && !data && (
            <p role="status" className="mb-3 text-xs text-muted">
              {status.loading ? `Loading ${period} from Strava…` : status.error}
            </p>
          )}

          <div
            ref={scroller}
            className={`overflow-x-auto pb-1 transition-opacity ${data ? "" : "pointer-events-none opacity-30"}`}
            onMouseLeave={() => setHover(null)}
          >
            {/* Scales to the panel width; below ~640px it keeps a readable size and scrolls inside the panel. */}
            <svg
              viewBox={`0 0 ${width} ${view === "grid" ? gridH : barsH}`}
              className="block h-auto w-full min-w-[640px]"
              role="img"
              aria-label={view === "grid" ? "Training minutes per day over the last year" : "Training hours per week, with PRs and races marked"}
            >
              {months.map((m) => (
                <text key={`${m.week}-${m.label}`} x={LEFT + m.week * PITCH} y={11} fontSize="10" className="fill-muted">
                  {m.label}
                </text>
              ))}

              {view === "grid" ? (
                <>
                  {[
                    [1, "Mon"],
                    [3, "Wed"],
                    [5, "Fri"],
                  ].map(([row, label]) => (
                    <text key={label} x={0} y={TOP + (row as number) * PITCH + CELL - 2} fontSize="10" className="fill-muted">
                      {label}
                    </text>
                  ))}
                  {days.map((d) => {
                    const x = LEFT + d.week * PITCH;
                    const y = TOP + d.weekday * PITCH;
                    const active = hover?.kind === "day" && hover.day === d;
                    return (
                      <g
                        key={d.key}
                        onMouseEnter={() => setHover({ kind: "day", day: d })}
                        onClick={() => routesEnabled && d.minutes > 0 && setPicked(picked === d ? null : d)}
                        className={routesEnabled && d.minutes > 0 ? "cursor-pointer" : undefined}
                      >
                        <rect
                          x={x}
                          y={y}
                          width={CELL}
                          height={CELL}
                          rx={2.5}
                          fill={heatStep(d.minutes).color}
                          stroke={picked === d ? "var(--strava)" : active ? "var(--foreground)" : "none"}
                          strokeWidth={picked === d ? 2 : 1.5}
                        />
                        {d.prs > 0 && <circle cx={x + CELL / 2} cy={y + CELL / 2} r={2} className="fill-foreground" />}
                        <title>{`${fmtDate(d.date)} · ${fmtDuration(d.minutes)}${d.prs ? ` · ${plural(d.prs, "PR")}` : ""}`}</title>
                      </g>
                    );
                  })}
                </>
              ) : (
                <>
                  {hourTicks.map((h) => {
                    const y = barY(h * 60);
                    return (
                      <g key={h}>
                        <line x1={LEFT} x2={width} y1={y} y2={y} stroke="var(--line)" strokeDasharray="2 3" />
                        <text x={0} y={y + 3} fontSize="10" className="fill-muted">
                          {h}h
                        </text>
                      </g>
                    );
                  })}
                  <line x1={LEFT} x2={width} y1={base} y2={base} stroke="var(--line)" />
                  {weeks.map((w) => {
                    const x = LEFT + w.week * PITCH;
                    const y = barY(w.minutes);
                    const active = hover?.kind === "week" && hover.week === w;
                    const dim = hover?.kind === "week" && !active;
                    return (
                      <g key={w.week} onMouseEnter={() => setHover({ kind: "week", week: w })}>
                        {/* Hit target taller than the bar. */}
                        <rect x={x - GAP / 2} y={TOP} width={PITCH} height={base - TOP} fill="transparent" />
                        {w.minutes > 0 && <path d={barPath(x, y, CELL, base)} fill="var(--strava)" opacity={dim ? 0.45 : 1} />}
                        {w.prs > 0 && <circle cx={x + CELL / 2} cy={y - 5} r={w.prs >= 3 ? 3.5 : 2.5} className="fill-foreground" />}
                        {w.races.length > 0 && (
                          <path d={flagPath(x + CELL / 2 - 1, y - (w.prs > 0 ? 20 : 13))} fill="var(--foreground)" stroke="var(--foreground)" strokeWidth={1.2} />
                        )}
                        <title>{`Week of ${fmtShort(w.start)} · ${fmtDuration(w.minutes)}${w.prs ? ` · ${plural(w.prs, "PR")}` : ""}${w.races.map((r) => ` · Race: ${r.name}`).join("")}`}</title>
                      </g>
                    );
                  })}
                </>
              )}
            </svg>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted">
            <p aria-live="polite" className="min-h-4">
              {caption ?? (view === "grid" ? `Hover a day for details${routesEnabled ? " · click to see its route" : ""}` : "Hover a week for details")}
            </p>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-foreground" /> Personal record (PR)
              </span>
              {view === "bars" && (
                <span className="flex items-center gap-1.5">
                  <svg viewBox="0 0 8 9" className="h-2.5 w-2.5" aria-hidden>
                    <path d={flagPath(1, 0.5)} fill="var(--foreground)" stroke="var(--foreground)" strokeWidth={1.2} />
                  </svg>{" "}
                  Race
                </span>
              )}
              {view === "grid" && (
                <span className="flex items-center gap-1.5">
                  <span>Less</span>
                  {HEAT_STEPS.map((s) => (
                    <span key={s.label} title={s.label} className="h-3 w-3 rounded-[3px]" style={{ background: s.color }} />
                  ))}
                  <span>More</span>
                </span>
              )}
            </div>
          </div>
          {view === "grid" && picked && <DayRoutes key={picked.key} slug={slug} tier={tier} day={picked} view={previewView} onClose={() => setPicked(null)} />}
        </div>
      </div>
    </div>
  );
}

function errorMessage(status: number, message?: string): string {
  if (status === 429) return "Strava is busy right now — try again in a few minutes.";
  if (status === 401) return "This athlete needs to reconnect Strava before older years can load.";
  if (status === 404) return "No data for that year.";
  return message ?? "Couldn't load that year. Try again.";
}
