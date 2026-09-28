"use client";

import { Check, ChevronDown, Download, Link2, Share2, Smartphone } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { useState } from "react";

/**
 * Download / share controls under the card, for every visitor. On phones,
 * "Share" opens the native share sheet with the card image attached; elsewhere
 * it falls back to copying the link.
 */
export function ShareBar({
  slug,
  name,
  pageUrl,
  imageUrl,
  storyUrl,
  summary,
  downloadOnly = false,
}: {
  slug: string;
  name: string;
  pageUrl: string;
  imageUrl: string;
  storyUrl: string;
  /** e.g. "79 Gold · Triathlete" */
  summary: string;
  /** Private cards: only the owner's downloads, no links to share. */
  downloadOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const text = `${name}'s ${BRAND.name} card: ${summary}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link", pageUrl);
    }
  }

  async function share() {
    if (!navigator.share) return copyLink();
    setBusy(true);
    try {
      // Attach the image where the platform allows it (most phones do).
      const blob = await fetch(imageUrl).then((r) => r.blob());
      const file = new File([blob], `${slug}-${BRAND.fileSlug}.png`, { type: "image/png" });
      const withFile = { files: [file], title: text, text, url: pageUrl };
      await navigator.share(navigator.canShare?.(withFile) ? withFile : { title: text, text, url: pageUrl });
    } catch (err) {
      // AbortError = the user closed the sheet; anything else, fall back to copying.
      if ((err as Error).name !== "AbortError") await copyLink();
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "flex items-center gap-1.5 rounded-lg border border-line bg-surface/60 px-3 py-2 font-accent text-[11px] uppercase tracking-wider transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50";
  const item = "flex items-center gap-2 rounded-md px-2.5 py-2 hover:bg-surface-2 hover:text-foreground";

  return (
    <div className="flex items-center justify-center gap-2 text-muted">
      {!downloadOnly && (
        <button type="button" onClick={share} disabled={busy} className={`${btn} border-strava/60 text-foreground`}>
          <Share2 className="h-3.5 w-3.5 text-strava" aria-hidden /> Share
        </button>
      )}
      {/* Both downloads behind one button: the card PNG and the 1080×1920 story. */}
      <details className="group relative">
        <summary className={`${btn} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
          <Download className="h-3.5 w-3.5" aria-hidden /> Save
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="absolute left-1/2 z-30 mt-1.5 w-44 -translate-x-1/2 rounded-lg border border-line bg-surface p-1 font-accent text-[11px] shadow-xl">
          <a href={imageUrl} download={`${slug}-${BRAND.fileSlug}.png`} className={item}>
            <Download className="h-3.5 w-3.5" aria-hidden /> Card image
          </a>
          <a href={storyUrl} download={`${slug}-${BRAND.fileSlug}-story.png`} className={item}>
            <Smartphone className="h-3.5 w-3.5" aria-hidden /> Story (1080×1920)
          </a>
        </div>
      </details>
      {!downloadOnly && (
        <button type="button" onClick={copyLink} className={btn} aria-label="Copy link">
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}
          {copied ? "Copied" : "Link"}
        </button>
      )}
    </div>
  );
}
