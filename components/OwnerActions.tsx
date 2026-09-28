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

  // Quiet text buttons: these live at the bottom of the settings panel, not beside the share buttons.
  const btn = "flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted transition-colors hover:text-foreground disabled:opacity-50";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <button type="button" onClick={rescout} disabled={busy !== null} className={btn}>
          <RefreshCw className={`h-3.5 w-3.5 ${busy === "rescout" ? "animate-spin" : ""}`} aria-hidden />
          {busy === "rescout" ? "Scouting…" : "Refresh now"}
        </button>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className={btn}>
            <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
          </button>
        </form>
        <button type="button" onClick={remove} disabled={busy !== null} className={`${btn} ml-auto !text-red-300/80 hover:!text-red-300`}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove card
        </button>
      </div>
      {message && (
        <p className="text-[11px] text-muted" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
