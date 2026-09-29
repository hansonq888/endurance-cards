import type { CSSProperties } from "react";

/*
 * Strava's official brand assets (developers.strava.com/guidelines), used
 * unmodified as the guidelines require: the "Connect with Strava" button for
 * every sign-in, and "Powered by Strava" wherever Strava data is shown.
 */

/**
 * Starts Strava OAuth. A plain <a> on purpose: the route redirects off-site to
 * Strava's authorization screen, so it must be a full page navigation.
 */
export function ConnectWithStrava({
  className = "",
  style,
  height = 48,
  glow = true,
}: {
  className?: string;
  style?: CSSProperties;
  height?: number;
  /** Soft orange shadow for hero placements; off for small inline uses. */
  glow?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a
      href="/api/auth/strava"
      aria-label="Connect with Strava"
      style={style}
      className={`inline-block rounded-[6px] transition hover:-translate-y-0.5 hover:brightness-110 ${glow ? "shadow-xl shadow-strava/25" : ""} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/strava/connect-with-strava.svg" alt="Connect with Strava" width={(237 / 48) * height} height={height} className="block" />
    </a>
  );
}

export function PoweredByStrava({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/strava/powered-by-strava.svg" alt="Powered by Strava" width={138} height={14} className={`inline-block opacity-80 ${className}`} />
  );
}
