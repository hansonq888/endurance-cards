import type { CardSettings } from "@/types/player";

/**
 * The visibility rule, pure so it can be unit-tested (lib/access.ts applies it):
 *   unlisted — the owner, or anyone arriving via the secret share link
 *   private  — the owner only
 * Demo cards (development seed only) are open so the pages can be browsed without signing in.
 */
export function canView(settings: Pick<CardSettings, "visibility" | "demo">, isOwner: boolean, viaShareLink: boolean): boolean {
  if (isOwner || settings.demo) return true;
  return settings.visibility === "unlisted" && viaShareLink;
}
