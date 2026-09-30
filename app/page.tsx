import type { CSSProperties } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { CardFan } from "@/components/CardFan";
import { ConnectWithStrava } from "@/components/StravaBrand";
import { HowItWorks } from "@/components/home/HowItWorks";
import { Marquee } from "@/components/home/Marquee";
import { TopoBackdrop } from "@/components/home/TopoBackdrop";
import { TurtleMark } from "@/components/TurtleMark";
import { demoCards } from "@/lib/demo-cards";
import { SiteFooter } from "@/components/SiteFooter";

const ERRORS: Record<string, string> = {
  denied: "You declined the Strava connection. No data was stored.",
  scope: "We need permission to read your activities to build a card. Please allow activity access.",
  state: "Your sign-in session expired. Please try connecting again.",
  rate_limited: "Strava is rate limiting us right now. Please try again in a few minutes.",
  strava_auth: "Strava rejected the authorization. Please try connecting again.",
  strava_upstream: "Strava is having trouble responding. Please try again shortly.",
  config_error: "The server isn't configured for Strava yet (missing API credentials).",
};

const MARQUEE = ["Rated out of 99", "Six stats", "Four tiers", "Twelve trophies", "Every sport counts", "Built from your Strava"];

function PrivacyNote({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <p className={`text-xs leading-relaxed text-muted ${className}`} style={style}>
      <ShieldCheck className="mr-1.5 inline h-4 w-4 -translate-y-px" aria-hidden />
      Read-only. Only people you send your link to can see your card.{" "}
      <Link href="/privacy" className="whitespace-nowrap underline underline-offset-2 hover:text-foreground">
        How privacy works
      </Link>
    </p>
  );
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const { error, removed } = await searchParams;
  const errorMessage = typeof error === "string" ? (ERRORS[error] ?? "Something went wrong. Please try again.") : null;
  const [silver, gold, icon] = demoCards();

  return (
    <main className="w-full flex-1 overflow-x-clip">
      {/* Hero */}
      <div className="relative">
        {/* Topo contours and a warm glow behind the cards; faded at the edges. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_62%,black_20%,transparent_68%)]">
          <TopoBackdrop className="absolute left-1/2 top-[18%] h-[110%] w-auto -translate-x-1/2" />
        </div>
        <div
          aria-hidden
          className="glow-in pointer-events-none absolute bottom-[8%] left-1/2 h-[45%] w-[70%] max-w-[900px] -translate-x-1/2 rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgba(252,76,2,0.5), transparent)" }}
        />

        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-10 sm:pb-28 sm:pt-16">
          {/* On the home page the turtle sits beside the headline instead of in the nav. */}
          <nav className="mb-10 flex items-center justify-end">
            <Link href="/guide" className="font-accent text-xs uppercase tracking-wider text-muted hover:text-foreground">
              How it works
            </Link>
          </nav>

          {/* Centred hero: turtle + headline, the pitch, the button, then the hand of cards. */}
          <section className="flex flex-col items-center text-center">
            <div className="flex items-center justify-center gap-3 sm:gap-5">
              {/* The drawing fills ~58% × 70% of its box; oversize it and trim the padding so the turtle matches the three lines. */}
              <TurtleMark className="-mx-[33px] -my-[24px] h-[160px] w-[160px] shrink-0 translate-y-[6px] sm:-mx-[57px] sm:-my-[40px] sm:h-[272px] sm:w-[272px] sm:translate-y-[10px]" />
              {/* Three stacked lines beside the turtle, sized so "training" never overflows a phone. */}
              <h1 className="display text-left text-[2.6rem] leading-[0.9] tracking-tight sm:text-7xl">
                <span className="rise inline-block">Your</span>
                <br />
                <span className="rise inline-block" style={{ "--d": "60ms" } as CSSProperties}>
                  training
                </span>
                <br />
                <span className="rise inline-block text-strava" style={{ "--d": "120ms" } as CSSProperties}>
                  rated 99
                </span>
              </h1>
            </div>
            <p className="rise mt-7 max-w-lg text-lg text-muted" style={{ "--d": "240ms" } as CSSProperties}>
              Connect Strava and get a player card rated out of 99, built from a year of real runs, rides, swims and
              everything in between.
            </p>

            {errorMessage && (
              <p role="alert" className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {errorMessage}
              </p>
            )}
            {removed && (
              <p role="status" className="mt-6 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
                Your card was removed and Strava access revoked.
              </p>
            )}

            <ConnectWithStrava className="rise mt-8" height={52} style={{ "--d": "360ms" } as CSSProperties} />
            <PrivacyNote className="rise mt-4" style={{ "--d": "440ms" } as CSSProperties} />

            <CardFan cards={[silver, gold, icon]} className="mt-14 sm:mt-16" />
            <p className="rise mt-2 font-accent text-[11px] uppercase tracking-wider text-muted" style={{ "--d": "900ms" } as CSSProperties}>
              Tap a card to bring it forward
            </p>
          </section>
        </div>
      </div>

      <Marquee items={MARQUEE} />

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:py-32">
        <div className="reveal mb-12 flex flex-wrap items-end justify-between gap-4">
          <h2 className="display text-4xl leading-[0.9] tracking-tight sm:text-6xl">
            Three steps
            <br />
            <span className="text-strava">to your card</span>
          </h2>
          <Link href="/guide" className="font-accent text-xs uppercase tracking-wider text-muted hover:text-foreground">
            Full guide: stats, tiers and trophies →
          </Link>
        </div>
        <HowItWorks />
      </section>

      {/* Closing call to action */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="reveal grain relative overflow-hidden rounded-3xl border border-line p-8 sm:p-12">
          <TopoBackdrop seed={21} className="absolute -right-24 -top-24 h-[160%] w-auto opacity-70" />
          <div className="relative">
            <h2 className="display text-[2.4rem] leading-[0.9] tracking-tight sm:text-7xl">
              Your card
              <br />
              <span className="text-strava">is waiting</span>
            </h2>
            <ConnectWithStrava className="mt-8" height={52} />
            <PrivacyNote className="mt-4" />
          </div>
        </div>
      </section>

      <SiteFooter className="mx-auto max-w-6xl px-4 pb-10" />
    </main>
  );
}
