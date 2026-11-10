import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const WEEK_DAYS = ["L", "M", "M", "J", "V", "S", "D"];
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parse = (value: string) => new Date(`${value}T12:00:00`);
const label = (value: string) => parse(value).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** Les six semaines qui couvrent le mois, du lundi au dimanche. */
function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
}

/**
 * Sélecteur de date avec calendrier (valeur AAAA-MM-JJ). Le calendrier
 * s'ouvre sous le champ, dans le flux de la page : il n'est jamais coupé par
 * une fenêtre ou un panneau qui défile.
 */
export function DatePicker({ value, onChange, min, placeholder = "Choisir une date", required, id }: {
  value: string; onChange: (value: string) => void; min?: string; placeholder?: string; required?: boolean; id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => parse(value || min || iso(new Date())));
  const root = useRef<HTMLDivElement>(null);
  const todayIso = iso(new Date());

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const shift = (months: number) => setMonth(current => new Date(current.getFullYear(), current.getMonth() + months, 1, 12));
  const pick = (day: string) => { onChange(day); setOpen(false); };

  return <div ref={root} className="mt-1" onKeyDown={event => { if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); } }}>
    <button id={id} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setMonth(parse(value || min || todayIso)); setOpen(current => !current); }}
      className={`flex h-10 w-full items-center gap-2.5 rounded-xl border bg-[var(--crm-surface-2)] px-3 text-left text-sm transition-colors ${open ? "border-brand-500 ring-2 ring-brand-500/25" : "border-[var(--crm-border)] hover:border-brand-500/60"}`}>
      <CalendarDays size={16} className="shrink-0 text-zinc-500" />
      <span className={`min-w-0 flex-1 truncate ${value ? "capitalize" : "text-zinc-500"}`}>{value ? label(value) : placeholder}</span>
    </button>
    {/* Champ caché : garde la validation « obligatoire » du formulaire. */}
    {required && <input tabIndex={-1} aria-hidden required value={value} onChange={() => undefined} className="pointer-events-none h-0 w-full opacity-0" />}
    {open && <div role="dialog" aria-label="Calendrier" className="mt-2 w-full max-w-xs rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)] p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} aria-label="Mois précédent" className="rounded-lg p-1.5 text-zinc-400 hover:bg-[var(--crm-surface-2)]"><ChevronLeft size={18} /></button>
        <p className="text-sm font-semibold capitalize">{month.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</p>
        <button type="button" onClick={() => shift(1)} aria-label="Mois suivant" className="rounded-lg p-1.5 text-zinc-400 hover:bg-[var(--crm-surface-2)]"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-zinc-500">{WEEK_DAYS.map((day, index) => <span key={index} className="py-1">{day}</span>)}</div>
      <div className="grid grid-cols-7 gap-0.5">
        {monthGrid(month).map(date => {
          const day = iso(date);
          const outside = date.getMonth() !== month.getMonth();
          const disabled = Boolean(min && day < min);
          const selected = day === value;
          return <button key={day} type="button" disabled={disabled} onClick={() => pick(day)} aria-label={label(day)} aria-pressed={selected}
            className={`flex h-9 items-center justify-center rounded-lg text-sm tabular-nums transition-colors ${selected ? "bg-brand-500 font-bold text-white" : day === todayIso ? "font-bold text-brand-500 ring-1 ring-inset ring-brand-500" : outside ? "text-zinc-600" : ""} ${disabled ? "cursor-not-allowed opacity-30" : selected ? "" : "hover:bg-[var(--crm-surface-2)]"}`}>
            {date.getDate()}
          </button>;
        })}
      </div>
      <div className="mt-2 flex justify-between border-t border-[var(--crm-border)] pt-2 text-xs font-semibold">
        <button type="button" disabled={Boolean(min && todayIso < min)} onClick={() => pick(todayIso)} className="rounded-lg px-2 py-1 text-brand-500 hover:bg-[var(--crm-surface-2)] disabled:opacity-30">Aujourd’hui</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-zinc-400 hover:bg-[var(--crm-surface-2)]">Fermer</button>
      </div>
    </div>}
  </div>;
}
