// Shared button primitive: primary / secondary / ghost / danger.
//
// THE RED BUDGET LIVES HERE. `primary` is the only variant that fills with
// red, and the system permits at most ONE per screen. `secondary` is an INK
// outline, not a red one — a red-outlined button spends the same attention
// as a red-filled one while saying less.
//
// `danger` is deliberately identical to `primary`: destroying something and
// doing the main thing are both "the red action", and a screen never offers
// both at once. Keeping them visually distinct would require a second red
// treatment, which is exactly the dilution the system forbids.
//
// Sizing keeps the 44px minimum touch target the app already used
// throughout — this is a field app used on phones with gloves on, so the
// visual refresh must not shrink hit areas.
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800",
  // Ink outline. Was `border-line` (a hairline meant for dividers), which
  // made secondary buttons read as disabled next to a primary.
  secondary: "bg-surface text-ink border border-ink hover:bg-subtle active:bg-subtle",
  ghost: "bg-transparent text-ink hover:bg-subtle active:bg-subtle",
  danger: "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800",
};

const SIZE: Record<Size, string> = {
  // 4px grid: 12/20px horizontal padding, 36/44px heights.
  sm: "px-3 text-sm min-h-[36px] gap-1.5",
  md: "px-5 text-sm min-h-[44px] gap-2",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  children: ReactNode;
}

export default function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-[4px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
