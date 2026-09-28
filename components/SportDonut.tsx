import type { SportBreakdown, SportFamily } from "@/types/player";
import { SPORT_COLORS, SPORT_LABELS, SPORT_ORDER } from "@/lib/viz";

const MAX_SEGMENTS = 5;
const R = 42;
const STROKE = 14;
const C = 2 * Math.PI * R;
/** 2px surface gap between segments, expressed along the ring. */
const GAP = 2;

interface Segment {
  family: SportFamily;
  hours: number;
  activities: number;
  share: number;
}

/** Top sports by time, in the fixed colour order; anything past five folds into "Other". */
function segments(sports: SportBreakdown[]): Segment[] {
  const total = sports.reduce((s, f) => s + f.hours, 0);
  if (total <= 0) return [];
  const ranked = [...sports].sort((a, b) => b.hours - a.hours);
  const keep = ranked.slice(0, MAX_SEGMENTS - (ranked.length > MAX_SEGMENTS ? 1 : 0));
  const rest = ranked.slice(keep.length);
  const segs: Segment[] = keep.map((s) => ({ family: s.family, hours: s.hours, activities: s.activities, share: s.hours / total }));
  if (rest.length) {
    const other = segs.find((s) => s.family === "other");
    const hours = rest.reduce((s, f) => s + f.hours, 0);
    const activities = rest.reduce((s, f) => s + f.activities, 0);
    if (other) Object.assign(other, { hours: other.hours + hours, activities: other.activities + activities, share: (other.hours + hours) / total });
    else segs.push({ family: "other", hours, activities, share: hours / total });
  }
  return segs.sort((a, b) => SPORT_ORDER.indexOf(a.family) - SPORT_ORDER.indexOf(b.family));
}

export function SportDonut({ sports }: { sports: SportBreakdown[] }) {
  const segs = segments(sports);
  if (!segs.length) return <p className="font-accent text-xs text-muted">No activities in the last year.</p>;
  const totalHours = segs.reduce((s, f) => s + f.hours, 0);
  // Start position of each segment along the ring (cumulative share).
  const offsets = segs.map((_, i) => segs.slice(0, i).reduce((acc, s) => acc + s.share * C, 0));

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0" role="img" aria-label="Time by sport">
        {/* Ring starts at 12 o'clock. */}
        <g transform="rotate(-90 50 50)">
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-2)" strokeWidth={STROKE} />
          {segs.map((s, i) => {
            const len = s.share * C;
            const dash = segs.length > 1 ? Math.max(0.5, len - GAP) : len;
            return (
              <circle
                key={s.family}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={SPORT_COLORS[s.family]}
                strokeWidth={STROKE}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offsets[i]}
              >
                <title>{`${SPORT_LABELS[s.family]}: ${Math.round(s.share * 100)}% · ${Math.round(s.hours)} h · ${s.activities} activities`}</title>
              </circle>
            );
          })}
        </g>
        <g>
          <text x="50" y="49" textAnchor="middle" className="fill-foreground font-accent" fontSize="15" fontWeight="500">
            {Math.round(totalHours)}
          </text>
          <text x="50" y="62" textAnchor="middle" className="fill-muted font-accent" fontSize="7" letterSpacing="0.8">
            HOURS
          </text>
        </g>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 font-accent text-xs">
        {segs.map((s) => (
          <li key={s.family} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SPORT_COLORS[s.family] }} aria-hidden />
            <span className="uppercase tracking-wider">{SPORT_LABELS[s.family]}</span>
            <span className="ml-auto tabular-nums">{Math.round(s.share * 100)}%</span>
            <span className="w-12 text-right text-muted tabular-nums">{Math.round(s.hours)} h</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
