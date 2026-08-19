// THE REDMARK ICONS — the glyphs that carry the product's own vocabulary.
//
// These are drawn, not borrowed. Everything else in the app is lucide,
// restyled by the `.lucide` rule in design-tokens.css; these must sit beside
// those without announcing themselves, so they share that treatment exactly:
//
//   viewBox   0 0 24 24      (lucide's grid — sizes interchange 1:1)
//   stroke    currentColor at var(--icon-stroke), i.e. 1.5
//   caps      butt · joins miter · miterlimit 4
//   fill      none
//
// They inherit all of that by carrying `className="lucide"` themselves rather
// than re-declaring it, so a future change to the icon rule reaches them too.
// That is the whole reason they are stroked SVG and not scaled logo polygons:
// the logo is filled geometry on a 0–100 box and would read heavier and
// rounder than its neighbours at 16px.
//
// DRAWING RULES, shared by every glyph here:
//   · Geometry lands on whole or half units of the 24 grid.
//   · The safe area is 3..21; nothing touches the box edge.
//   · No curves unless the noun demands one (a lens is round; a room is not).

import type { SVGProps } from "react";

export interface RedMarkIconProps extends Omit<SVGProps<SVGSVGElement>, "size"> {
  /** Matches lucide's prop so the two sets are drop-in interchangeable. */
  size?: number;
}

/**
 * Shared shell. `className="lucide"` is deliberate: it is the hook the icon
 * system styles, so these glyphs pick up stroke weight, caps and joins from
 * the same single rule as every lucide icon — including any future change.
 */
function Glyph({
  size = 16,
  className = "",
  children,
  ...rest
}: RedMarkIconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={`lucide ${className}`}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ── THE MARK ─────────────────────────────────────────────────────────────
   The deficiency X — the core glyph, and the one the brand is named for.

   Drawn as two crossing strokes from 5,5 to 19,19 and back. That is a
   deliberate 45° on the grid: the logo's bars are also true diagonals, so
   the icon reads as the same gesture even though one is filled and one is
   stroked. Butt caps (from the .lucide rule) give the four flat ends the
   logo achieves with polygons — which is exactly why the logo is drawn as
   polygons in the first place; see Logo.tsx.

   Extent 5..19 rather than 4..20: the X is the most-seen meaningful icon in
   the app, and pulling it in slightly keeps its optical weight equal to a
   lucide glyph beside it, whose geometry rarely reaches the safe-area edge.
─────────────────────────────────────────────────────────────────────────── */
export function MarkX(props: RedMarkIconProps) {
  return (
    <Glyph {...props}>
      <path d="M5 5 L19 19" />
      <path d="M19 5 L5 19" />
    </Glyph>
  );
}

/* ── THE LIFECYCLE SET ────────────────────────────────────────────────────
   signalé → à corriger → corrigé → vérifié

   These four are the only icons in the app that must be read as a SEQUENCE,
   so they are built from one constant and one variable:

     CONSTANT  a 14×14 square frame at 5,5 — the déficience itself, the
               thing being tracked. It never changes across the four, so the
               eye has a fixed anchor and reads only the difference.
     VARIABLE  what sits inside the frame, which fills in as work progresses:

       signalé      empty frame + the mark      the X is inside, untouched
       à corriger   frame + mark + a bar        struck through: assigned
       corrigé      frame + a check             the contractor's tick
       vérifié      frame + check + a rule      countersigned along the base

   The progression is deliberately additive — each state carries one more
   stroke than the last — so "further along" is legible as "more marked up",
   which is how a marked drawing actually accumulates. That also means the
   set survives being shown out of order or at 12px, where a colour-only or
   shape-only distinction would collapse.
─────────────────────────────────────────────────────────────────────────── */

/** The frame every lifecycle glyph shares. 14×14 at 5,5, square corners. */
const FRAME = <rect x="5" y="5" width="14" height="14" />;

/** SIGNALÉ — reported. The mark, inside the frame, nothing done to it yet. */
export function StateSignale(props: RedMarkIconProps) {
  return (
    <Glyph {...props}>
      {FRAME}
      <path d="M9 9 L15 15" />
      <path d="M15 9 L9 15" />
    </Glyph>
  );
}

/** À CORRIGER — assigned. The mark struck through: someone now owns it. */
export function StateACorriger(props: RedMarkIconProps) {
  return (
    <Glyph {...props}>
      {FRAME}
      <path d="M9 9 L15 15" />
      <path d="M15 9 L9 15" />
      <path d="M3 21 L21 3" />
    </Glyph>
  );
}

/** CORRIGÉ — the contractor's tick. The X is gone; the work is claimed done. */
export function StateCorrige(props: RedMarkIconProps) {
  return (
    <Glyph {...props}>
      {FRAME}
      <path d="M8.5 12 L11 14.5 L15.5 9.5" />
    </Glyph>
  );
}

/** VÉRIFIÉ — countersigned. The tick, plus a rule along the base: inspected. */
export function StateVerifie(props: RedMarkIconProps) {
  return (
    <Glyph {...props}>
      {FRAME}
      <path d="M8.5 11 L11 13.5 L15.5 8.5" />
      <path d="M8 16.5 L16 16.5" />
    </Glyph>
  );
}

/* ── THE CORE NOUNS ───────────────────────────────────────────────────────
   Only three earn a custom draw. The test was whether the noun means
   something specific HERE that a generic glyph blurs — not whether a custom
   version is possible.

   Everything else (search, calendar, settings, upload…) means exactly what
   it means everywhere, and lucide's version restyled is better than a
   redrawn one: familiar, and already consistent.
─────────────────────────────────────────────────────────────────────────── */

/**
 * PHOTO — a site photo, not a camera.
 *
 * lucide's Camera draws the device: body, hump, round lens. Here the noun is
 * the RECORD, so this draws the frame and its subject — a plate with a
 * horizon and an aperture. Square body, no hump, so it sits flat beside the
 * lifecycle frames, which share the same 14-unit square language.
 */
export function IconPhoto(props: RedMarkIconProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="5" width="18" height="14" />
      {/* The frame's own rule — a title-block line inside the plate. */}
      <path d="M3 16 L21 16" />
      {/* The aperture. The one curve in this set: a lens is round, and no
          square form reads as "exposure". */}
      <circle cx="12" cy="10.5" r="2.5" />
    </Glyph>
  );
}

/**
 * LOCATION — a room on a plan, not a dropped GPS pin.
 *
 * lucide's MapPin is the teardrop of consumer mapping, which is wrong for
 * this product: a location here is a LOCAL on a floor plan, identified by
 * number. So this is a plan fragment — an enclosing wall with a door swing
 * gap, and the point marked inside it. That reads as architecture rather
 * than as navigation.
 */
export function IconLocation(props: RedMarkIconProps) {
  return (
    <Glyph {...props}>
      {/* Wall, open at the base right — the door. */}
      <path d="M4 20 L4 4 L20 4 L20 20 L14 20" />
      {/* The marked point inside the room. */}
      <path d="M9 12.5 L12 15.5 L15 12.5" />
      <path d="M12 8 L12 15.5" />
    </Glyph>
  );
}

/**
 * VISIT — a dated site visit.
 *
 * lucide's Calendar is a month; a visit is one DAY on site. This keeps the
 * sheet and its binding rule but marks a single square, so the glyph says
 * "this date" rather than "dates in general".
 */
export function IconVisit(props: RedMarkIconProps) {
  return (
    <Glyph {...props}>
      <rect x="4" y="5" width="16" height="15" />
      {/* The binding rule, where a calendar's header sits. */}
      <path d="M4 9.5 L20 9.5" />
      {/* The two ties. */}
      <path d="M9 3 L9 6" />
      <path d="M15 3 L15 6" />
      {/* The day itself — one filled cell, the only fill in the set, because
          a stroked 3-unit square at 16px closes up into a dot anyway. */}
      <rect x="10.5" y="13" width="3" height="3" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

/* ── STATUS → GLYPH ───────────────────────────────────────────────────────
   One map, so every surface that shows a déficience's state resolves the
   same glyph. `Record<IssueStatus, …>` forces exhaustiveness: adding a
   fifth state to the union without drawing it is a compile error, which is
   the same guarantee ISSUE_STATUS_LABEL already gives for wording.
─────────────────────────────────────────────────────────────────────────── */

import type { IssueStatus } from "../../../lib/issueStatus";

const STATUS_GLYPH: Record<IssueStatus, (p: RedMarkIconProps) => React.ReactElement> = {
  signale: StateSignale,
  a_corriger: StateACorriger,
  corrige: StateCorrige,
  verifie: StateVerifie,
};

/**
 * The glyph for a status, as a COMPONENT rather than a component factory.
 *
 * Selecting the component inside a parent's render (`const G =
 * statusGlyph(s)`) gives React a new element type on some renders, which can
 * remount the subtree — react-hooks/static-components flags exactly this.
 * Doing the lookup *inside* one stable component keeps the element type
 * constant and the switch a plain prop change.
 *
 * `issues.status` is `IssueStatus | null` in the generated row type, and a
 * null there means "legacy row not yet normalised" — semantically "signalé",
 * the same default the DB itself applies.
 */
export function StatusGlyph({
  status,
  ...rest
}: RedMarkIconProps & { status: IssueStatus | null | undefined }) {
  const Glyph = STATUS_GLYPH[status ?? "signale"];
  return <Glyph {...rest} />;
}
