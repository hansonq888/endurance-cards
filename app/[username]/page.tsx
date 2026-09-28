import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { EmbedSnippet } from "@/components/EmbedSnippet";
import { OwnerActions } from "@/components/OwnerActions";
import { PlayerCard } from "@/components/PlayerCard";
import { ShareBar } from "@/components/ShareBar";
import { TiltCard } from "@/components/TiltCard";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { PANEL, RaceLog, RatingTrend, SportMix, StatBreakdown, TrophyCabinet } from "@/components/ScoutReport";
import { calendarYears } from "@/lib/calendar";
import { holoVars, TIER_THEMES } from "@/lib/card-theme";
import { NotFoundError } from "@/lib/errors";
import { getCardBySlug } from "@/lib/scout";
import { getSessionAthleteId } from "@/lib/session";
import { publicOrigin } from "@/lib/url";

const loadCard = cache(async (slug: string) => {
  try {
    return await getCardBySlug(decodeURIComponent(slug));
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
});

export async function generateMetadata({ params }: PageProps<"/[username]">): Promise<Metadata> {
  const { username } = await params;
  const { card } = await loadCard(username);
  const title = `${card.name} — ${card.overall} ${TIER_THEMES[card.tier].label}`;
  const image = `/${encodeURIComponent(card.slug)}.png`;
  return {
    title,
    description: `${card.archetype} · ${card.position} · PAC ${card.attributes.PAC.value} END ${card.attributes.END.value} VAR ${card.attributes.VAR.value}`,
    openGraph: { title, images: [{ url: image, width: 600, height: 840 }] },
    twitter: { card: "summary_large_image", title, images: [image] },
  };
}

export default async function ProfilePage({ params }: PageProps<"/[username]">) {
  const { username } = await params;
  const [{ card, stale }, sessionAthleteId, origin] = await Promise.all([
    loadCard(username),
    getSessionAthleteId(),
    publicOrigin(),
  ]);
  const isOwner = sessionAthleteId === card.athleteId;
  const pageUrl = `${origin}/${encodeURIComponent(card.slug)}`;
  const imageUrl = `${origin}/${encodeURIComponent(card.slug)}.png`;
  const scouted = new Date(card.scoutedAt);

  return (
    <main className="mx-auto w-full max-w-[1320px] flex-1 overflow-x-clip px-4 py-8 sm:py-12">
      <nav className="mb-8 flex items-center justify-between">
        <Link href="/" className="display text-xl tracking-tight">
          STRAVA<span className="text-strava">-FUT</span>
        </Link>
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
            className="pointer-events-none absolute left-1/2 top-[40%] h-[70%] w-[140%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(closest-side, rgba(252,76,2,0.55), transparent)" }}
          />
          <TiltCard className="relative w-full max-w-[440px]" holo={TIER_THEMES[card.tier].holoCard ? holoVars(card.tier) : undefined}>
            <PlayerCard card={card} className="w-full" />
          </TiltCard>
          <RatingTrend card={card} className="relative mt-6" />
          <div className="relative mt-5 text-center">
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
          <div className="relative mt-5">
            <ShareBar
              slug={card.slug}
              name={card.name}
              pageUrl={pageUrl}
              imageUrl={imageUrl}
              storyUrl={`${origin}/api/scout/${encodeURIComponent(card.slug)}/story`}
              summary={`${card.overall} ${TIER_THEMES[card.tier].label} · ${card.archetype}`}
            />
          </div>
          {isOwner && (
            <div className="relative mt-3">
              <OwnerActions slug={card.slug} />
            </div>
          )}
        </section>

        <div className="lg:col-start-1 lg:row-start-1">
          <StatBreakdown card={card} />
        </div>

        <div className="space-y-6 lg:col-start-3 lg:row-start-1">
          <SportMix card={card} />
          <RaceLog card={card} />
          <TrophyCabinet card={card} isOwner={isOwner} />
        </div>
      </div>

      <section className={`${PANEL} mt-6`}>
        <ActivityHeatmap
          slug={card.slug}
          tier={card.tier}
          years={calendarYears(card)}
          recent={{ ...card.inputs.daily, races: card.inputs.races }}
        />
      </section>

      <div className="mt-6">
        <EmbedSnippet pageUrl={pageUrl} imageUrl={imageUrl} name={card.name} />
      </div>

      <footer className="mt-12 text-center text-xs text-muted">Powered by Strava</footer>
    </main>
  );
}
