import { TURTLE_ON_DARK, turtleSvg } from "@/lib/turtle";

/**
 * The Kudex turtle (topo shell), inline so it stays crisp at any size.
 * Pass `size` in px, or omit it and size the element with `className`.
 */
export function TurtleMark({ size, id = "kt", className = "" }: { size?: number; id?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 [&>svg]:h-full [&>svg]:w-full ${className}`}
      style={size ? { width: size, height: size } : undefined}
      dangerouslySetInnerHTML={{ __html: turtleSvg(TURTLE_ON_DARK, id) }}
    />
  );
}
