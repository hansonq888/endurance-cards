"use client";

import { Check, Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CardSettings } from "@/types/player";
import { visibilityOption, VISIBILITY_OPTIONS } from "./visibilityOptions";

/** Owner-only (inside CardSettingsPanel): who can see the card, which sections visitors get, and the share link. */
export function VisibilitySettings({
  slug,
  settings: initial,
  origin,
  publicSlug,
}: {
  slug: string;
  settings: CardSettings;
  origin: string;
  publicSlug: string;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  async function update(patch: Partial<CardSettings> & { resetLink?: boolean }) {
    setSaving(true);
    setError(null);
    const previous = settings;
    if (!patch.resetLink) setSettings({ ...settings, ...patch });
    try {
      const res = await fetch(`/api/scout/${encodeURIComponent(slug)}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      const next: CardSettings = await res.json();
      setSettings(next);
      // Reset the link while viewing through the old one? That URL is dead now, so move to the new one.
      if (patch.resetLink && window.location.pathname === `/${previous.shareToken}`) {
        router.replace(`/${next.shareToken}`);
      } else {
        startTransition(() => router.refresh());
      }
    } catch {
      setSettings(previous);
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const link =
    settings.visibility === "public"
      ? `${origin}/${publicSlug}`
      : settings.visibility === "unlisted"
        ? `${origin}/${settings.shareToken}`
        : null;

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link", link);
    }
  }

  const current = visibilityOption(settings.visibility);
  const toggle = "flex w-full items-center justify-between gap-3 py-2 text-left text-xs disabled:opacity-50";

  return (
    <div className="text-left font-accent">
      <p className="mb-2 text-[10px] uppercase tracking-wider text-muted">Who can see it</p>
      <div role="radiogroup" aria-label="Card visibility" className="grid grid-cols-3 gap-1 rounded-lg border border-line p-1">
        {VISIBILITY_OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={settings.visibility === value}
            disabled={saving}
            onClick={() => settings.visibility !== value && update({ visibility: value })}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] uppercase tracking-wider transition-colors ${
              settings.visibility === value ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">{current.help}</p>

      {link && (
        <div className="mt-3 flex items-stretch gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-line px-2.5 py-1.5 text-[11px]">{link}</code>
          <button type="button" onClick={copy} className="flex items-center gap-1 rounded-md border border-line px-2.5 text-[11px] hover:bg-surface-2" aria-label="Copy link">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          {settings.visibility === "unlisted" && (
            <button
              type="button"
              disabled={saving}
              onClick={() => confirm("Make a new link? The old one will stop working for everyone.") && update({ resetLink: true })}
              className="flex items-center gap-1 rounded-md border border-line px-2.5 text-[11px] hover:bg-surface-2"
              aria-label="Reset link"
              title="Reset link"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {settings.visibility !== "private" && (
        <div className="mt-3 divide-y divide-line border-t border-line">
          <button type="button" disabled={saving} className={toggle} onClick={() => update({ showCalendar: !settings.showCalendar })} aria-pressed={settings.showCalendar}>
            <span>
              Training calendar & races
              <span className="block text-[10px] text-muted">Shows which days you train</span>
            </span>
            {settings.showCalendar ? <Eye className="h-4 w-4 text-strava" aria-label="Visible" /> : <EyeOff className="h-4 w-4 text-muted" aria-label="Hidden" />}
          </button>
          <button
            type="button"
            disabled={saving || !settings.showCalendar}
            className={toggle}
            onClick={() => update({ showRoutes: !settings.showRoutes })}
            aria-pressed={settings.showRoutes}
          >
            <span>
              Route shapes on the calendar
              <span className="block text-[10px] text-muted">Shapes only, never placed on a map</span>
            </span>
            {settings.showRoutes && settings.showCalendar ? <Eye className="h-4 w-4 text-strava" aria-label="Visible" /> : <EyeOff className="h-4 w-4 text-muted" aria-label="Hidden" />}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}
      <p className="mt-2 text-[10px] text-muted">Only changes what visitors see. You always see everything.</p>
    </div>
  );
}
