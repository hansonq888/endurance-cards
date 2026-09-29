import { Link2, Smartphone, Code2 } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

function Step({ n, title, children, delay }: { n: number; title: string; children: ReactNode; delay: number }) {
  return (
    <li className="reveal relative border-t border-line pt-6" style={{ "--d": `${delay}ms` } as CSSProperties}>
      <span className="display block text-7xl leading-none text-strava/90 tabular-nums sm:text-8xl">{String(n).padStart(2, "0")}</span>
      <h3 className="display mt-4 text-2xl leading-none tracking-tight">{title}</h3>
      <div className="mt-3 font-accent text-xs leading-relaxed text-muted">{children}</div>
    </li>
  );
}

/** Three bold numbered steps: connect, get rated, share. */
export function HowItWorks() {
  return (
    <ol className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-10">
      <Step n={1} title="Connect Strava" delay={0}>
        Read-only. We look at your last 12 months: runs, rides, swims, hikes, gym and everything in between.
      </Step>
      <Step n={2} title="Get rated" delay={80}>
        <p>Six stats, each 1–99, judged against people who do your sports. Plus an overall, a tier and trophies.</p>
      </Step>
      <Step n={3} title="Share it" delay={160}>
        <p>A card image, a story for Instagram, a link or a README embed. Visitors only see what Strava already shows them.</p>
        <div className="mt-4 flex gap-3 text-foreground" aria-hidden>
          <Smartphone className="h-4 w-4" />
          <Link2 className="h-4 w-4" />
          <Code2 className="h-4 w-4" />
        </div>
      </Step>
    </ol>
  );
}
