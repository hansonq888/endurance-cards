"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics: cookie-free, anonymous page-view counts. Secret share
 * links are masked before anything leaves the browser, so link-only cards'
 * URLs never end up in the analytics dashboard; query strings are dropped too.
 */
function redact(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  url.pathname = url.pathname.replace(/\/link-[a-z0-9]+/gi, "/link-[hidden]");
  url.search = "";
  return { ...event, url: url.toString() };
}

export function SiteAnalytics() {
  return <Analytics beforeSend={redact} />;
}
