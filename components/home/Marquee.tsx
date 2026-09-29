/**
 * Full-bleed orange band with facts scrolling past, poster-style. The list is
 * rendered twice so the loop is seamless; still under reduced motion.
 */
export function Marquee({ items }: { items: string[] }) {
  const run = (hidden: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((item) => (
        <span key={item} className="flex items-center">
          <span className="display px-6 text-2xl leading-none tracking-tight text-background sm:text-4xl">{item}</span>
          <span className="h-2 w-2 rotate-45 bg-background/70" aria-hidden />
        </span>
      ))}
    </div>
  );
  return (
    <div className="marquee relative -rotate-1 overflow-hidden bg-strava py-4 shadow-[0_20px_60px_-20px_rgba(252,76,2,0.6)] sm:py-5">
      <div className="marquee-track flex w-max">
        {run(false)}
        {run(true)}
      </div>
    </div>
  );
}
