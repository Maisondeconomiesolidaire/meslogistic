import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Check } from "lucide-react";
import { api } from "../convex/_generated/api";
import { Input } from "./components/ui/Field";
import type { Request } from "./Demandes";

export function ProcessSteps({ request, canUpdate, onScheduled }: { request: Request; canUpdate: boolean; onScheduled: (date: string, version: number) => void }) {
  const schedule = useMutation(api.meslogistic.schedule);
  const advance = useMutation(api.meslogistic.advance);
  const [date, setDate] = useState(request.scheduledDate ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => setDate(request.scheduledDate ?? ""), [request.scheduledDate]);
  useEffect(() => {
    if (!dateOpen || !dialog.current) return;
    const element = dialog.current;
    element.showModal();
    return () => { if (element.open) element.close(); };
  }, [dateOpen]);
  const planned = Boolean(request.prepared && request.scheduledDate);
  const transit = ["en_transit", "receptionnee"].includes(request.status);
  const received = request.status === "receptionnee";
  const blocked = busy || !canUpdate || request.status === "annulee";
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Opération impossible."); } finally { setBusy(false); }
  }
  const steps = [
    { label: "Date programmée", done: planned, disabled: blocked || request.status !== "a_preparer", action: () => { setError(""); setDate(request.scheduledDate ?? ""); setDateOpen(true); }, content: <p className="mt-2 text-xs text-zinc-500">{request.scheduledDate ? new Date(`${request.scheduledDate}T12:00:00`).toLocaleDateString("fr-FR") : "Choisir une date"}</p> },
    { label: "En transit", done: transit, disabled: blocked || !planned || request.status !== "a_preparer" || Boolean(request.orderId && !request.shuttleId), action: () => run(async () => { await advance({ id: request._id, step: "en_transit", expectedUpdatedAt: request.updatedAt }); }), content: request.orderId && !request.shuttleId ? <p className="mt-2 text-xs text-zinc-500">Affectez une navette avant le départ.</p> : null },
    { label: "Disponible à destination", done: received, disabled: blocked || request.status !== "en_transit", action: () => run(async () => { await advance({ id: request._id, step: "receptionnee", expectedUpdatedAt: request.updatedAt }); }), content: <p className="mt-2 text-xs text-zinc-500">Confirme la réception de la totalité du lot.</p> },
  ];
  const done = steps.filter(step => step.done).length;
  return <section className="space-y-4"><h3 className="font-semibold">Process</h3>
    <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface-2)] p-3"><div className="mb-2 flex justify-between text-xs font-medium uppercase tracking-[0.14em] text-zinc-500"><span>Complétude</span><span className="text-brand-300">{Math.round(done / steps.length * 100)} %</span></div><div className="h-2.5 overflow-hidden rounded-full bg-[var(--crm-surface-3)]"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${done / steps.length * 100}%` }} /></div></div>
    <ol className="flex gap-3 overflow-x-auto pb-1">{steps.map((step, index) => <li key={step.label} className={`flex min-h-36 min-w-[180px] flex-1 flex-col rounded-3xl border p-3 text-center text-sm ${step.done ? "border-brand-500/35 bg-brand-500/10" : "border-[var(--crm-border)] bg-[var(--crm-surface-2)]"}`}><button type="button" role="checkbox" aria-checked={step.done} disabled={step.disabled} onClick={step.action} aria-label={step.label} className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl disabled:cursor-not-allowed disabled:opacity-70"><span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${step.done ? "border-brand-500 bg-brand-500 text-white" : "border-zinc-500 text-zinc-400"}`}>{step.done ? <Check size={16} /> : index + 1}</span><span className="font-semibold">{step.label}</span></button>{step.content}</li>)}</ol>
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    {dateOpen && <dialog ref={dialog} aria-labelledby="schedule-title" onCancel={event => { event.preventDefault(); setDateOpen(false); }} onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }} className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-3xl border border-[var(--crm-border)] bg-[var(--crm-surface)] p-6 text-[var(--foreground)] shadow-2xl backdrop:bg-black/70">
      <form onSubmit={event => { event.preventDefault(); void run(async () => { const result = await schedule({ id: request._id, scheduledDate: date, expectedUpdatedAt: request.updatedAt }); onScheduled(date, result.updatedAt); setDateOpen(false); }); }} className="space-y-4">
        <div><h3 id="schedule-title" className="text-lg font-bold">Programmer une date</h3><p className="mt-1 text-sm text-zinc-500">Cette date sera visible dans l’espace client après validation.</p></div>
        <label className="block text-sm font-medium">Date prévue<Input type="date" aria-label="Date prévue" required value={date} disabled={busy || Boolean(request.shuttleId)} onChange={event => setDate(event.target.value)} /></label>
        {request.shuttleId && <p className="text-xs text-zinc-500">La date est celle de la navette affectée. Pour la modifier, réaffectez une navette.</p>}
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setDateOpen(false)} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold">Annuler</button><button type="submit" disabled={busy || !date} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Enregistrement…" : "Valider la date"}</button></div>
      </form>
    </dialog>}
  </section>;
}
