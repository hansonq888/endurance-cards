"use client";

import { Check, ChevronDown, Download, Link2, Share2, Smartphone } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { useEffect, useRef, useState } from "react";

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
  warm = false,
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
  /** Owner's own card: load the images in the background so Save and Share are instant. */
  warm?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const saveMenu = useRef<HTMLDetailsElement>(null);

  // Close the Save menu on a click or tap anywhere outside it, or on Escape.
  useEffect(() => {
    const close = (e: PointerEvent | KeyboardEvent) => {
      const menu = saveMenu.current;
      if (!menu?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menu.contains(e.target as Node)) menu.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  const closeSaveMenu = () => {
    if (saveMenu.current) saveMenu.current.open = false;
  };

  // Phones: saving goes through the share sheet ("Save Image" → Photos, or straight to Instagram).
  // iOS only opens it right after a tap, so the images are fetched as soon as the menu opens.
  const blobs = useRef(new Map<string, Promise<Blob>>());
  const fetchBlob = (url: string) => {
    let pending = blobs.current.get(url);
    if (!pending) {
      pending = fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))));
      pending.catch(() => blobs.current.delete(url)); // let a later tap retry
      blobs.current.set(url, pending);
    }
    return pending;
  };
  // The owner is the one who saves and shares: fetch both images once the page has settled.
  // The URLs are versioned and browser-cacheable, so the later tap is served from cache.
  useEffect(() => {
    if (!warm) return;
    const id = setTimeout(() => [imageUrl, storyUrl].forEach((u) => fetchBlob(u).catch(() => {})), 2500);
    return () => clearTimeout(id);
  }, [warm, imageUrl, storyUrl]);
  const onPhone = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches && !!navigator.canShare;

  // Which image is loading, and one that's ready but needs a fresh tap (iOS only opens the
  // share sheet right after a tap; if loading took too long it refuses, so we ask again).
  const [preparing, setPreparing] = useState<string | null>(null);
  const [readyToSave, setReadyToSave] = useState<{ file: File; label: string } | null>(null);

  async function shareFile(file: File, label: string) {
    try {
      // Image only (no text or link), so the sheet offers "Save Image".
      await navigator.share({ files: [file] });
      setReadyToSave(null);
    } catch (err) {
      const name = (err as Error).name;
      if (name === "AbortError") return setReadyToSave(null); // closed the sheet
      if (name === "NotAllowedError") return setReadyToSave({ file, label }); // tap took too long: ask for a fresh tap
      throw err;
    }
  }

  async function save(e: React.MouseEvent<HTMLAnchorElement>, url: string, filename: string, label: string) {
    closeSaveMenu();
    if (!onPhone()) return; // computers: the link's normal download
    e.preventDefault();
    setPreparing(label);
    try {
      const blob = await fetchBlob(url);
      const file = new File([blob], filename, { type: blob.type || "image/png" });
      if (!navigator.canShare({ files: [file] })) throw new Error("files not shareable");
      setPreparing(null);
      await shareFile(file, label);
    } catch {
      // Sharing files isn't possible here: fall back to a plain download.
      setPreparing(null);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
    }
  }
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
      // Attach the image where the platform allows it (most phones do); if it won't load, share just the link.
      const linkOnly = { title: text, text, url: pageUrl };
      const blob = await fetchBlob(imageUrl).catch(() => null);
      const withFile = blob && { ...linkOnly, files: [new File([blob], `${slug}-${BRAND.fileSlug}.png`, { type: "image/png" })] };
      await navigator.share(withFile && navigator.canShare?.(withFile) ? withFile : linkOnly);
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
    <div className="relative flex items-center justify-center gap-2 text-muted">
      {readyToSave && (
        <button
          type="button"
          onClick={() => shareFile(readyToSave.file, readyToSave.label)}
          className="absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-strava px-4 py-2 font-accent text-[11px] font-medium uppercase tracking-wider text-white shadow-xl"
        >
          {readyToSave.label === "story" ? "Story ready · tap to save" : "Card ready · tap to save"}
        </button>
      )}
      {!downloadOnly && (
        <button type="button" onClick={share} disabled={busy} className={`${btn} border-strava/60 text-foreground`}>
          <Share2 className="h-3.5 w-3.5 text-strava" aria-hidden /> Share
        </button>
      )}
      {/* Both downloads behind one button: the card PNG and the 1080×1920 story. */}
      <details
        ref={saveMenu}
        className="group relative"
        // Start loading as soon as a finger touches Save, not when the menu finishes opening.
        onPointerDown={() => onPhone() && [imageUrl, storyUrl].forEach((u) => fetchBlob(u).catch(() => {}))}
        onToggle={(e) => {
          if (e.currentTarget.open && onPhone()) [imageUrl, storyUrl].forEach((u) => fetchBlob(u).catch(() => {}));
        }}
      >
        <summary className={`${btn} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
          <Download className={`h-3.5 w-3.5 ${preparing ? "animate-pulse text-strava" : ""}`} aria-hidden /> {preparing ? "Preparing…" : "Save"}
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="absolute left-1/2 z-30 mt-1.5 w-44 -translate-x-1/2 rounded-lg border border-line bg-surface p-1 font-accent text-[11px] shadow-xl">
          <a href={imageUrl} download={`${slug}-${BRAND.fileSlug}.png`} className={item} onClick={(e) => save(e, imageUrl, `${slug}-${BRAND.fileSlug}.png`, "card")}>
            <Download className="h-3.5 w-3.5" aria-hidden /> Card image
          </a>
          <a
            href={storyUrl}
            download={`${slug}-${BRAND.fileSlug}-story.jpg`}
            className={item}
            onClick={(e) => save(e, storyUrl, `${slug}-${BRAND.fileSlug}-story.jpg`, "story")}
          >
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
