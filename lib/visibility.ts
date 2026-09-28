import type { CardSettings } from "@/types/player";

/**
 * The visibility rule, pure so it can be unit-tested (lib/access.ts applies it):
 *   public   — anyone
 *   unlisted — the owner, or anyone arriving via the secret share link
 *   private  — the owner only
 */
export function canView(settings: Pick<CardSettings, "visibility">, isOwner: boolean, viaShareLink: boolean): boolean {
  if (isOwner || settings.visibility === "public") return true;
  return settings.visibility === "unlisted" && viaShareLink;
}
