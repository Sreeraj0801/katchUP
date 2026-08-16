/**
 * KatchUP brand mark — a "K" monogram built from four elements on a 120x100 grid:
 *
 *   - ring          open on the right, centre (43.5,52) r36.5, stroke 14
 *   - play triangle rounded, seated left of the ring centre
 *   - upper arm     45deg arrow breaking out through the gap, slender dart head
 *   - lower leg     second diagonal completing the K, meeting the arm on its axis
 *
 * Geometry is traced from the brand artwork. The ring's gap spans 48deg to -40deg
 * so both arms pass through it without their round caps touching the ring (every
 * clearance is >=3.8u against the 14u stroke), which is what keeps the mark from
 * turning into a blob at small sizes.
 *
 * The grid is 1.2:1, so size this with a height and let the width follow
 * (`h-9 w-auto`) rather than forcing a square.
 *
 * `currentColor` throughout, so the mark inherits the surrounding text colour.
 */
export function LogoMark({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="14" strokeLinecap="round">
        {/* Ring: 48deg -> -40deg the long way round, open on the right */}
        <path d="M67.9 24.9A36.5 36.5 0 1 0 71.5 75.5" />
        {/* Upper arm of the K: the rising arrow's shaft */}
        <path d="M55 64 96 21.5" />
        {/* Lower leg of the K, starting on the arm's axis at (72.3,46) */}
        <path d="M72.3 46 104 86" />
      </g>
      {/* Arrow head: slender dart, symmetric about the shaft axis */}
      <path d="M114 3 103.6 33.3 84.1 14.5Z" fill="currentColor" />
      {/* Play triangle. Stroked as well as filled to round its corners. */}
      <path
        d="M30 39 49 52 30 65Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Full lockup. On mobile only the mark shows (per brand guidance); the wordmark
 * appears from the `sm` breakpoint up.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className="h-8 w-auto text-[hsl(var(--brand))] shrink-0" />
      <span className="hidden sm:flex flex-col leading-none">
        <span className="font-extrabold tracking-tight text-lg">KATCHUP</span>
        <span className="text-[9px] font-medium tracking-[0.22em] opacity-60 mt-0.5">
          NEWS REELS
        </span>
      </span>
    </div>
  );
}
