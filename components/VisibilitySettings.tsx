"use client";

import { Check, Copy, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PrivacyMix } from "@/lib/sharing";
import type { CardSettings } from "@/types/player";
import { visibilityOption, VISIBILITY_OPTIONS } from "./visibilityOptions";

/**
 * Owner-only (inside CardSettingsPanel): who can see the card, the secret link,
 * which sections visitors see, and a note about Only You activities.
 */
export function VisibilitySettings({
  slug,
  settings: initial,
  origin,
  privacy,
}: {
  slug: string;
  settings: CardSettings;
  origin: string;
  /** The athlete's Strava visibility mix, for the Only You note. */
  privacy?: PrivacyMix;
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

  // The secret link is how a card is shared; private cards have none to show.
  const link = settings.visibility === "unlisted" ? `${origin}/${settings.shareToken}` : null;

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
  const onlyMe = privacy?.activities[2] ?? 0;
  const shareable = settings.visibility === "unlisted";

  return (
    <div className="space-y-3 text-left font-accent">
      <div role="radiogroup" aria-label="Who can see your card" className="grid grid-cols-2 gap-1 rounded-lg border border-line p-1">
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
      <p className="text-[11px] leading-relaxed text-muted">{current.help}</p>

      {link && (
        <div className="flex items-stretch gap-1.5">
          <code className="min-w-0 flex-1 truncate rounded-md border border-line px-2.5 py-1.5 text-[11px]">{link}</code>
          <button type="button" onClick={copy} className={iconBtn} aria-label="Copy link" title="Copy link">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => confirm("Make a new link? The old one will stop working for everyone.") && update({ resetLink: true })}
            className={iconBtn}
            aria-label="Make a new link"
            title="Make a new link"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {shareable && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-muted">Show visitors</span>
          <Switch label="Calendar" on={settings.showCalendar} disabled={saving} onChange={() => update({ showCalendar: !settings.showCalendar })} />
          <Switch
            label="Routes"
            on={settings.showCalendar && settings.showRoutes}
            disabled={saving || !settings.showCalendar}
            onChange={() => update({ showRoutes: !settings.showRoutes })}
          />
        </div>
      )}
      {/* Only You activities are left out for everyone, the athlete included (lib/sharing.ts). */}
      {onlyMe > 0 && (
        <p className="text-[11px] leading-relaxed text-muted">
          {onlyMe === 1 ? "1 activity is" : `${onlyMe.toLocaleString("en-US")} activities are`} set to “Only You” on Strava, so{" "}
          {onlyMe === 1 ? "it isn’t" : "they aren’t"} on your card.
        </p>
      )}
      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  );
}

const iconBtn = "flex items-center rounded-md border border-line px-2.5 text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-50";

/** A small labelled on/off pill. */
function Switch({ label, on, disabled, onChange }: { label: string; on: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onChange}
      className={`flex items-center gap-2 rounded-full border px-2.5 py-1 transition-colors disabled:opacity-40 ${
        on ? "border-strava/50 text-foreground" : "border-line text-muted"
      }`}
    >
      <span className={`relative h-3 w-5 rounded-full transition-colors ${on ? "bg-strava" : "bg-white/15"}`} aria-hidden>
        <span className={`absolute top-0.5 h-2 w-2 rounded-full bg-white transition-all ${on ? "left-2.5" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}
