import Link from "next/link";
import { PoweredByStrava } from "./StravaBrand";

/** The attribution line at the foot of every page (Strava's brand rules require it). */
export function SiteFooter({ className = "", privacyLink = true }: { className?: string; privacyLink?: boolean }) {
  return (
    <footer className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted ${className}`}>
      <PoweredByStrava />
      <span>Not affiliated with Strava</span>
      {privacyLink && (
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
      )}
    </footer>
  );
}
