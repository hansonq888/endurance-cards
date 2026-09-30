# Kudex

Endurance player cards: connect Strava, get a player card rated out of 99, with a scout-report
page, shareable images and a privacy model that mirrors your Strava settings.

## Quick start

```bash
cp .env.example .env.local   # fill in Strava credentials + SESSION_SECRET
npm install
npm run dev
```

No Strava app yet? `GET /api/dev/seed` (development only) loads six synthetic athletes, e.g.
`/demo-triathlete` and `/demo-triathlete.png`.

| Script | |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Engine unit tests (Vitest) |
| `npm run typecheck` / `lint` | Types / ESLint |

## Routes

| Route | |
| --- | --- |
| `GET /api/auth/strava` | Starts OAuth; the same route is the callback (state cookie CSRF check, scope check) |
| `POST /api/auth/logout` | Clears the session cookie |
| `GET /[username]` | Profile: card, scout report, sport mix, races, trophies, calendar, embed snippets. Opened by the owner, or by anyone via the secret `/link-…` URL |
| `GET /[username].png` | 600×840 card PNG (rewritten to `/api/scout/[username]/card`) |
| `GET /api/scout/[username]` | Card JSON `{ card, stale, source }` |
| `GET /api/scout/[username]/story` | 1080×1920 story PNG |
| `GET /api/scout/[username]/calendar?year=` | One past year of daily training (fetched from Strava once, then cached) |
| `GET /api/scout/[username]/routes?date=` | That day's route shapes (no coordinates) |
| `PATCH /api/scout/[username]/settings` | Owner-only: visibility, section toggles, reset share link |
| `POST /api/scout/[username]` | Owner-only re-scout, 10-minute cooldown |
| `DELETE /api/scout/[username]` | Owner-only: revokes Strava access and deletes all stored data |
| `GET/POST /api/strava/webhook` | Strava webhook (see below) |
| `GET /api/dev/seed`, `/api/dev/login` | Development only (404 in production) |

`[username]` is the Strava username, or the numeric athlete ID when none is set. Both always resolve.

## Architecture

```
lib/strava.ts         OAuth, token refresh, API client, rate-limit budget tracking
lib/engine.ts         Pure rating engine: extractInputs() → rateInputs() → buildCard() / buildSharedCard()
lib/sharing.ts        Pure privacy rule: which Strava activities go on a card (Everyone + Followers)
lib/access.ts         resolveViewer(): the one visibility gate every doorway goes through
lib/scout.ts          Orchestration: cache-first, stale-while-revalidate, scout lock + dirty flag, owner actions
lib/calendar.ts       Past-year calendars and route shapes (shared activities only)
lib/redis.ts          Upstash/KV store (in-memory in dev only): cards, slugs, encrypted tokens, settings, locks
lib/card-face.tsx     One card face shared by the web card and the PNG renderer (next/og)
components/           PlayerCard, scout report, calendar, settings panel, share bar, trophies
```

**Strava only lets an app read data for athletes who have authorized it**, so `/[username]` only works
for people who have connected. Their refresh tokens are stored encrypted so cards can be re-scouted
without them present.

### Rate limits

One scout costs at most 5 requests (`/athlete`, `/athletes/{id}/stats`, up to 3 pages of 200 activities).
- Cards are served from Redis. After 24h they're served stale and re-scouted in the background via `after()`.
- Strava's `X-(Read)RateLimit-*` headers are recorded after every call. Scouts are refused early
  (429 + `Retry-After`) when the 15-minute or daily budget is nearly spent, with a reserve kept for new sign-ups.
- A per-athlete lock prevents duplicate concurrent scouts. Manual re-scouts have a cooldown; webhook
  re-scouts are debounced to one per athlete per 2 minutes.
- Shareable image and JSON responses send short `s-maxage` / `stale-while-revalidate` headers so CDNs absorb embed traffic.

## The card

One topo design for every athlete. Contour lines are generated from the athlete ID (unique but
stable per person) around a summit holding their photo; the six stats form the ridge line.
Tiers are Bronze, Silver, Gold and Icon, each with its own landscape colourway (Canyon, Granite,
Alpenglow, Glacier); Gold and Icon are holographic. The bottom-right highlight depends on the main
sport: km run / swum / paddled, km climbed (cycling, hiking, skiing) or hours trained (triathlon, gym, other).

## Privacy & visibility

**One card per athlete, and everyone who can open it sees the same card.** It's built from the
activities the athlete shares on Strava with Everyone or Followers (`lib/sharing.ts`,
`buildSharedCard`); Only You activities are never on it and their route shapes are never stored.
A Kudex link works like adding a follower, so there's no public listing or search.

| Card visibility | Who can view |
| --- | --- |
| **Link only** (default) | The owner, and anyone with the secret `/link-…` URL. `/username` returns 404 |
| **Private** | The signed-in owner only |

Owners can also hide the calendar/races and route shapes from people they share with, and reset the
link at any time. Settings saved as "public" before that option was removed read as Link only.

Every doorway (page, PNG, story, JSON, calendar and routes APIs) goes through `resolveViewer` in
`lib/access.ts`; anything not allowed is a plain 404.
Owner and private responses are `Cache-Control: private, no-store`. Usernames that would shadow app
routes (`guide`, `privacy`, `api`, …) fall back to the numeric id. What's stored and why is documented
for users at `/privacy`.

### Strava webhook

`/api/strava/webhook` deletes an athlete's data when they revoke access on strava.com (required by the
Strava API Agreement) and rebuilds cards when activities change, including visibility changes. The
endpoint is public, so it ignores events without our subscription id, confirms a revocation with Strava
before deleting anything, and debounces rebuilds. After deploying, create the subscription once
(Strava allows one per app):

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=$STRAVA_CLIENT_ID -F client_secret=$STRAVA_CLIENT_SECRET \
  -F callback_url=https://YOUR_DOMAIN/api/strava/webhook -F verify_token=$STRAVA_WEBHOOK_VERIFY_TOKEN
```

Then set the returned `id` as `STRAVA_WEBHOOK_SUBSCRIPTION_ID` and redeploy. Until it's set, the webhook
does nothing in production.

## Rating engine

All attributes are 1–99. Volumes use `logScale` (log1p between a floor and a ceiling) and speeds use
`ratioScale` (log of the speed ratio), so outliers saturate rather than squash everyone else.
Data window: the last 365 days, annualised if a very high-volume athlete hits the 600-activity cap.

**Sport-aware:** PAC and END are rated *per sport* against that sport's own benchmarks
(`SPORT_BENCHMARKS` in `lib/engine.ts`), then blended by the share of time spent on each sport.
There are no cross-sport conversion ratios; a swimmer is compared with swimmers.

| Attr | Inputs | Weight |
| --- | --- | --- |
| **PAC** | Upper-quartile avg speed per sport (road/virtual runs, road/gravel/virtual rides, swims; ≥3 samples, manual entries excluded) on that sport's speed band, time-weighted | 20% |
| **END** | Longest session per sport on that sport's distance band (or duration, for gym/other), time-weighted, plus total annual moving hours (10→600 h) | 22% |
| **PRS** | Personal records per 10 h of runs, rides and hikes (PRs from other sports ignored; needs 10+ h; small samples shrink toward 2 per 10 h), on a log-ratio band 0.2→20 per 10 h. Favours improving athletes, so it carries the least weight | 10% |
| **CONS** | Active days in the last 30 (saturating curve), plus active weeks out of the last 12 | 18% |
| **VAR** | Number of sports plus Shannon evenness of the time split, +6 for a triathlon mix | 10% |
| **PHY** | Lifetime run/ride/swim hours (20→6000) plus account tenure (0.25→12 yrs) | 20% |

**OVR** is the weighted average of the stats we could measure; a stat an athlete's sports give no data for (e.g. no timed sessions for PAC, or only swims and gym for PRS) shows “–” and its weight is shared across the rest. **Legacy gate:** 90+ requires 3+ years on Strava, 1,500+ lifetime
hours and 9 of the last 12 weeks active. Otherwise the OVR is capped at 89.
**Tiers:** Bronze < 55 ≤ Silver < 70 ≤ Gold < 90 ≤ Icon.

Changing formulas? Bump `ENGINE_VERSION`; cached cards are re-rated from their stored `inputs`
without calling Strava. Changing the `ScoutInputs` shape? Bump `INPUTS_SCHEMA`; older cached cards
are re-scouted instead.

## Deploying

1. **Vercel project** from this repo; **Upstash Redis** (or Vercel KV) attached. The app refuses to run
   in production without Redis.
2. **Environment variables** (see `.env.example`): `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`,
   `SESSION_SECRET` (32+ chars), `APP_URL` (e.g. `https://kudex.vercel.app`), `UPSTASH_REDIS_REST_URL` /
   `_TOKEN`, `STRAVA_WEBHOOK_VERIFY_TOKEN`, and after step 4 `STRAVA_WEBHOOK_SUBSCRIPTION_ID`.
3. **Strava API settings:** set the Authorization Callback Domain to your production host.
4. **Webhook:** create the subscription (above), set its id, redeploy.
5. **Brand:** swap the styled button for Strava's official **"Connect with Strava"** asset and add the
   **"Powered by Strava"** logo ([brand guidelines](https://developers.strava.com/guidelines/)).

Preview deployments can't sign in: Strava only redirects to the one callback domain, and the OAuth
state cookie lives on the preview host. Test sign-in on production (or locally).

## Roadmap

Head-to-head duels · squads and leaderboards · "In Form" status · Platinum tier · themed card finishes.
