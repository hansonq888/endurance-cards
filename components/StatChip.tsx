import type { AttributeKey } from "@/types/player";
import { STAT_ICONS } from "./StatIcons";

/** A bold stat tag: icon + key in the display face, optionally its weight in the overall. */
export function StatChip({ statKey, weight, size = "md" }: { statKey: AttributeKey; weight?: number; size?: "md" | "lg" }) {
  const Icon = STAT_ICONS[statKey];
  const lg = size === "lg";
  return (
    <span
      className={`inline-flex items-center rounded-lg border border-strava/35 bg-strava/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${
        lg ? "gap-2 px-3.5 py-2" : "gap-1.5 px-3 py-1.5"
      }`}
    >
      <Icon className={`${lg ? "h-4 w-4" : "h-3.5 w-3.5"} text-strava`} aria-hidden />
      <span className={`display leading-none tracking-tight ${lg ? "text-xl" : "text-base"}`}>{statKey}</span>
      {weight !== undefined && <span className={`font-accent tabular-nums text-muted ${lg ? "text-xs" : "text-[11px]"}`}>{weight}%</span>}
    </span>
  );
}
