import type { CSSProperties } from "react";
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
import { PANEL, RaceLog, RatingTrend, SportMix, StatBreakdown, TrophyCabinet } from "@/components/ScoutReport";
import { calendarYears } from "@/lib/calendar";
import { holoVars, TIER_THEMES } from "@/lib/card-theme";
import { NotFoundError } from "@/lib/errors";
import { getCardBySlug } from "@/lib/scout";
import { isMeasured } from "@/lib/engine";
import { ATTRIBUTE_KEYS } from "@/types/player";
import { parsePreview } from "@/lib/access";
import { visitorAudience } from "@/lib/audience";
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
const loadCard = cache(async (slug: string, view?: string) => {
  try {
    // ?view=public|link lets the owner preview a visitor's version; ignored for anyone else.
    return await getCardBySlug(safeDecode(slug), await getSessionAthleteId(), { preview: parsePreview(view) });
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
});

const viewParam = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** What each visitor audience is called in the preview banner. */
const AUDIENCE_LABEL = { public: "anyone", link: "people with your link" } as const;

export async function generateMetadata({ params, searchParams }: PageProps<"/[username]">): Promise<Metadata> {
  const { username } = await params;
  const { card, viewer } = await loadCard(username, viewParam((await searchParams).view));
  const title = `${card.name} — ${card.overall} ${TIER_THEMES[card.tier].label}`;
  const image = `/${encodeURIComponent(viewer.shareSlug)}.png`;
  return {
    title,
    // Only public cards should show up in search engines.
    robots: viewer.settings.visibility === "public" ? undefined : { index: false, follow: false },
    description: `${card.archetype} · ${card.position} · ${ATTRIBUTE_KEYS.map((k) => `${k} ${isMeasured(card.attributes[k]) ? card.attributes[k].value : "–"}`).join(" ")}`,
    openGraph: { title, images: [{ url: image, width: 600, height: 840 }] },
    twitter: { card: "summary_large_image", title, images: [image] },
  };
}

export default async function ProfilePage({ params, searchParams }: PageProps<"/[username]">) {
  const { username } = await params;
  const view = viewParam((await searchParams).view);
  const [{ card, stale, viewer }, origin] = await Promise.all([loadCard(username, view), publicOrigin()]);
  const { settings, previewing, audience } = viewer;
  // While previewing a visitor's view, the owner sees exactly what that visitor would: no owner tools.
  const isOwner = viewer.isOwner && !previewing;
  // The slug this page was opened with: API calls from the page must use it (it may be the secret link).
  const viewSlug = safeDecode(username);
  const share = encodeURIComponent(viewer.shareSlug);
  const pageUrl = `${origin}/${share}`;
  const imageUrl = `${origin}/${share}.png`;
  const isPrivate = settings.visibility === "private";
  const showCalendar = isOwner || settings.showCalendar;
  // Images the owner saves or shares match what the people they share with will see.
  const shareView = viewer.isOwner ? (previewing ? audience : visitorAudience(settings.visibility)) : null;
  const shareQuery = shareView ? `?view=${shareView}` : "";
  const ownerImageUrl = viewer.isOwner ? `${origin}/api/scout/${share}/card${shareQuery}` : imageUrl;
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

      {previewing && audience !== "owner" && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-strava/40 bg-strava/10 px-4 py-3 font-accent text-xs">
          <span>
            Previewing what <strong className="font-medium text-foreground">{AUDIENCE_LABEL[audience]}</strong> see: only activities
            they could see on Strava.
          </span>
          <Link href={`/${viewSlug}`} className="uppercase tracking-wider text-strava hover:underline">
            Exit preview
          </Link>
        </div>
      )}

      {/* Card in the centre, supporting detail on either side (stacked below it on small screens). */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)_minmax(0,1fr)] lg:gap-6">
        <section className="relative order-first flex flex-col items-center lg:order-none lg:col-start-2 lg:row-start-1">
          <div
            aria-hidden
            className="glow-in pointer-events-none absolute left-1/2 top-[40%] h-[70%] w-[140%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(closest-side, rgba(252,76,2,0.55), transparent)" }}
          />
          <TiltCard className="deal relative w-full max-w-[440px]" holo={TIER_THEMES[card.tier].holoCard ? holoVars(card.tier) : undefined}>
            <PlayerCard card={card} className="w-full" />
          </TiltCard>
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
              imageUrl={ownerImageUrl}
              storyUrl={`${origin}/api/scout/${share}/story${shareQuery}`}
              summary={`${card.overall} ${TIER_THEMES[card.tier].label} · ${card.archetype}`}
              downloadOnly={isPrivate}
            />
          </div>
          {isOwner && (
            <div className="relative mt-4 w-full max-w-[440px]">
              <CardSettingsPanel slug={card.slug} settings={settings} origin={origin} privacy={card.privacy} pagePath={`/${viewSlug}`} />
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
        <section className={`${PANEL} reveal mt-6`}>
          <ActivityHeatmap
            slug={viewSlug}
            years={calendarYears(card)}
            recent={{ ...card.inputs.daily, races: card.inputs.races }}
            routesEnabled={isOwner || settings.showRoutes}
            view={previewing && audience !== "owner" ? audience : undefined}
          />
        </section>
      )}

      {!isPrivate && (
        <div className="mt-6">
          <EmbedSnippet pageUrl={pageUrl} imageUrl={imageUrl} name={card.name} />
        </div>
      )}

      <footer className="mt-12 flex justify-center gap-4 text-xs text-muted">
        <span>Powered by Strava</span>
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
      </footer>
    </main>
  );
}
