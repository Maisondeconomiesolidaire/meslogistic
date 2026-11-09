import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bus, Check, Plus } from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { Input } from "./components/ui/Field";
import { shortDate } from "./components/crm/LogisticsCard";
import { shortLocation, type Request } from "./Demandes";
import { assignableShuttles, today } from "./TransferPlanning";

export function ProcessSteps({ request, canUpdate, onScheduled }: { request: Request; canUpdate: boolean; onScheduled: (date: string, version: number) => void }) {
  const advance = useMutation(api.meslogistic.advance);
  const assign = useMutation(api.meslogistic.assignShuttle);
  const createShuttle = useMutation(api.meslogistic.createShuttle);
  const shuttles = useQuery(api.meslogistic.shuttlesOverview, {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!pickerOpen || !dialog.current) return;
    const element = dialog.current;
    element.showModal();
    return () => { if (element.open) element.close(); };
  }, [pickerOpen]);
  const current = shuttles?.find(shuttle => shuttle._id === request.shuttleId);
  const planned = Boolean(request.shuttleId);
  const transit = ["en_transit", "receptionnee"].includes(request.status);
  const received = request.status === "receptionnee";
  const blocked = busy || !canUpdate || request.status === "annulee";
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Opération impossible."); } finally { setBusy(false); }
  }
  function choose(shuttleId: Id<"mlShuttles"> | null, scheduledDate?: string) {
    return run(async () => {
      const result = await assign({ id: request._id, shuttleId, expectedUpdatedAt: request.updatedAt });
      onScheduled((shuttleId ? scheduledDate : request.scheduledDate) ?? "", result.updatedAt);
      setPickerOpen(false);
    });
  }
  function submitNew(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const shuttleId = await createShuttle({ name: newName, scheduledDate: newDate });
      const result = await assign({ id: request._id, shuttleId, expectedUpdatedAt: request.updatedAt });
      onScheduled(newDate, result.updatedAt);
      setNewName(""); setNewDate(""); setPickerOpen(false);
    });
  }
  const steps = [
    { label: "Navette assignée", done: planned || transit, disabled: blocked || request.status !== "a_preparer", action: () => { setError(""); setPickerOpen(true); }, content: <p className="mt-2 text-xs text-zinc-500">{current ? `${current.name} · ${shortDate(current.scheduledDate)}` : request.shuttleId ? "…" : "Choisir une navette"}</p> },
    { label: "En transit", done: transit, disabled: blocked || !planned || request.status !== "a_preparer", action: () => run(async () => { await advance({ id: request._id, step: "en_transit", expectedUpdatedAt: request.updatedAt }); }), content: !planned && request.status === "a_preparer" ? <p className="mt-2 text-xs text-zinc-500">Assignez une navette avant le départ.</p> : null },
    { label: "Disponible à destination", done: received, disabled: blocked || request.status !== "en_transit", action: () => run(async () => { await advance({ id: request._id, step: "receptionnee", expectedUpdatedAt: request.updatedAt }); }), content: <p className="mt-2 text-xs text-zinc-500">Confirme la réception de la totalité du lot.</p> },
  ];
  const done = steps.filter(step => step.done).length;
  return <section className="space-y-4"><h3 className="font-semibold">Process</h3>
    <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface-2)] p-3"><div className="mb-2 flex justify-between text-xs font-medium uppercase tracking-[0.14em] text-zinc-500"><span>Complétude</span><span className="text-brand-300">{Math.round(done / steps.length * 100)} %</span></div><div className="h-2.5 overflow-hidden rounded-full bg-[var(--crm-surface-3)]"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${done / steps.length * 100}%` }} /></div></div>
    <ol className="flex gap-3 overflow-x-auto pb-1">{steps.map((step, index) => <li key={step.label} className={`flex min-h-36 min-w-[180px] flex-1 flex-col rounded-3xl border p-3 text-center text-sm ${step.done ? "border-brand-500/35 bg-brand-500/10" : "border-[var(--crm-border)] bg-[var(--crm-surface-2)]"}`}><button type="button" role="checkbox" aria-checked={step.done} disabled={step.disabled} onClick={step.action} aria-label={step.label} className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl disabled:cursor-not-allowed disabled:opacity-70"><span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${step.done ? "border-brand-500 bg-brand-500 text-white" : "border-zinc-500 text-zinc-400"}`}>{step.done ? <Check size={16} /> : index + 1}</span><span className="font-semibold">{step.label}</span></button>{step.content}</li>)}</ol>
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    {pickerOpen && <dialog ref={dialog} aria-labelledby="shuttle-title" onCancel={event => { event.preventDefault(); setPickerOpen(false); }} onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }} className="m-auto w-[min(34rem,calc(100%-2rem))] rounded-3xl border border-[var(--crm-border)] bg-[var(--crm-surface)] p-6 text-[var(--foreground)] shadow-2xl backdrop:bg-black/70">
      <div className="space-y-4">
        <div><h3 id="shuttle-title" className="text-lg font-bold">Assigner une navette</h3><p className="mt-1 text-sm text-zinc-500">{shortLocation(request.origin)} → {shortLocation(request.destination)}{request.dueDate ? ` · échéance ${shortDate(request.dueDate)}` : ""}. La date de départ devient celle de la navette.</p></div>
        {shuttles === undefined ? <p className="text-sm text-zinc-500">Chargement des navettes…</p> : assignableShuttles(shuttles, request.shuttleId).length === 0 ? <p className="rounded-xl bg-[var(--crm-surface-2)] p-3 text-sm text-zinc-500">Aucune navette à venir : créez-en une ci-dessous.</p> :
          <ul className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">{assignableShuttles(shuttles, request.shuttleId).map(shuttle => {
            const selected = shuttle._id === request.shuttleId;
            const late = Boolean(request.dueDate && shuttle.scheduledDate > request.dueDate);
            return <li key={shuttle._id} className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${selected ? "border-brand-500 bg-brand-500/10" : "border-[var(--crm-border)] bg-[var(--crm-surface-2)]"}`}>
              <div className="min-w-0"><p className="flex items-center gap-2 text-sm font-semibold"><Bus size={15} className="shrink-0" /><span className="truncate">{shuttle.name}</span></p><p className="mt-0.5 text-xs text-zinc-500">{shortDate(shuttle.scheduledDate)}{shuttle.scheduledDate < today() ? " · passée" : ""} · {shuttle.transits.length} transit{shuttle.transits.length > 1 ? "s" : ""}{late ? " · après l’échéance" : ""}</p></div>
              {selected ? <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-500"><Check size={14} />Assignée</span>
                : <button type="button" disabled={busy} onClick={() => void choose(shuttle._id, shuttle.scheduledDate)} className="shrink-0 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Assigner</button>}
            </li>;
          })}</ul>}
        <form onSubmit={submitNew} className="space-y-2 rounded-xl border border-dashed border-[var(--crm-border)] p-3">
          <p className="text-sm font-semibold">Nouvelle navette</p>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]"><Input required maxLength={100} placeholder="Nom (ex. Tournée mardi)" value={newName} onChange={event => setNewName(event.target.value)} /><Input required type="date" min={today()} aria-label="Date de la navette" value={newDate} onChange={event => setNewDate(event.target.value)} /></div>
          <button type="submit" disabled={busy || !newName.trim() || !newDate} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--crm-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"><Plus size={14} />Créer et assigner</button>
        </form>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-between gap-2">
          {request.shuttleId ? <button type="button" disabled={busy} onClick={() => void choose(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-red-500 disabled:opacity-50">Retirer la navette</button> : <span />}
          <button type="button" disabled={busy} onClick={() => setPickerOpen(false)} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold">Fermer</button>
        </div>
      </div>
    </dialog>}
  </section>;
}
