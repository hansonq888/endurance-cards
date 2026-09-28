import type { AttributeKey } from "@/types/player";
import { STAT_ICONS } from "./StatIcons";

export interface StatEquationItem {
  key: AttributeKey;
  name: string;
  short: string;
  weight: number;
  how: string;
  tip: string;
}

/**
 * OVR = six weighted stats. The equation line carries the weights; each tile
 * explains one stat in full — no clicks, no tooltips.
 */
export function StatEquation({ items }: { items: StatEquationItem[] }) {
  return (
    <div className="font-accent">
      {/* The sum at a glance: OVR = chips joined by "+". */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <span className="display text-5xl leading-none text-strava">OVR</span>
        <span className="text-3xl text-muted">=</span>
        {items.map((s, i) => (
          <span key={s.key} className="flex items-center gap-3">
            {i > 0 && (
              <span className="text-lg text-muted" aria-hidden>
                +
              </span>
            )}
            <span className="rounded-full border border-line px-3 py-1 text-xs tabular-nums">
              {s.key} <span className="text-muted">{s.weight}%</span>
            </span>
          </span>
        ))}
      </div>

      <ul className="mt-10 grid grid-cols-1 gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((s) => {
          const Icon = STAT_ICONS[s.key];
          return (
            <li key={s.key} className="reveal flex gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2">
                <Icon className="h-5 w-5 text-strava" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="flex items-baseline gap-2">
                  <span className="display text-lg leading-none">{s.name}</span>
                  <span className="text-[11px] tracking-wider text-muted">{s.key}</span>
                </p>
                <p className="mt-1.5 text-sm">{s.short}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{s.how}</p>
                <p className="mt-2 text-xs">
                  <span className="mr-1.5 text-strava" aria-hidden>
                    ↑
                  </span>
                  {s.tip}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
