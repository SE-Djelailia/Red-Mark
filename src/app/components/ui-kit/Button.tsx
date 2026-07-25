// Shared button primitive: primary / secondary / ghost / danger.
//
// Sizing keeps the 44px minimum touch target the app already used
// throughout — this is a field app used on phones with gloves on, so the
// visual refresh must not shrink hit areas.
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800",
  secondary: "bg-surface text-ink border border-line hover:bg-subtle active:bg-subtle",
  ghost: "bg-transparent text-body hover:bg-subtle active:bg-subtle",
  danger: "bg-surface text-open border border-open/30 hover:bg-open/5",
};

const SIZE: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm min-h-[36px] gap-1.5",
  md: "px-4 py-2.5 text-sm min-h-[44px] gap-2",
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
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
