"use client";

import { ArrowRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Look up a card by Strava username (or a Strava profile link). Only finds
 * cards set to Public; link-only and private cards answer "not found".
 */
export function FindCard({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/find?q=${encodeURIComponent(q.trim())}`);
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.path) router.push(body.path);
      else setError(body.message ?? "No public card found for that username.");
    } catch {
      setError("Couldn't search right now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} role="search" className={`font-accent ${className}`}>
      <label htmlFor="find-card" className="text-[11px] uppercase tracking-wider text-muted">
        Find a friend&apos;s card
      </label>
      <div className="mt-2 flex max-w-sm items-center rounded-lg border border-line bg-surface/60 focus-within:border-strava/60">
        <Search className="ml-3 h-4 w-4 shrink-0 text-muted" aria-hidden />
        <input
          id="find-card"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setError(null);
          }}
          placeholder="Strava username"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent px-2.5 py-2.5 text-sm outline-none placeholder:text-muted/70"
        />
        <button
          type="submit"
          disabled={busy || !q.trim()}
          aria-label="Find card"
          className="mr-1 flex h-8 w-8 items-center justify-center rounded-md text-strava transition-colors hover:bg-surface-2 disabled:text-muted disabled:opacity-50"
        >
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[11px] text-muted">
          {error}
        </p>
      )}
    </form>
  );
}
