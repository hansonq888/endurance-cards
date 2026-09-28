"use client";

import { Check, Copy } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { useState } from "react";
import { SectionHeading } from "./SectionHeading";

export function EmbedSnippet({ pageUrl, imageUrl, name }: { pageUrl: string; imageUrl: string; name: string }) {
  const snippets = [
    { label: "Markdown", value: `[![${name}'s ${BRAND.name} card](${imageUrl})](${pageUrl})` },
    { label: "HTML", value: `<a href="${pageUrl}"><img src="${imageUrl}" alt="${name}'s ${BRAND.name} card" width="300"></a>` },
    { label: "Image URL", value: imageUrl },
  ];
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context) — the text is still selectable.
    }
  }

  return (
    <section className="grain rounded-2xl border border-line p-5">
      <SectionHeading>Embed your card</SectionHeading>
      <div className="space-y-3">
        {snippets.map(({ label, value }) => (
          <div key={label}>
            <p className="mb-1 font-accent text-[11px] uppercase tracking-wider text-muted">{label}</p>
            <div className="flex items-stretch gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border border-line px-3 py-2 font-accent text-xs">{value}</code>
              <button
                type="button"
                onClick={() => copy(label, value)}
                className="flex items-center gap-1 rounded-md border border-line px-3 font-accent text-xs hover:bg-surface-2"
                aria-label={`Copy ${label}`}
              >
                {copied === label ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === label ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
