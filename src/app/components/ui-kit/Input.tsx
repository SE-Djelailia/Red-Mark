// Shared text input: thin line border, brand focus ring, 44px touch target.
import type { InputHTMLAttributes } from "react";

export const inputClassName =
  "w-full px-3 py-2.5 text-sm bg-surface text-ink placeholder:text-faint border border-line rounded-lg transition-colors focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 disabled:bg-subtle disabled:text-muted min-h-[44px]";

// Field label. The forms had drifted into two variants (ink vs zinc-700,
// medium vs regular); this is the single one.
export const labelClassName = "block text-sm font-medium text-ink mb-1.5";

// <select> can't use inputClassName verbatim — it needs the native arrow
// and pr room for it — but it should match the input's box exactly.
export const selectClassName =
  "w-full px-3 py-2.5 text-sm bg-surface text-ink border border-line rounded-lg transition-colors focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 disabled:bg-subtle disabled:text-muted min-h-[44px]";

// Multi-line variant: same box, no fixed height floor, no resize handle.
export const textareaClassName =
  "w-full px-3 py-2.5 text-sm bg-surface text-ink placeholder:text-faint border border-line rounded-lg transition-colors focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 resize-none";

export default function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClassName} ${className}`} {...rest} />;
}
