import { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-14 z-20 border-b border-[var(--crm-border)] bg-[color:color-mix(in_srgb,var(--crm-bg)_84%,transparent)] backdrop-blur lg:top-0">
      <div className="flex min-h-16 flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:py-0">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions && <div className="w-full min-w-0 lg:w-auto"><div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div></div>}
      </div>
    </header>
  );
}
