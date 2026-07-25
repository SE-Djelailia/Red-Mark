// Shared text input: thin line border, brand focus ring, 44px touch target.
import type { InputHTMLAttributes } from "react";

export const inputClassName =
  "w-full px-3 py-2.5 text-sm bg-surface text-ink placeholder:text-faint border border-line rounded-lg transition-colors focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 disabled:bg-subtle disabled:text-muted min-h-[44px]";

export default function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClassName} ${className}`} {...rest} />;
}
