import { after, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { StravaAuthError } from "@/lib/errors";
import { claimWebhookScout, getCachedCard, getTokens, markDirty } from "@/lib/redis";
import { purgeAthlete, scoutAthlete } from "@/lib/scout";
import { ensureFreshTokens, fetchAthlete } from "@/lib/strava";

/**
 * Strava webhook (https://developers.strava.com/docs/webhooks/).
 *
 * GET  — subscription handshake: echo hub.challenge if the verify token matches.
 * POST — events. Strava needs a 200 within 2 s, so work runs in after().
 *
 * The endpoint is public, so nothing here trusts the payload on its own:
 *   - events must carry our subscription id (STRAVA_WEBHOOK_SUBSCRIPTION_ID);
 *   - "athlete revoked access" is confirmed with Strava before anything is deleted;
 *   - activity events mark the card dirty (the next view rebuilds it) and trigger
 *     at most one immediate rebuild per athlete every couple of minutes, so a
 *     flood of events can't drain the shared API budget. Updates include
 *     visibility changes, so a newly hidden activity drops out of visitors' cards.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  if (!env.webhookVerifyToken || q.get("hub.mode") !== "subscribe" || q.get("hub.verify_token") !== env.webhookVerifyToken) {
    return new Response("Forbidden", { status: 403 });
  }
  return Response.json({ "hub.challenge": q.get("hub.challenge") });
}

interface StravaEvent {
  object_type: "activity" | "athlete";
  aspect_type: "create" | "update" | "delete";
  owner_id: number;
  subscription_id: number;
  updates?: Record<string, string>;
}

/** True when our stored grant no longer works, i.e. the athlete really did revoke access. */
async function accessRevoked(athleteId: number): Promise<boolean> {
  const stored = await getTokens(athleteId);
  if (!stored) return true;
  try {
    await fetchAthlete((await ensureFreshTokens(stored)).accessToken);
    return false;
  } catch (err) {
    return err instanceof StravaAuthError;
  }
}

export async function POST(req: NextRequest) {
  const event = (await req.json().catch(() => null)) as StravaEvent | null;
  if (!event || !Number.isSafeInteger(event.owner_id)) return new Response("Bad request", { status: 400 });
  // Acknowledge anything else with 200 (Strava retries non-200s) but do nothing.
  const ours = env.webhookSubscriptionId !== null ? event.subscription_id === env.webhookSubscriptionId : process.env.NODE_ENV !== "production";
  if (!ours) return new Response(null, { status: 200 });

  after(async () => {
    const id = event.owner_id;
    try {
      if (event.object_type === "athlete" && event.updates?.authorized === "false") {
        if (await accessRevoked(id)) {
          await purgeAthlete(id);
          console.info(`[kudex] athlete ${id} revoked access; data deleted`);
        }
      } else if (event.object_type === "activity" && (await getCachedCard(id))) {
        await markDirty(id);
        if (await claimWebhookScout(id)) await scoutAthlete(id);
      }
    } catch (err) {
      console.warn(`[kudex] webhook event for ${id} failed:`, (err as Error).message);
    }
  });
  return new Response(null, { status: 200 });
}
