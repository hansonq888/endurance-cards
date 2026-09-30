"use client";

import { useEffect, useState } from "react";
import type { RouteShape } from "@/types/player";
import { fmtDuration, SPORT_COLORS, SPORT_LABELS } from "@/lib/viz";

/** The calendar day a route panel is for. */
export interface RouteDay {
  key: string; // YYYY-MM-DD
  date: Date;
  minutes: number;
}

const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

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
export function DayRoutes({
  slug,
  day,
  onClose,
}: {
  slug: string;
  day: RouteDay;
  onClose: () => void;
}) {
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

  return (
    <div className="mt-5 flex flex-col gap-6 border-t border-line pt-5 sm:flex-row sm:items-center">
      <div className="relative aspect-square w-full max-w-[200px] shrink-0 self-center sm:self-auto">
        {/* A soft pool of the sport's colour behind the route. */}
        {route && (
          <div
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{ background: `radial-gradient(circle, color-mix(in srgb, ${SPORT_COLORS[route.family]} 16%, transparent), transparent 65%)` }}
          />
        )}
        {route ? (
          <svg viewBox="0 0 100 100" className="relative h-full w-full" role="img" aria-label={`Route shape of ${route.name}`}>
            <path
              d={shapePath(route.points, 100, 14)}
              fill="none"
              stroke={SPORT_COLORS[route.family]}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              // Glow in the route's own colour (no foil or gradient).
              style={{
                filter: `drop-shadow(0 0 2.5px ${SPORT_COLORS[route.family]}) drop-shadow(0 0 8px color-mix(in srgb, ${SPORT_COLORS[route.family]} 55%, transparent))`,
              }}
            />
          </svg>
        ) : (
          <div className="relative flex h-full items-center justify-center px-6 text-center text-[11px] text-muted">
            {state.error ?? (routes ? "No GPS route (indoor, pool or manual)" : "Loading…")}
          </div>
        )}
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
                {/* Underline marks the selected activity. */}
                <span aria-hidden className={`h-0.5 w-full rounded-full bg-strava ${i === index ? "" : "invisible"}`} />
              </button>
            ))}
          </div>
        )}
        <p className="mt-3 text-[10px] text-muted">Shape only: trimmed at both ends and never placed on a map.</p>
      </div>
    </div>
  );
}
