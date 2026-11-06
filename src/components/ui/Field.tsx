import {
  Children,
  type ChangeEvent,
  forwardRef,
  InputHTMLAttributes,
  isValidElement,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

const baseField =
  "w-full rounded-xl border bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted-foreground)] shadow-sm " +
  "border-[var(--border)] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 " +
  "transition-colors focus:outline-none disabled:opacity-50";

export function Label({
  children,
  required,
  htmlFor,
}: {
  children: ReactNode;
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-sm font-medium text-[var(--foreground)]"
    >
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-sm text-red-500">{children}</p>;
}

export function Field({
  label,
  required,
  error,
  htmlFor,
  children,
  hint,
}: {
  label?: string;
  required?: boolean;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div>
      {label && (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      )}
      {children}
      {hint && !error && (
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{hint}</p>
      )}
      <FieldError>{error}</FieldError>
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(baseField, "h-10 px-3", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(baseField, "px-3 py-2 min-h-[88px] resize-y", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

type ParsedSelectOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

function extractOptions(children: ReactNode): ParsedSelectOption[] {
  const options: ParsedSelectOption[] = [];

  function visit(node: ReactNode) {
    Children.forEach(node, (child) => {
      if (!isValidElement(child)) return;
      if (child.type === "option") {
        const props = child.props as {
          value?: string | number;
          disabled?: boolean;
          children?: ReactNode;
        };
        options.push({
          value: String(props.value ?? ""),
          label: props.children,
          disabled: props.disabled,
        });
        return;
      }
      const props = child.props as { children?: ReactNode };
      if (props.children !== undefined) {
        visit(props.children);
      }
    });
  }

  visit(children);
  return options;
}

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(
  (
    {
      className,
      children,
      value,
      defaultValue,
      onChange,
      onBlur,
      disabled,
      id,
      name,
      required,
      ...props
    },
    ref,
  ) => {
    const [open, setOpen] = useState(false);
    const [internalValue, setInternalValue] = useState(String(defaultValue ?? ""));
    const containerRef = useRef<HTMLDivElement | null>(null);
    const hiddenSelectRef = useRef<HTMLSelectElement | null>(null);
    const options = useMemo(() => extractOptions(children), [children]);
    const isControlled = value !== undefined;
    const resolvedValue = String(isControlled ? value ?? "" : internalValue);
    const selectedOption = options.find((option) => option.value === resolvedValue);
    const emptyOption = options.find((option) => option.value === "");

    useImperativeHandle(ref, () => hiddenSelectRef.current as HTMLSelectElement, []);

    useEffect(() => {
      if (!open) return;

      const onPointerDown = (event: MouseEvent) => {
        if (!containerRef.current?.contains(event.target as Node)) {
          setOpen(false);
        }
      };

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setOpen(false);
        }
      };

      document.addEventListener("mousedown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
      return () => {
        document.removeEventListener("mousedown", onPointerDown);
        document.removeEventListener("keydown", onKeyDown);
      };
    }, [open]);

    const displayLabel = selectedOption?.label ?? emptyOption?.label ?? "Sélectionner…";
    const showingPlaceholder = !selectedOption || resolvedValue === "";

    function commitValue(nextValue: string) {
      const element = hiddenSelectRef.current;
      if (!element) {
        if (!isControlled) setInternalValue(nextValue);
        return;
      }

      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      );
      descriptor?.set?.call(element, nextValue);
      element.dispatchEvent(new Event("change", { bubbles: true }));
      setOpen(false);
    }

    return (
      <div ref={containerRef} className="relative">
        <select
          {...props}
          ref={hiddenSelectRef}
          id={id}
          name={name}
          required={required}
          disabled={disabled}
          value={resolvedValue}
          onChange={(event) => {
            if (!isControlled) {
              setInternalValue(event.target.value);
            }
            onChange?.(event);
          }}
          onBlur={onBlur}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        >
          {children}
        </select>

        <button
          type="button"
          id={id ? `${id}-trigger` : undefined}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          onBlur={(event) => {
            const nextTarget = event.relatedTarget as Node | null;
            if (!containerRef.current?.contains(nextTarget)) {
              setOpen(false);
              if (hiddenSelectRef.current) {
                onBlur?.({
                  ...event,
                  target: hiddenSelectRef.current,
                  currentTarget: hiddenSelectRef.current,
                } as never);
              }
            }
          }}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            baseField,
            "flex h-10 items-center justify-between gap-3 px-3 text-left",
            "hover:border-brand-500/50",
            open && "border-brand-500 ring-2 ring-brand-500/30",
            className,
          )}
        >
          <span
            className={cn(
              "min-w-0 truncate",
              showingPlaceholder
                ? "text-[var(--muted-foreground)]"
                : "text-inherit",
            )}
          >
            {displayLabel}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform",
              open && "rotate-180",
            )}
          />
        </button>

        {open && !disabled && (
          <div className="absolute z-[120] mt-2 w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] p-1 shadow-[0_20px_50px_rgba(0,0,0,0.15)]">
            <div className="max-h-72 overflow-y-auto">
              {options.map((option) => {
                const active = option.value === resolvedValue;
                return (
                  <button
                    key={`${name ?? id ?? "select"}-${option.value}`}
                    type="button"
                    disabled={option.disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => commitValue(option.value)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                      // Jetons sémantiques : corrects en clair public, CRM sombre
                      // ET CRM clair (où l'échelle zinc est inversée).
                      "text-[var(--foreground)] hover:bg-[var(--accent)]",
                      active && "bg-brand-50 text-brand-700 dark:bg-primary/14 dark:text-primary",
                      option.disabled &&
                        "cursor-not-allowed text-[var(--muted-foreground)] hover:bg-transparent",
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {active && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  },
);
Select.displayName = "Select";

export function Checkbox({
  label,
  description,
  className,
  variant = "card",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  description?: string;
  variant?: "card" | "inline";
}) {
  const isControlled = props.checked !== undefined;
  const [internalChecked, setInternalChecked] = useState(Boolean(props.defaultChecked));
  const checked = isControlled ? Boolean(props.checked) : internalChecked;

  useEffect(() => {
    if (isControlled) {
      setInternalChecked(Boolean(props.checked));
    }
  }, [isControlled, props.checked]);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!isControlled) {
        setInternalChecked(event.target.checked);
      }
      props.onChange?.(event);
    },
    [isControlled, props],
  );

  return (
    <label
      className={cn(
        "cursor-pointer transition-colors",
        variant === "card" &&
          "flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3 hover:bg-[var(--accent)]",
        variant === "card" &&
          "has-[:checked]:border-brand-500 has-[:checked]:bg-brand-500/10",
        variant === "inline" &&
          "inline-flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--card)]/95 px-3 py-2 text-[var(--foreground)] shadow-sm hover:border-primary/35 hover:bg-[var(--accent)]",
        variant === "inline" && checked && "border-primary/40 bg-primary/12",
        className,
      )}
    >
      <input
        type="checkbox"
        className="sr-only"
        {...props}
        onChange={handleChange}
      />
      <span
        className={cn(
          "flex shrink-0 items-center justify-center border transition-colors",
          variant === "card" ? "mt-0.5 h-4.5 w-4.5 rounded-full" : "h-4.5 w-4.5 rounded-full",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-zinc-500 bg-transparent text-transparent dark:border-muted-foreground/60",
        )}
      >
        <Check className="h-3 w-3" strokeWidth={3.2} />
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block text-sm font-medium text-[var(--foreground)]",
          )}
        >
          {label}
        </span>
        {description && (
          <span className="block text-xs text-[var(--muted-foreground)]">{description}</span>
        )}
      </span>
    </label>
  );
}
