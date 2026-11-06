import { cn } from "../../lib/cn";

export function UnderlineTabs<T extends string>({
  items,
  value,
  onChange,
  counts,
  className,
  size = "md",
}: {
  items: { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  counts?: Partial<Record<T, number>>;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className={cn("border-b border-zinc-800", className)}>
      <div className="flex flex-wrap items-end gap-6">
        {items.map((item) => {
          const active = item.key === value;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChange(item.key)}
              className={cn(
                "border-b-2 pb-3 font-medium transition-colors",
                size === "sm" ? "text-sm" : "text-[15px]",
                active
                  ? "border-brand-500 text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-300",
              )}
            >
              <span>{item.label}</span>
              {counts?.[item.key] !== undefined && (
                <span className="ml-2 text-xs text-zinc-500">
                  {counts[item.key]}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
