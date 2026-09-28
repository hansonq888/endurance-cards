import "server-only";
import { ConfigError } from "./errors";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new ConfigError(`Missing required environment variable ${name}`);
  return value;
}

export const env = {
  get stravaClientId() {
    return required("STRAVA_CLIENT_ID");
  },
  get stravaClientSecret() {
    return required("STRAVA_CLIENT_SECRET");
  },
  /** Used to sign session cookies and encrypt stored Strava tokens. */
  get sessionSecret() {
    const secret = process.env.SESSION_SECRET;
    if (secret && secret.length >= 32) return secret;
    if (process.env.NODE_ENV === "production") {
      throw new ConfigError("SESSION_SECRET must be set to at least 32 characters in production");
    }
    return "dev-only-insecure-session-secret-change-me!!";
  },
  /** Public origin, e.g. https://kudex.vercel.app. Falls back to the request origin. */
  appUrl: process.env.APP_URL?.replace(/\/$/, "") || null,
  /** Shared secret Strava echoes back when verifying the webhook subscription. */
  webhookVerifyToken: process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || null,
  /**
   * Id Strava returned when the webhook subscription was created. Events without
   * it are ignored, so a forged POST can't trigger deletes or scouts. Required in
   * production for the webhook to act at all.
   */
  webhookSubscriptionId: process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID ? Number(process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID) : null,
  /** Upstash / Vercel KV REST credentials. Absent → in-memory cache (dev only). */
  redisUrl: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || null,
  redisToken: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || null,
};
