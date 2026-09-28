import { after, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getCachedCard } from "@/lib/redis";
import { purgeAthlete, scoutAthlete } from "@/lib/scout";

/**
 * Strava webhook (https://developers.strava.com/docs/webhooks/).
 *
 * GET  — subscription handshake: echo hub.challenge if the verify token matches.
 * POST — events. Strava needs a 200 within 2 s, so work runs in after():
 *   athlete / update with authorized = "false"  → the athlete revoked access: delete everything
 *   activity create / update / delete           → re-scout so the card stays current
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
  updates?: Record<string, string>;
}

export async function POST(req: NextRequest) {
  const event = (await req.json().catch(() => null)) as StravaEvent | null;
  if (!event || !Number.isSafeInteger(event.owner_id)) return new Response("Bad request", { status: 400 });

  after(async () => {
    try {
      if (event.object_type === "athlete" && event.updates?.authorized === "false") {
        await purgeAthlete(event.owner_id);
        console.info(`[strava-fut] athlete ${event.owner_id} revoked access; data deleted`);
      } else if (event.object_type === "activity" && (await getCachedCard(event.owner_id))) {
        // Only athletes we already have a card for; the scout lock + rate budget stop floods.
        await scoutAthlete(event.owner_id);
      }
    } catch (err) {
      console.warn(`[strava-fut] webhook event for ${event.owner_id} failed:`, (err as Error).message);
    }
  });
  return new Response(null, { status: 200 });
}
