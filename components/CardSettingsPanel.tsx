import { Eye, Settings2 } from "lucide-react";
import Link from "next/link";
import { visibleShare, visitorAudience, type PrivacyMix } from "@/lib/audience";
import type { CardSettings } from "@/types/player";
import { visibilityOption } from "./visibilityOptions";
import { OwnerActions } from "./OwnerActions";
import { VisibilitySettings } from "./VisibilitySettings";

/**
 * Owner-only settings, folded into one row under the card: shows who can see
 * the card, and opens to visibility, the share link, section toggles and
 * account actions. Collapsed by default so the card stays the focus.
 */
export function CardSettingsPanel({
  slug,
  settings,
  origin,
  privacy,
  pagePath,
}: {
  slug: string;
  settings: CardSettings;
  origin: string;
  /** The owner card's Strava visibility mix; absent on cards scouted before audiences existed. */
  privacy?: PrivacyMix;
  /** This page's path, for the "preview" link. */
  pagePath: string;
}) {
  const { label, icon: Icon } = visibilityOption(settings.visibility);
  return (
    <details className="group rounded-xl border border-line font-accent open:bg-surface/40">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-[11px] uppercase tracking-wider text-muted select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        <Settings2 className="h-3.5 w-3.5" aria-hidden />
        Card settings
        <span className="ml-auto flex items-center gap-1.5 text-foreground">
          <Icon className="h-3.5 w-3.5 text-strava" aria-hidden />
          {label}
        </span>
        <span className="text-muted transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
      </summary>
      <div className="space-y-4 border-t border-line px-3.5 pb-3.5 pt-3">
        <VisibilitySettings slug={slug} settings={settings} origin={origin} publicSlug={slug} />
        {privacy && <WhatVisitorsSee settings={settings} privacy={privacy} pagePath={pagePath} />}
        <div className="border-t border-line pt-3">
          <OwnerActions slug={slug} />
        </div>
      </div>
    </details>
  );
}

const activities = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "activity" : "activities"}`;

/**
 * Explains the audience rule with the owner's own numbers: which of their
 * activities the current visitors can see (lib/audience.ts), why the starting
 * visibility was picked, and a link to preview the visitor's version.
 */
function WhatVisitorsSee({ settings, privacy, pagePath }: { settings: CardSettings; privacy: PrivacyMix; pagePath: string }) {
  const [everyone, followers, onlyMe] = privacy.activities;
  const total = everyone + followers + onlyMe;
  const audience = visitorAudience(settings.visibility);
  const seen = audience === "public" ? everyone : everyone + followers;
  const who = audience === "public" ? "Anyone sees" : "People with your link see";
  const setTo = audience === "public" ? "Everyone" : "Everyone or Followers";
  const pct = (share: number) => `${Math.round(share * 100)}%`;

  return (
    <div className="space-y-1.5 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
      <p className="text-[10px] uppercase tracking-wider">What visitors see</p>
      {audience === null ? (
        <p>Only you can see your card.</p>
      ) : (
        <>
          <p>
            <span className="text-foreground">{who}</span> a card built from{" "}
            <span className="text-foreground">
              {seen.toLocaleString("en-US")} of {activities(total)}
            </span>
            : the ones set to {setTo} on Strava.
          </p>
          {seen === 0 && <p className="text-red-300/90">None of your activities are visible to them on Strava, so they&apos;ll see “not found”.</p>}
        </>
      )}
      {onlyMe > 0 && (
        <p>
          {activities(onlyMe)} set to “Only You” on Strava {onlyMe === 1 ? "counts" : "count"} only for you.
        </p>
      )}
      {settings.autoVisibility && audience !== null && (
        <p>
          Set to {audience === "public" ? "Public" : "Link only"} from your Strava privacy:{" "}
          {pct(visibleShare(privacy, audience))} of your training is visible to {audience === "public" ? "everyone" : "followers"} there.
        </p>
      )}
      {settings.autoVisibility && audience === null && <p>Set to Private because most of your training is “Only You” on Strava.</p>}
      <div className="flex gap-4 pt-1">
        {(["public", "link"] as const).map((a) => (
          <Link key={a} href={`${pagePath}?view=${a}`} className="flex items-center gap-1.5 uppercase tracking-wider text-foreground hover:text-strava">
            <Eye className="h-3.5 w-3.5" aria-hidden /> Preview {a === "public" ? "public" : "link"} view
          </Link>
        ))}
      </div>
    </div>
  );
}
