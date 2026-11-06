import { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      {icon && (
        <div className="mb-3 text-zinc-400 dark:text-zinc-600">{icon}</div>
      )}
      <h3 className="text-base font-semibold text-zinc-700 dark:text-zinc-200">
        {title}
      </h3>
      {description && (
        <p className="mt-1 text-sm text-zinc-500 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
