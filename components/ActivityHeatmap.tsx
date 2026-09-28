"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CardTier, RaceResult, RouteShape, YearCalendar } from "@/types/player";
import { holoVars } from "@/lib/card-theme";
import { fmtDuration, HEAT_STEPS, heatStep, SPORT_COLORS, SPORT_LABELS } from "@/lib/viz";

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
}: {
  slug: string;
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
        const res = await fetch(`/api/scout/${encodeURIComponent(slug)}/calendar?year=${next}`);
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
        <div className="flex items-center gap-2">
          {years.length > 0 && (
            <label className="flex items-center">
              <span className="sr-only">Period</span>
              <select
                value={String(period)}
                onChange={(e) => choose(e.target.value === "recent" ? "recent" : Number(e.target.value))}
                className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] uppercase tracking-wider text-foreground"
              >
                <option value="recent">Last 12 months</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div role="tablist" aria-label="Calendar view" className="flex rounded-md border border-line p-0.5 text-[11px] uppercase tracking-wider">
            {(["grid", "bars"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => {
                  setView(v);
                  setHover(null);
                }}
                className={`rounded px-2.5 py-1 transition-colors ${view === v ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"}`}
              >
                {v === "grid" ? "Grid" : "Weekly bars"}
              </button>
            ))}
          </div>
        </div>
      </div>

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
      {view === "grid" && picked && <DayRoutes key={picked.key} slug={slug} tier={tier} day={picked} onClose={() => setPicked(null)} />}
    </div>
  );
}

function errorMessage(status: number, message?: string): string {
  if (status === 429) return "Strava is busy right now — try again in a few minutes.";
  if (status === 401) return "This athlete needs to reconnect Strava before older years can load.";
  if (status === 404) return "No data for that year.";
  return message ?? "Couldn't load that year. Try again.";
}

const fmtClock = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

function shapePath(points: number[], size: number, pad: number) {
  const s = size - pad * 2;
  let d = "";
  for (let i = 0; i < points.length; i += 2) d += `${i ? "L" : "M"}${(pad + points[i] * s).toFixed(1)} ${(pad + points[i + 1] * s).toFixed(1)}`;
  return d;
}

/** Client-side cache so re-clicking a day is instant. */
const routeCache = new Map<string, RouteShape[]>();

/** The clicked day's route(s): shape only, fetched on demand. */
function DayRoutes({ slug, tier, day, onClose }: { slug: string; tier: CardTier; day: Day; onClose: () => void }) {
  const cacheKey = `${slug}:${day.key}`;
  const [state, setState] = useState<{ routes: RouteShape[] | null; error: string | null }>(() => ({
    routes: routeCache.get(cacheKey) ?? null,
    error: null,
  }));
  const [index, setIndex] = useState(0);

  // Parent remounts this per day (key), so only the uncached fetch lives here.
  useEffect(() => {
    if (routeCache.has(cacheKey)) return;
    let cancelled = false;
    fetch(`/api/scout/${encodeURIComponent(slug)}/routes?date=${day.key}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message ?? "Couldn't load this day's route.");
        routeCache.set(cacheKey, body.routes);
        if (!cancelled) setState({ routes: body.routes, error: null });
      })
      .catch((err: Error) => !cancelled && setState({ routes: null, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [slug, day.key, cacheKey]);

  const routes = state.routes;
  const route = routes?.[index];

  // Foil sheen follows the pointer across the route window.
  function sheen(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    e.currentTarget.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
  }

  return (
    <div className="mt-5 flex flex-col gap-6 border-t border-line pt-5 sm:flex-row sm:items-center" style={holoVars(tier)}>
      {/* The route floats on a soft tier-tinted glow — no frame. */}
      <div onPointerMove={sheen} className="group relative aspect-square w-full max-w-[200px] shrink-0 self-center sm:self-auto">
        <div
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--holo-1) 12%, transparent), transparent 65%)" }}
        />
        {route ? (
          <svg viewBox="0 0 100 100" className="relative h-full w-full" role="img" aria-label={`Route shape of ${route.name}`}>
            <defs>
              <linearGradient id={`holo-${day.key}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" style={{ stopColor: "var(--holo-1)" }} />
                <stop offset="0.35" style={{ stopColor: "var(--holo-2)" }} />
                <stop offset="0.65" style={{ stopColor: "var(--holo-3)" }} />
                <stop offset="1" style={{ stopColor: "var(--holo-4)" }} />
              </linearGradient>
            </defs>
            <path
              d={shapePath(route.points, 100, 14)}
              fill="none"
              stroke={`url(#holo-${day.key})`}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                filter:
                  "drop-shadow(0 0 3px color-mix(in srgb, var(--holo-2) 60%, transparent)) drop-shadow(0 0 8px color-mix(in srgb, var(--holo-4) 40%, transparent))",
              }}
            />
          </svg>
        ) : (
          <div className="relative flex h-full items-center justify-center px-6 text-center text-[11px] text-muted">
            {state.error ?? (routes ? "No GPS route (indoor, pool or manual)" : "Loading…")}
          </div>
        )}
        <div
          aria-hidden
          className="holo-foil pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-70"
          style={{ maskImage: "radial-gradient(circle, black 35%, transparent 70%)", WebkitMaskImage: "radial-gradient(circle, black 35%, transparent 70%)" }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] uppercase tracking-wider text-muted">{fmtDate(day.date)}</p>
          <button type="button" onClick={onClose} className="text-[11px] uppercase tracking-wider text-muted hover:text-foreground">
            Close
          </button>
        </div>
        {route ? (
          <>
            <p className="display mt-1 truncate text-xl leading-tight">{route.name}</p>
            <p className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: SPORT_COLORS[route.family] }} aria-hidden />
              {SPORT_LABELS[route.family]}
              {route.prs > 0 && <span className="text-strava">· {route.prs === 1 ? "1 PR" : `${route.prs} PRs`}</span>}
            </p>
            <p className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
              {[
                [String(route.distanceKm), "km"],
                [fmtClock(route.movingTime), "time"],
                [route.elevationM.toLocaleString("en-US"), "m up"],
              ].map(([v, u]) => (
                <span key={u}>
                  <span className="display text-3xl leading-none">{v}</span>
                  <span className="ml-1 align-top text-[10px] text-muted">{u}</span>
                </span>
              ))}
            </p>
          </>
        ) : (
          <p className="display mt-1 text-xl">{fmtDuration(day.minutes)} of training</p>
        )}
        {routes && routes.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-5" role="tablist" aria-label="Activities this day">
            {routes.map((r, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                onClick={() => setIndex(i)}
                className={`group flex flex-col items-start gap-1 transition-opacity ${i === index ? "" : "opacity-55 hover:opacity-100"}`}
              >
                <span className="flex items-center gap-2">
                  <svg viewBox="0 0 100 100" className="h-7 w-7" aria-hidden>
                    <path d={shapePath(r.points, 100, 12)} fill="none" stroke={SPORT_COLORS[r.family]} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-left text-[10px] leading-tight">
                    <span className="block uppercase tracking-wider text-muted">{SPORT_LABELS[r.family]}</span>
                    <span className="block tabular-nums">{r.distanceKm} km</span>
                  </span>
                </span>
                {/* Foil underline marks the selected activity. */}
                <span
                  aria-hidden
                  className={`h-0.5 w-full rounded-full ${i === index ? "" : "invisible"}`}
                  style={{ background: "linear-gradient(90deg, var(--holo-1), var(--holo-2), var(--holo-3), var(--holo-4))" }}
                />
              </button>
            ))}
          </div>
        )}
        <p className="mt-3 text-[10px] text-muted">Shape only: trimmed at both ends and never placed on a map.</p>
      </div>
    </div>
  );
}
