"use client";

import { useCallback, useRef, useState } from "react";
import type { YearCalendar } from "@/types/player";

/** Where one past year's calendar is: loading, loaded, or failed with a message to show. */
export type YearState = { loading: true } | { loading: false; data: YearCalendar } | { loading: false; error: string };

/**
 * Past years of the training calendar, fetched on demand and kept per year, so
 * switching years mid-load never shows one year's spinner or error on another.
 */
export function useYearCalendar(slug: string) {
  const [years, setYears] = useState<Record<number, YearState>>({});
  const inFlight = useRef(new Set<number>());

  const load = useCallback(
    async (year: number) => {
      if (inFlight.current.has(year)) return;
      inFlight.current.add(year);
      const set = (state: YearState) => setYears((y) => ({ ...y, [year]: state }));
      set({ loading: true });
      try {
        for (let attempt = 0; attempt < 5; attempt++) {
          const res = await fetch(`/api/scout/${encodeURIComponent(slug)}/calendar?year=${year}`);
          if (res.status === 409) {
            // Someone else is loading this year right now — wait for their result.
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(errorMessage(res.status, body.message));
          // Loaded years stay in flight for good: there's nothing more to fetch.
          return set({ loading: false, data: body as YearCalendar });
        }
        throw new Error("Still loading — try again in a moment.");
      } catch (err) {
        inFlight.current.delete(year); // picking the year again retries
        set({ loading: false, error: (err as Error).message });
      }
    },
    [slug],
  );

  return { years, load };
}

function errorMessage(status: number, message?: string): string {
  if (status === 429) return "Strava is busy right now — try again in a few minutes.";
  if (status === 401) return "This athlete needs to reconnect Strava before older years can load.";
  if (status === 404) return "No data for that year.";
  return message ?? "Couldn't load that year. Try again.";
}
