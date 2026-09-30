import type { CSSProperties } from "react";
import { PoweredByStrava } from "@/components/StravaBrand";
import type { Metadata } from "next";
import { Wordmark } from "@/components/Wordmark";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { EmbedSnippet } from "@/components/EmbedSnippet";
import { PlayerCard } from "@/components/PlayerCard";
import { ShareBar } from "@/components/ShareBar";
import { TiltCard } from "@/components/TiltCard";
import { CardSettingsPanel } from "@/components/CardSettingsPanel";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { RaceLog, RatingTrend, SportMix, StatBreakdown, TrophyCabinet } from "@/components/ScoutReport";
import { calendarYears } from "@/lib/calendar";
import { holoVars, TIER_THEMES } from "@/lib/card-theme";
import { NotFoundError } from "@/lib/errors";
import { getCardBySlug } from "@/lib/scout";
import { isMeasured } from "@/lib/engine";
import { ATTRIBUTE_KEYS } from "@/types/player";
import { getSessionAthleteId } from "@/lib/session";
import { publicOrigin } from "@/lib/url";

/** A malformed %-sequence in the URL is just an unknown slug (404), not a crash. */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Loads the card as the current viewer sees it (visibility rules in lib/access.ts). */
const loadCard = cache(async (slug: string) => {
  try {
    return await getCardBySlug(safeDecode(slug), await getSessionAthleteId());
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
});

export async function generateMetadata({ params }: PageProps<"/[username]">): Promise<Metadata> {
  const { username } = await params;
  const { card, viewer } = await loadCard(username);
  const title = `${card.name} — ${card.overall} ${TIER_THEMES[card.tier].label}`;
  const image = `/${encodeURIComponent(viewer.shareSlug)}.png`;
  return {
    title,
    // Cards are shared by private link: never index them.
    robots: { index: false, follow: false },
    description: `${card.archetype} · ${card.position} · ${ATTRIBUTE_KEYS.map((k) => `${k} ${isMeasured(card.attributes[k]) ? card.attributes[k].value : "–"}`).join(" ")}`,
    openGraph: { title, images: [{ url: image, width: 688, height: 940 }] },
    twitter: { card: "summary_large_image", title, images: [image] },
  };
}

export default async function ProfilePage({ params }: PageProps<"/[username]">) {
  const { username } = await params;
  const [{ card, stale, viewer }, origin] = await Promise.all([loadCard(username), publicOrigin()]);
  const { settings, isOwner } = viewer;
  // The slug this page was opened with: API calls from the page must use it (it may be the secret link).
  const viewSlug = safeDecode(username);
  const share = encodeURIComponent(viewer.shareSlug);
  const pageUrl = `${origin}/${share}`;
  const imageUrl = `${origin}/${share}.png`;
  const isPrivate = settings.visibility === "private";
  const showCalendar = isOwner || settings.showCalendar;
  const scouted = new Date(card.scoutedAt);

  return (
    <main className="mx-auto w-full max-w-[1320px] flex-1 overflow-x-clip px-4 py-8 sm:py-12">
      <nav className="mb-8 flex items-center justify-between">
        <Wordmark />
        <div className="flex items-center gap-5">
          <Link href="/guide" className="font-accent text-xs uppercase tracking-wider text-muted hover:text-foreground">
            How it works
          </Link>
          <a
            href={`https://www.strava.com/athletes/${card.athleteId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-strava hover:underline"
          >
            View on Strava
          </a>
        </div>
      </nav>

      {/* Card in the centre, supporting detail on either side (stacked below it on small screens). */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)_minmax(0,1fr)] lg:gap-6">
        <section className="relative order-first flex flex-col items-center lg:order-none lg:col-start-2 lg:row-start-1">
          <div
            aria-hidden
            className="glow-in pointer-events-none absolute left-1/2 top-[40%] h-[70%] w-[140%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(closest-side, rgba(252,76,2,0.55), transparent)" }}
          />
          {/* Dealt in on load (wrapper), then floats, catches the light and follows the phone's tilt (ambient). */}
          <div className="deal relative w-full max-w-[440px]">
            <TiltCard ambient holo={TIER_THEMES[card.tier].holoCard ? holoVars(card.tier) : undefined}>
              <PlayerCard card={card} className="w-full" />
            </TiltCard>
          </div>
          <RatingTrend card={card} isOwner={isOwner} className="rise relative mt-6" style={{ "--d": "350ms" } as CSSProperties} />
          <div className="rise relative mt-5 text-center" style={{ "--d": "420ms" } as CSSProperties}>
            <h1 className="display text-2xl leading-none">{card.name}</h1>
            <p className="mt-2 text-sm text-muted">
              {[card.location, `${TIER_THEMES[card.tier].label} · ${card.archetype}`].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-1 text-xs text-muted">
              Scouted{" "}
              <time dateTime={card.scoutedAt}>
                {scouted.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </time>
              {stale && " · refreshing in the background"}
            </p>
          </div>
          <div className="rise relative mt-5" style={{ "--d": "500ms" } as CSSProperties}>
            <ShareBar
              slug={card.slug}
              name={card.name}
              pageUrl={pageUrl}
              imageUrl={imageUrl}
              storyUrl={`${origin}/api/scout/${share}/story`}
              summary={`${card.overall} ${TIER_THEMES[card.tier].label} · ${card.archetype}`}
              downloadOnly={isPrivate}
            />
          </div>
          {isOwner && (
            <div className="relative mt-4 w-full max-w-[440px]">
              <CardSettingsPanel slug={card.slug} settings={settings} origin={origin} privacy={card.privacy} />
            </div>
          )}
        </section>

        <div className="rise lg:col-start-1 lg:row-start-1" style={{ "--d": "250ms" } as CSSProperties}>
          <StatBreakdown card={card} />
        </div>

        <div className="rise space-y-6 lg:col-start-3 lg:row-start-1" style={{ "--d": "330ms" } as CSSProperties}>
          <SportMix card={card} />
          {showCalendar && <RaceLog card={card} />}
          <TrophyCabinet card={card} isOwner={isOwner} />
        </div>
      </div>

      {showCalendar && (
        <section className="reveal mt-14 border-t border-line pt-8">
          {/* Open layout, no panel: the calendar sits on the page under one divider. */}
          <ActivityHeatmap
            slug={viewSlug}
            years={calendarYears(card)}
            recent={{ ...card.inputs.daily, races: card.inputs.races }}
            routesEnabled={isOwner || settings.showRoutes}
          />
        </section>
      )}

      {!isPrivate && (
        <div className="mt-24 sm:mt-32">
          <EmbedSnippet pageUrl={pageUrl} imageUrl={imageUrl} name={card.name} />
        </div>
      )}

      <footer className="mt-12 flex items-center justify-center gap-4 text-xs text-muted">
        <PoweredByStrava />
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
      </footer>
    </main>
  );
}
