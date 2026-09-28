import type { Metadata } from "next";
import { Wordmark } from "@/components/Wordmark";
import Link from "next/link";
import { SectionHeading } from "@/components/SectionHeading";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Kudex reads from Strava, what it stores, who can see it, and how to delete it.",
};

// Keep this page in sync with the code: lib/engine.ts (what's derived), lib/redis.ts (what's stored),
// lib/access.ts + lib/audience.ts (who sees what), lib/polyline.ts (route trimming).
const SECTIONS: { title: string; items: string[] }[] = [
  {
    title: "What we read from Strava",
    items: [
      "Only after you connect and approve access. We ask for read-only access to your profile and activities.",
      "Profile: name, username, photo, city/region/country and when you joined Strava.",
      "Lifetime run, ride and swim totals.",
      "Your activities from the last 12 months, plus any past year you open in the calendar: type, name, date and time, distance, moving time, climbing, speed, PR counts, whether it was a race, who can see it on Strava, and Strava's simplified route line.",
    ],
  },
  {
    title: "What we store",
    items: [
      "Your card: ratings, trophies and the summary numbers behind them (e.g. hours per sport, longest session, climbing per year).",
      "Per-day training minutes and PR counts, for the calendar. Race names, dates, distances and times.",
      "Route shapes: each route has its first and last 400 m cut off, then is shrunk into a box with no coordinates, so it can't be placed back on a map. We never store GPS coordinates.",
      "Your rating at each refresh, for the trend line. Your visibility settings.",
      "Strava sign-in tokens, encrypted, so your card can refresh without you being signed in.",
      "Not stored: raw GPS tracks, heart rate, your email, your password, or anything from Strava we don't use above.",
    ],
  },
  {
    title: "Who can see your card",
    items: [
      "You choose, and can change it any time from your card: Public (anyone, at your username, and findable by username search), Link only (only people with your secret link), or Private (only you).",
      "New cards start from how you share on Strava: Public if most of your training is visible to Everyone there, Link only if most is Followers-only, and Private if most is Only You.",
      "You can also hide your training calendar, races and route shapes from visitors.",
      "Visitors only see what they could already see on Strava. On a public card, their version of your card (rating, stats, trophies, races, calendar and routes) is built only from activities set to Everyone. With your link, from Everyone and Followers activities. Activities set to Only You count only for you.",
      "When you change an activity's visibility on Strava, your card is rebuilt within a few minutes. You can preview exactly what visitors see from your card settings.",
      "Trophy progress and locked trophies are only ever shown to you.",
      "Link-only and private cards are hidden from search engines. Private cards and their images are never stored in shared caches.",
    ],
  },
  {
    title: "How long we keep it",
    items: [
      "Your card refreshes about once a day while it's being viewed, and when you finish an activity.",
      "If nobody views it for 30 days, the cached card expires; it's rebuilt from Strava next time it's opened.",
      "Everything else is kept until you remove your card or revoke access.",
    ],
  },
  {
    title: "Deleting everything",
    items: [
      "Press “Remove card” on your card page: we revoke our Strava access and delete all your data immediately.",
      "Or revoke access on Strava (Settings → My Apps). Strava tells us, and we delete everything automatically.",
    ],
  },
  {
    title: "Cookies and third parties",
    items: [
      "One sign-in cookie so the site knows it's you, and a short-lived one during sign-in. No ads, no analytics trackers.",
      "Your data is used only to build your card. We don't sell it, share it with anyone else, or use it to train AI models.",
      "Services involved: Strava (the data source), and our hosting and database providers, which store it for us.",
      "Kudex is not affiliated with or endorsed by Strava. Strava data is used under the Strava API Agreement.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:py-12">
      <nav className="mb-10 flex items-center justify-between">
        <Wordmark />
        <Link href="/guide" className="font-accent text-xs uppercase tracking-wider text-muted hover:text-foreground">
          How it works
        </Link>
      </nav>

      <h1 className="display text-5xl leading-[0.9] tracking-tight">Privacy</h1>
      <p className="mt-4 font-accent text-sm text-muted">
        The short version: we only read what&apos;s needed to build your card, never store GPS coordinates, let you choose who sees
        it, and delete everything the moment you ask.
      </p>

      <div className="mt-12 space-y-10">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <SectionHeading>{section.title}</SectionHeading>
            <ul className="space-y-2.5 font-accent text-xs leading-relaxed text-muted">
              {section.items.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-strava" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="mt-16 text-center text-xs text-muted">Powered by Strava · Not affiliated with Strava</footer>
    </main>
  );
}
