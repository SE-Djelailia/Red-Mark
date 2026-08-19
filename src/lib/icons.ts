// THE ICON SYSTEM — sizes and semantics.
//
// The *visual* treatment (stroke weight, square caps, mitered joins) is not
// here: it lives in one `.lucide` rule in design-tokens.css, so every icon in
// the app inherits it with no call-site changes. This module owns the two
// things CSS cannot express — which sizes are legal, and when an icon is
// allowed to be red.

/**
 * The size scale. Four steps, all multiples of 4 to sit on the spacing grid.
 *
 * An audit of the app before this system found 21 distinct icon sizes,
 * including 13, 15, 17, 19, 21 and 34 — values that align to nothing and
 * differ from their neighbours by less than the eye resolves. A scale of four
 * covers every real use:
 *
 *   xs 12  dense metadata inside a badge or chip
 *   sm 16  inline with body text, list-row affordances  (the default)
 *   md 20  buttons, nav, section headers
 *   lg 24  page headers, empty states
 *
 * Display sizes (32/40/48+) are not on this scale. They are illustration, not
 * iconography; pair them with `.lucide-display` for the heavier stroke.
 */
export const ICON_SIZE = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
} as const;

export type IconSizeToken = keyof typeof ICON_SIZE;
export type IconSize = (typeof ICON_SIZE)[IconSizeToken];

/** The default when nothing else is stated. */
export const ICON_SIZE_DEFAULT: IconSize = ICON_SIZE.sm;

/**
 * THE RED BUDGET, for icons.
 *
 * Identical in spirit to the rule for fills: red marks a deficiency, an
 * alert, or the active item — never decoration, and never merely "this icon
 * is important". An icon inherits `currentColor`, so in practice red arrives
 * because the icon sits inside something already red (a destructive button,
 * an alert row). Setting a red class directly on an icon is the exception,
 * and these are the only sanctioned reasons.
 *
 * If you cannot name which of these applies, the icon is ink.
 */
export const ICON_RED_REASONS = [
  /** An open/outstanding déficience, or its count. */
  "deficiency",
  /** A genuine error or destructive-action warning shown to the user. */
  "alert",
  /** The currently-active nav item, paired with the 2px leading rule. */
  "active",
] as const;

export type IconRedReason = (typeof ICON_RED_REASONS)[number];

/**
 * The class to put on an icon that has earned red.
 *
 * A function rather than a constant so the reason is recorded at the call
 * site: it makes the budget greppable and forces the author to name which
 * rule they are invoking.
 */
export function iconRed(_reason: IconRedReason): string {
  return "text-brand-600";
}
