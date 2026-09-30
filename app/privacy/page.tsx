import type { Metadata } from "next";
import { Wordmark } from "@/components/Wordmark";
import Link from "next/link";
import { SectionHeading } from "@/components/SectionHeading";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Kudex reads from Strava, what it stores, who can see it, and how to delete it.",
};

// Keep this page in sync with the code: lib/engine.ts (what's derived), lib/redis.ts (what's stored),
// lib/access.ts + lib/sharing.ts (who sees what), lib/polyline.ts (route trimming).
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
      "Route shapes, with the activity's name and summary numbers: each route has its first and last 400 m cut off, then is shrunk into a box with no coordinates, so it can't be placed back on a map. We never store GPS coordinates.",
      "The card and story images you save or share, so they load quickly.",
      "Your rating at each refresh, for the trend line. Your visibility settings.",
      "Strava sign-in tokens, encrypted, so your card can refresh without you being signed in.",
      "Not stored: raw GPS tracks, heart rate, your email, your password, or anything from Strava we don't use above.",
    ],
  },
  {
    title: "Who can see your card",
    items: [
      "Cards are shared by private link: only people you send your link to can open it. There's no public directory or search, and you can switch your card to Private (only you) or reset the link at any time.",
      "Everyone who opens your card sees exactly the card you see.",
      "Your card is built from activities you share on Strava with Everyone or your Followers. Activities set to Only You are never on your card, for anyone, and their details (including route shapes) aren't stored.",
      "You can also hide your training calendar, races and route shapes from people you share with.",
      "When you change an activity's visibility on Strava, your card is rebuilt within a few minutes.",
      "Trophy progress and locked trophies are only ever shown to you.",
      "Cards are hidden from search engines. Private cards and their images are never stored in shared caches.",
    ],
  },
  {
    title: "How long we keep it",
    items: [
      "Your card refreshes about once a day while it's being viewed, and when you finish an activity.",
      "If nobody views it for 30 days, the cached card expires; it's rebuilt from Strava next time it's opened. Saved card and story images expire after 7 days.",
      "Past-year calendars are dropped when you delete or hide an activity on Strava, and reloaded when next opened.",
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
      "One sign-in cookie so the site knows it's you, and a short-lived one during sign-in. No ads, and no tracking cookies.",
      "We count visits with Vercel Web Analytics: anonymous, cookie-free page-view counts (which page, the referring site, rough country and device type). It doesn't identify you or follow you to other sites, and secret share links are masked before anything is sent.",
      "Your data is used only to build your card. We don't sell it, share it with anyone else, or use it to train AI models.",
      "Services involved: Strava (the data source), Vercel (hosting and visit counts) and Upstash (the database that stores your card for us).",
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

      <SiteFooter className="mt-16" privacyLink={false} />
    </main>
  );
}
