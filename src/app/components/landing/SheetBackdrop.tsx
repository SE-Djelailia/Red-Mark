import { BAR_A_POINTS, BAR_B_POINTS } from "../ui-kit/Logo";

// The hero's underlay: a drafting sheet with the mark set into it.
//
// Two layers, both structural rather than decorative:
//
//   THE GRID   a 32px hairline lattice (.rm-sheet), fading out downward so
//              the sheet reads as a surface the content sits ON, not a
//              texture tiled behind it.
//
//   THE MARK   the logo's own X, drawn from BAR_A_POINTS / BAR_B_POINTS —
//              the same constants Logo.tsx uses — at architectural scale and
//              near-invisible weight. It is OUTLINED, not filled: at this
//              size a filled X would be a large red-adjacent shape, and a
//              ghosted fill is exactly the "surface larger than a badge"
//              the red rule forbids. An outline reads as construction
//              geometry — the setting-out lines of a drawing.
//
// Everything here is aria-hidden and pointer-events-none: it is paper, not
// content.

const toPoints = (pts: [number, number][]) => pts.map(([x, y]) => `${x},${y}`).join(" ");

export default function SheetBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* The sheet. Masked to fade downward so the grid never collides with
          the section rule beneath the hero. */}
      <div
        className="rm-sheet absolute inset-0"
        style={{
          maskImage: "linear-gradient(to bottom, black 0%, black 45%, transparent 92%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 45%, transparent 92%)",
        }}
      />

      {/* The mark, set off the right edge and bled past the top and bottom —
          cropped like a detail enlarged from a larger drawing. Hidden below
          `sm`: on a phone there is no room for it to be architectural, and a
          cramped version would just be clutter behind the headline. */}
      <svg
        className="hidden sm:block absolute -right-[8%] -top-[22%] h-[150%] w-auto"
        viewBox="0 0 100 100"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
      >
        <g
          stroke="var(--color-ink)"
          strokeWidth="0.35"
          strokeLinejoin="miter"
          opacity="0.09"
        >
          <polygon points={toPoints(BAR_A_POINTS)} />
          <polygon points={toPoints(BAR_B_POINTS)} />
        </g>
        {/* Setting-out lines: the diagonals and the centre cross that would
            construct this mark on a drawing board. */}
        <g stroke="var(--color-ink)" strokeWidth="0.2" opacity="0.06">
          <line x1="4" y1="4" x2="96" y2="96" />
          <line x1="96" y1="4" x2="4" y2="96" />
          <line x1="50" y1="-20" x2="50" y2="120" />
          <line x1="-20" y1="50" x2="120" y2="50" />
        </g>
      </svg>
    </div>
  );
}
