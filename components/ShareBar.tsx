"use client";

import { Check, Download, Link2, Share2, Smartphone } from "lucide-react";
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
}: {
  slug: string;
  name: string;
  pageUrl: string;
  imageUrl: string;
  storyUrl: string;
  /** e.g. "79 Gold · Triathlete" */
  summary: string;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const text = `${name}'s Strava-FUT card: ${summary}`;

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
      const file = new File([blob], `${slug}-strava-fut.png`, { type: "image/png" });
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
  const tweet = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(pageUrl)}`;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-muted">
      <button type="button" onClick={share} disabled={busy} className={`${btn} border-strava/60 text-foreground`}>
        <Share2 className="h-3.5 w-3.5 text-strava" aria-hidden /> Share
      </button>
      <a href={imageUrl} download={`${slug}-strava-fut.png`} className={btn}>
        <Download className="h-3.5 w-3.5" aria-hidden /> Card
      </a>
      <a href={storyUrl} download={`${slug}-strava-fut-story.png`} className={btn} title="1080×1920 for Instagram, TikTok and Snapchat stories">
        <Smartphone className="h-3.5 w-3.5" aria-hidden /> Story
      </a>
      <button type="button" onClick={copyLink} className={btn}>
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}
        {copied ? "Copied" : "Link"}
      </button>
      <a href={tweet} target="_blank" rel="noopener noreferrer" className={btn} aria-label="Post on X">
        <span className="font-bold" aria-hidden>
          𝕏
        </span>{" "}
        Post
      </a>
    </div>
  );
}
