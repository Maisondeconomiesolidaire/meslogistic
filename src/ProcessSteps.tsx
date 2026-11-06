import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Check } from "lucide-react";
import { api } from "../convex/_generated/api";
import { Input } from "./components/ui/Field";
import type { Request } from "./Demandes";

export function ProcessSteps({ request, canUpdate, onScheduled }: { request: Request; canUpdate: boolean; onScheduled: (date: string, version: number) => void }) {
  const schedule = useMutation(api.meslogistic.schedule);
  const advance = useMutation(api.meslogistic.advance);
  const confirmPayment = useMutation(api.batire.confirmOfflinePayment);
  const [date, setDate] = useState(request.scheduledDate ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setDate(request.scheduledDate ?? ""), [request.scheduledDate]);
  const planned = Boolean(request.prepared && request.scheduledDate);
  const transit = ["en_transit", "receptionnee"].includes(request.status);
  const received = request.status === "receptionnee";
  const blocked = busy || !canUpdate || request.status === "annulee";
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Opération impossible."); } finally { setBusy(false); }
  }
  const steps = [
    { label: "Date programmée", done: planned, disabled: blocked || request.status !== "a_preparer" || !date || (planned && date === request.scheduledDate), action: () => run(async () => { const result = await schedule({ id: request._id, scheduledDate: date, expectedUpdatedAt: request.updatedAt }); onScheduled(date, result.updatedAt); }), content: <label className="mt-3 block text-left text-xs text-zinc-400">Date prévue<Input aria-label="Date prévue" type="date" value={date} disabled={blocked || request.status !== "a_preparer" || Boolean(request.shuttleId)} onChange={event => setDate(event.target.value)} /><span className="mt-1 block">Visible dans l’espace client après validation.</span></label> },
    { label: "En transit", done: transit, disabled: blocked || !planned || request.status !== "a_preparer" || Boolean(request.orderId && !request.shuttleId), action: () => run(async () => { await advance({ id: request._id, step: "en_transit", expectedUpdatedAt: request.updatedAt }); }), content: request.orderId && !request.shuttleId ? <p className="mt-2 text-xs text-zinc-500">Affectez une navette avant le départ.</p> : null },
    { label: "Réceptionnée", done: received, disabled: blocked || request.status !== "en_transit", action: () => run(async () => { await advance({ id: request._id, step: "receptionnee", expectedUpdatedAt: request.updatedAt }); }), content: <p className="mt-2 text-xs text-zinc-500">Confirme la réception de la totalité du lot.</p> },
    ...(request.payment && request.orderId ? [{ label: "Payé", done: request.payment.paid, disabled: blocked || !received || request.payment.paid || !request.payment.canConfirm, action: () => run(async () => { await confirmPayment({ orderId: request.orderId! }); }), content: <p className="mt-2 text-xs text-zinc-500">{request.payment.method === "cash" ? "Espèces" : "Virement"}{!request.payment.canConfirm ? " · Droit d’encaissement Bâtire requis" : ""}</p> }] : []),
  ];
  const done = steps.filter(step => step.done).length;
  return <section className="space-y-4"><h3 className="font-semibold">Process</h3>
    <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface-2)] p-3"><div className="mb-2 flex justify-between text-xs font-medium uppercase tracking-[0.14em] text-zinc-500"><span>Complétude</span><span className="text-brand-300">{Math.round(done / steps.length * 100)} %</span></div><div className="h-2.5 overflow-hidden rounded-full bg-[var(--crm-surface-3)]"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${done / steps.length * 100}%` }} /></div></div>
    <ol className="flex gap-3 overflow-x-auto pb-1">{steps.map((step, index) => <li key={step.label} className={`flex min-h-36 min-w-[180px] flex-1 flex-col rounded-3xl border p-3 text-center text-sm ${step.done ? "border-brand-500/35 bg-brand-500/10" : "border-[var(--crm-border)] bg-[var(--crm-surface-2)]"}`}><button type="button" role="checkbox" aria-checked={step.done} disabled={step.disabled} onClick={step.action} aria-label={step.label} className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl disabled:cursor-not-allowed disabled:opacity-70"><span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${step.done ? "border-brand-500 bg-brand-500 text-white" : "border-zinc-500 text-zinc-400"}`}>{step.done ? <Check size={16} /> : index + 1}</span><span className="font-semibold">{step.label}</span></button>{step.content}</li>)}</ol>
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
  </section>;
}
