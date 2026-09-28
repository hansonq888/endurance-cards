import "server-only";
import { headers } from "next/headers";
import { env } from "./env";

/** Absolute origin for building shareable links (APP_URL, else the incoming request's host). */
export async function publicOrigin(): Promise<string> {
  if (env.appUrl) return env.appUrl;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
