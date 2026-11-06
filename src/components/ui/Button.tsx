import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500 shadow-sm",
  secondary:
    "border border-[var(--crm-border)] bg-[var(--crm-surface)] text-[var(--foreground)] hover:bg-[var(--crm-surface-2)] focus-visible:ring-zinc-400 shadow-sm",
  outline:
    "border border-[var(--crm-border-strong)] bg-transparent text-[var(--foreground)] hover:bg-[var(--crm-surface-2)] focus-visible:ring-zinc-400 shadow-sm",
  ghost:
    "text-[var(--foreground)]/80 hover:bg-[var(--crm-surface-2)] focus-visible:ring-zinc-400",
  danger:
    "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 shadow-sm",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[var(--crm-surface)]",
        "disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
