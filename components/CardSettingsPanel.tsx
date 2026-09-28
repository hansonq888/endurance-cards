import { Settings2 } from "lucide-react";
import type { PrivacyMix } from "@/lib/audience";
import type { CardSettings } from "@/types/player";
import { visibilityOption } from "./visibilityOptions";
import { OwnerActions } from "./OwnerActions";
import { VisibilitySettings } from "./VisibilitySettings";

/**
 * Owner-only settings, folded into one row under the card: shows who can see
 * the card, and opens to visibility, the share link, what visitors see and
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
      <div className="space-y-3 border-t border-line px-3.5 pb-3.5 pt-3">
        <VisibilitySettings slug={slug} settings={settings} origin={origin} privacy={privacy} pagePath={pagePath} />
        <div className="border-t border-line pt-3">
          <OwnerActions slug={slug} />
        </div>
      </div>
    </details>
  );
}
