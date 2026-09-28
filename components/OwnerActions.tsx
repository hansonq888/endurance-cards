"use client";

import { LogOut, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function OwnerActions({ slug }: { slug: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<"rescout" | "delete" | null>(null);
  const [, startTransition] = useTransition();

  async function rescout() {
    setBusy("rescout");
    setMessage(null);
    try {
      const res = await fetch(`/api/scout/${encodeURIComponent(slug)}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message ?? "Re-scout failed");
      } else {
        setMessage("Card updated with your latest activities.");
        startTransition(() => router.refresh());
      }
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("Remove your card and disconnect Strava? This deletes everything we stored.")) return;
    setBusy("delete");
    const res = await fetch(`/api/scout/${encodeURIComponent(slug)}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/?removed=1");
    } else {
      setBusy(null);
      setMessage("Could not remove your card. Try again.");
    }
  }

  const btn = "flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-50";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={rescout} disabled={busy !== null} className={btn}>
          <RefreshCw className={`h-4 w-4 ${busy === "rescout" ? "animate-spin" : ""}`} aria-hidden />
          {busy === "rescout" ? "Scouting…" : "Re-scout"}
        </button>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className={btn}>
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </form>
        <button type="button" onClick={remove} disabled={busy !== null} className={`${btn} text-red-300`}>
          <Trash2 className="h-4 w-4" aria-hidden /> Remove card
        </button>
      </div>
      {message && (
        <p className="text-sm text-muted" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
