import { type CSSProperties, ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

/** Conteneur overlay CRM: panneau latéral ou grand modal. */
export function Drawer({
  open,
  onClose,
  title,
  headerContent,
  children,
  footer,
  variant = "side",
  bodyClassName,
  headerClassName,
  headerStyle,
  closeButtonClassName,
  panelClassName,
  footerClassName,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  headerContent?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "side" | "left" | "modal";
  bodyClassName?: string;
  headerClassName?: string;
  headerStyle?: CSSProperties;
  closeButtonClassName?: string;
  panelClassName?: string;
  footerClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(el => el.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
      if (!e.shiftKey && (document.activeElement === last || document.activeElement === panel)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-dialog-title"
        tabIndex={-1}
        className={cn(
          "z-[201] flex flex-col bg-[var(--crm-surface)] shadow-2xl",
          variant === "side" &&
            "fixed inset-y-0 right-0 w-full max-w-2xl border-l border-[var(--crm-border)] animate-slide-in-right",
          variant === "left" &&
            "fixed inset-y-0 left-0 w-full max-w-sm border-r border-[var(--crm-border)] animate-slide-in-left",
          variant === "modal" &&
            "fixed inset-3 overflow-hidden rounded-[30px] border border-[var(--crm-border)] animate-fade-in sm:inset-5 lg:inset-7",
          panelClassName,
        )}
      >
        <div
          className={cn(
            "shrink-0 border-b border-[var(--crm-border)]",
            headerClassName,
          )}
          style={headerStyle}
        >
          <div className="flex items-center justify-between px-5 py-4">
            <div id="request-dialog-title" className="min-w-0 flex-1 text-[var(--foreground)] font-semibold">{title}</div>
            <button
              aria-label="Fermer"
              onClick={onClose}
              className={cn(
                "rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--crm-surface-2)] hover:text-[var(--foreground)]",
                closeButtonClassName,
              )}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {headerContent && <div className="px-5 pb-4">{headerContent}</div>}
        </div>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 text-[var(--foreground)]",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer && (
          <div className={cn("mt-auto shrink-0 border-t border-[var(--crm-border)] bg-[var(--crm-surface)] p-4", footerClassName)}>
            {footer}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
