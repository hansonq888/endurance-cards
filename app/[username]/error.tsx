"use client";

import Link from "next/link";

export default function ProfileError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">The scouts hit a snag</h1>
      <p className="text-sm text-muted">
        We couldn&apos;t load this card right now — Strava may be rate limiting us. Try again in a few minutes.
      </p>
      {error.digest && <p className="text-xs text-muted">Ref: {error.digest}</p>}
      <div className="flex gap-2">
        <button onClick={reset} className="rounded-lg bg-strava px-4 py-2 text-sm font-semibold text-white">
          Retry
        </button>
        <Link href="/" className="rounded-lg border border-line px-4 py-2 text-sm">
          Home
        </Link>
      </div>
    </main>
  );
}
