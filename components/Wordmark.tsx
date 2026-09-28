import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { TurtleMark } from "./TurtleMark";

/** The mark: just the turtle. Links home unless `asLink` is false. */
export function Wordmark({ asLink = true, className = "" }: { asLink?: boolean; className?: string }) {
  const mark = <TurtleMark size={72} className="-my-4 -ml-2" />;
  const cls = `inline-flex items-center ${className}`;
  return asLink ? (
    <Link href="/" className={cls} aria-label={`${BRAND.name} home`}>
      {mark}
    </Link>
  ) : (
    <span className={cls} role="img" aria-label={BRAND.name}>
      {mark}
    </span>
  );
}
