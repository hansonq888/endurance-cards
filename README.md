# Strava-FUT

Endurance player cards: connect Strava, get an Ultimate Team–style card rated out of 99, with a public
scout-report page and an embeddable PNG.

## Quick start

```bash
cp .env.example .env.local   # fill in Strava credentials + SESSION_SECRET
npm install
npm run dev
```

No Strava app yet? `GET /api/dev/seed` (development only) loads four synthetic athletes, e.g.
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
| `GET /[username]` | Public profile: card, scout report, sport mix, trophy cabinet, embed snippets |
| `GET /[username].png` | 600×840 PNG (rewritten to `/api/scout/[username]/card`) |
| `GET /api/scout/[username]` | Card JSON `{ card, stale, source }` (`?format=png` also works) |
| `POST /api/scout/[username]` | Owner-only re-scout, 10-minute cooldown |
| `DELETE /api/scout/[username]` | Owner-only: revokes Strava access and deletes all stored data |

`[username]` is the Strava username, or the numeric athlete ID when none is set. Both always resolve.

## Architecture

```
lib/strava.ts         OAuth, token refresh, API client, rate-limit budget tracking
lib/engine.ts         Pure rating engine: extractInputs() → rateInputs() → buildCard()
lib/redis.ts          Upstash/KV cache (in-memory fallback): cards, slugs, encrypted tokens, locks
lib/scout.ts          Orchestration: cache-first, stale-while-revalidate, owner actions
lib/card-renderer.tsx PNG via next/og (Satori) with vendored Barlow (OFL)
components/           PlayerCard (web card, container-query sized), scout report, embed, owner actions
```

**Strava only lets an app read data for athletes who have authorized it**, so `/[username]` only works
for people who have connected. Their refresh tokens are stored encrypted so cards can be re-scouted
without them present.

### Rate limits

One scout costs at most 5 requests (`/athlete`, `/athletes/{id}/stats`, up to 3 pages of 200 activities).
- Cards are served from Redis. After 24h they're served stale and re-scouted in the background via `after()`.
- Strava's `X-(Read)RateLimit-*` headers are recorded after every call. Scouts are refused early
  (429 + `Retry-After`) when the 15-minute or daily budget is nearly spent, with a reserve kept for new sign-ups.
- A per-athlete lock prevents duplicate concurrent scouts. Manual re-scouts have a cooldown.
- Image and JSON responses send `s-maxage` / `stale-while-revalidate` headers so CDNs absorb embed traffic.

## The card

One topo design for every athlete. Contour lines are generated from the athlete ID (unique but
stable per person) around a summit holding their photo; the six stats form the ridge line.
Tiers are landscape colourways: Canyon (bronze), Granite (silver), Alpenglow (gold), Glacier (icon).
The bottom-right highlight depends on the main sport: km run / swum / paddled, km climbed
(cycling, hiking, skiing) or hours trained (triathlon, gym, other).

## Privacy & visibility

Each athlete chooses who can see their card (owner panel on the card page, `PATCH /api/scout/[username]/settings`):

| Visibility | Who can view |
| --- | --- |
| **Link only** (default on first connect) | The owner, and anyone with the secret `/link-…` URL. `/username` returns 404. |
| **Public** | Anyone, at `/username`. |
| **Private** | The signed-in owner only. |

Owners can also hide the training calendar/races and route shapes from visitors. Every doorway (page,
PNG, story, JSON, calendar and routes APIs) goes through `resolveViewer` in `lib/access.ts`; anything
not allowed is a plain 404. Private and owner-only responses are `Cache-Control: private, no-store`.
Usernames that would shadow app routes (`guide`, `privacy`, `api`, …) fall back to the numeric id.
What's stored and why is documented for users at `/privacy`.

### Strava webhook

`/api/strava/webhook` deletes an athlete's data when they revoke access on strava.com (required by the
Strava API Agreement) and re-scouts cards when activities change. After deploying, set
`STRAVA_WEBHOOK_VERIFY_TOKEN` and create the subscription once:

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=$STRAVA_CLIENT_ID -F client_secret=$STRAVA_CLIENT_SECRET \
  -F callback_url=https://YOUR_DOMAIN/api/strava/webhook -F verify_token=$STRAVA_WEBHOOK_VERIFY_TOKEN
```

## Rating engine

All attributes are 1–99. Volumes use `logScale` (log1p between a floor and a ceiling) and speeds use
`ratioScale` (log of the speed ratio), so outliers saturate rather than squash everyone else.
Data window: the last 365 days, annualised if a very high-volume athlete hits the 600-activity cap.

**Sport-aware:** PAC, END and PWR are rated *per sport* against that sport's own benchmarks
(`SPORT_BENCHMARKS` in `lib/engine.ts`), then blended by the share of time spent on each sport.
There are no cross-sport conversion ratios; a swimmer is compared with swimmers.

| Attr | Inputs | Weight |
| --- | --- | --- |
| **PAC** | Upper-quartile avg speed per sport (road/virtual runs, road/gravel/virtual rides, swims; ≥3 samples, manual entries excluded) on that sport's speed band, time-weighted | 18% |
| **END** | Longest session per sport on that sport's distance band (or duration, for gym/other), time-weighted, plus total annual moving hours (10→600 h) | 20% |
| **PWR** | Terrain sports: climb rate (m per moving hour) and share of hilly sessions, blended 60/40 with heart-rate intensity when available. Flat sports (swim, gym, paddle): heart-rate intensity (avg HR ÷ estimated max HR). Time-weighted | 14% |
| **CONS** | Active days in the last 30 (saturating curve), plus active weeks out of the last 12 | 18% |
| **VAR** | Number of sports plus Shannon evenness of the time split, +6 for a triathlon mix | 10% |
| **PHY** | Lifetime run/ride/swim hours (20→6000) plus account tenure (0.25→12 yrs) | 20% |

**OVR** is the weighted average. **Legacy gate:** 90+ requires 3+ years on Strava, 1,500+ lifetime
hours and 9 of the last 12 weeks active. Otherwise the OVR is capped at 89.
**Tiers:** Bronze < 55 ≤ Silver < 70 ≤ Gold < 90 ≤ Icon.

Changing formulas? Bump `ENGINE_VERSION`; cached cards are re-rated from their stored `inputs`
without calling Strava. Changing the `ScoutInputs` shape? Bump `INPUTS_SCHEMA`; older cached cards
are re-scouted instead.

## Before launch

- Swap the styled button for Strava's official **"Connect with Strava"** asset and add the
  **"Powered by Strava"** logo ([brand guidelines](https://developers.strava.com/guidelines/)).
- Set `SESSION_SECRET`, `APP_URL`, and Redis credentials in production. Without Redis, the in-memory
  cache doesn't persist across serverless instances.
- Strava's API agreement requires honoring deauthorization. The `DELETE` route handles in-app removal.
  Add the Strava webhook (`athlete` / `authorized: false`) to catch revocations made on strava.com.

## Roadmap

Live webhooks (re-scout on new activity) · head-to-head duels · themed card finishes.
