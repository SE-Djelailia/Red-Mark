// Shared text input primitive.
//
// FOCUS IS INK, NOT RED. This is the one change here that matters: a red
// focus ring spends the mark on "the cursor is here", which is navigation,
// not alarm. Under the red budget, moving through a form must not look like
// an error. Focus is a 2px ink ring on an ink border — higher contrast than
// the red ring it replaces, and it leaves red free to mean something.
//
// Fields sit on `subtle` rather than `surface`: an inset well reads as
// editable against a white card, without needing a heavier border.
import type { InputHTMLAttributes } from "react";

export const inputClassName =
  "w-full px-3 py-2.5 text-sm bg-subtle text-ink placeholder:text-faint border border-line-strong rounded-[4px] transition-colors focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 disabled:bg-subtle disabled:text-muted min-h-[44px]";

// Field label. The forms had drifted into two variants (ink vs zinc-700,
// medium vs regular); this is the single one.
// The title-block voice: 11px uppercase, tracked. Field names are LABELS,
// not headings — they name content rather than being content, so they take
// the drawing-sheet treatment rather than sentence-case body type.
export const labelClassName =
  "block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted mb-1.5";

// <select> can't use inputClassName verbatim — it needs the native arrow
// and pr room for it — but it should match the input's box exactly.
export const selectClassName =
  "w-full px-3 py-2.5 text-sm bg-subtle text-ink border border-line-strong rounded-[4px] transition-colors focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 disabled:bg-subtle disabled:text-muted min-h-[44px]";

// Multi-line variant: same box, no fixed height floor, no resize handle.
export const textareaClassName =
  "w-full px-3 py-2.5 text-sm bg-subtle text-ink placeholder:text-faint border border-line-strong rounded-[4px] transition-colors focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 resize-none";

export default function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClassName} ${className}`} {...rest} />;
}
