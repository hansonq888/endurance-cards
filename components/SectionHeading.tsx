/** Open section: a bold display label over a hairline rule — no box. `bare` drops the rule (for headers with controls). */
export function SectionHeading({ children, bare = false }: { children: React.ReactNode; bare?: boolean }) {
  return (
    <h2 className={`display text-sm leading-none tracking-tight text-foreground ${bare ? "" : "mb-4 border-b border-line pb-2"}`}>
      {children}
    </h2>
  );
}
