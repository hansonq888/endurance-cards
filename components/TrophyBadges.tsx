"use client";

import { useState } from "react";
import { TrophyBadge } from "./TrophyBadge";

export interface BadgeItem {
  id: string;
  name: string;
  level: 0 | 1 | 2 | 3;
  description: string;
  /** Owner only: "55 / 150 PRs to III". */
  progressText?: string;
  /** Owner only: 0–1 toward the next level. */
  progress?: number;
}

/** Badge grid with a detail line for the hovered / focused / tapped badge. */
export function TrophyBadges({ items }: { items: BadgeItem[] }) {
  const [active, setActive] = useState<BadgeItem | null>(null);
  const shown = active ?? null;

  return (
    <div className="font-accent">
      <ul className="grid grid-cols-4 gap-x-2 gap-y-4" onMouseLeave={() => setActive(null)}>
        {items.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              onMouseEnter={() => setActive(b)}
              onFocus={() => setActive(b)}
              onClick={() => setActive(active?.id === b.id ? null : b)}
              className={`flex w-full flex-col items-center gap-2 rounded-lg py-1 transition-opacity ${b.level === 0 ? "opacity-45 hover:opacity-80" : ""}`}
              aria-label={`${b.name}${b.level ? ` level ${"I".repeat(b.level)}` : " (locked)"}: ${b.description}`}
            >
              <TrophyBadge id={b.id} level={b.level} progress={b.progress} size={56} />
              <span className="line-clamp-2 text-center text-[10px] uppercase leading-tight tracking-wider">{b.name}</span>
            </button>
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="mt-4 min-h-8 border-t border-line pt-3 text-[11px] leading-snug text-muted">
        {shown ? (
          <>
            <span className="text-foreground">{shown.name}</span>
            {shown.level > 0 ? ` ${"I".repeat(shown.level)}` : " · locked"} · {shown.description}
            {shown.progressText && <span className="block text-strava">{shown.progressText}</span>}
          </>
        ) : (
          "Hover or tap a badge for details"
        )}
      </p>
    </div>
  );
}
