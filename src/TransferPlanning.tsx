import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { Bus, Check } from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { Button } from "./components/ui/Button";
import { Input } from "./components/ui/Field";
import { shortLocation } from "./Demandes";
import { shortDate } from "./components/crm/LogisticsCard";

export const today = () => new Date().toISOString().slice(0, 10);
/** Navettes à venir d’abord (la plus proche en tête), puis les passées (la plus récente en tête). */
export function sortShuttles<T extends { scheduledDate: string }>(shuttles: T[]) {
  const now = today();
  return [...shuttles].sort((a, b) => {
    const pastA = a.scheduledDate < now, pastB = b.scheduledDate < now;
    if (pastA !== pastB) return pastA ? 1 : -1;
    return pastA ? b.scheduledDate.localeCompare(a.scheduledDate) : a.scheduledDate.localeCompare(b.scheduledDate);
  });
}

/**
 * Affectation du transit à une navette. Chaque navette existante affiche
 * l’aperçu des transits qu’elle transporte déjà, pour regrouper les trajets.
 */
export function TransferPlanning({ request, canUpdate, onAssigned }: { request: Doc<"mlRequests">; canUpdate: boolean; onAssigned: (scheduledDate: string, updatedAt: number) => void }) {
  const shuttles = useQuery(api.meslogistic.shuttlesOverview, {});
  const assign = useMutation(api.meslogistic.assignShuttle);
  const update = useMutation(api.batire.updatePickup);
  const [quantity, setQuantity] = useState(String(request.receivedQuantity ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editable = canUpdate && request.status === "a_preparer";
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "Enregistrement impossible."); } finally { setBusy(false); }
  }
  const choose = (shuttleId: Id<"mlShuttles"> | null, scheduledDate?: string) => run(async () => {
    const result = await assign({ id: request._id, shuttleId, expectedUpdatedAt: request.updatedAt });
    onAssigned((shuttleId ? scheduledDate : request.scheduledDate) ?? "", result.updatedAt);
  });
  const now = today();

  return <section className="space-y-4 rounded-xl border border-[var(--crm-border)] p-4">
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="font-semibold">Navette</h3><p className="mt-1 text-sm text-zinc-500">Une navette regroupe plusieurs transits. La date prévue devient celle de la navette.</p></div>
      {request.shuttleId && editable && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void choose(null)}>Retirer</Button>}
    </div>
    {shuttles === undefined ? <p className="text-sm text-zinc-500">Chargement des navettes…</p>
      : shuttles.length === 0 ? <p className="rounded-xl bg-[var(--crm-surface-2)] p-3 text-sm text-zinc-500">Aucune navette. Créez-en une depuis la page <Link className="font-semibold text-brand-500" to="/navettes">Navettes</Link>.</p>
      : <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">{sortShuttles(shuttles).map(shuttle => {
        const current = request.shuttleId === shuttle._id;
        const others = shuttle.transits.filter(transit => transit._id !== request._id);
        return <li key={shuttle._id} className={`rounded-xl border p-3 ${current ? "border-brand-500 bg-brand-500/10" : "border-[var(--crm-border)] bg-[var(--crm-surface-2)]"}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-2 text-sm font-semibold"><Bus size={15} className="shrink-0" /><span className="truncate">{shuttle.name}</span></p>
            <span className="shrink-0 text-xs tabular-nums text-zinc-500">{shortDate(shuttle.scheduledDate)}{shuttle.scheduledDate < now ? " · passée" : ""}</span>
          </div>
          {others.length === 0 ? <p className="mt-2 text-xs text-zinc-500">{current ? "Seul transit de cette navette." : "Aucun transit affecté."}</p>
            : <ul className="mt-2 space-y-1">{others.map(transit => <li key={transit._id} className="flex items-baseline justify-between gap-2 text-xs"><span className="min-w-0 truncate"><span className="font-mono text-zinc-500">{transit.reference}</span> · {transit.quantity} {transit.unit} {transit.title}</span><span className="shrink-0 text-zinc-500">{shortLocation(transit.origin)} → {shortLocation(transit.destination)}</span></li>)}</ul>}
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-500">{shuttle.transits.length} transit{shuttle.transits.length > 1 ? "s" : ""}</span>
            {current ? <span className="flex items-center gap-1 text-xs font-semibold text-brand-500"><Check size={14} />Affecté</span>
              : editable && <Button size="sm" variant="outline" disabled={busy} onClick={() => void choose(shuttle._id, shuttle.scheduledDate)}>Affecter</Button>}
          </div>
        </li>;
      })}</ul>}

    {request.orderId && <>
      <p className="text-sm">Reçu : {request.receivedQuantity ?? 0} / {request.quantity} {request.unit}{request.receivedAt ? ` · Dernière réception le ${new Date(request.receivedAt).toLocaleString("fr-FR")}` : ""}</p>
      {canUpdate && request.status === "en_transit" && <div className="space-y-3"><label className="block text-sm">Quantité totale reçue (cumulée)<Input type="number" min={request.receivedQuantity ?? 0} max={request.quantity} step="any" value={quantity} onChange={event => setQuantity(event.target.value)} /></label><Button disabled={busy || quantity === ""} onClick={() => void run(() => update({ orderId: request.orderId!, step: "receive", receivedQuantity: Number(quantity), expectedTransferUpdatedAt: request.updatedAt }))}>Enregistrer la réception</Button><p className="text-xs text-zinc-500">Une réception partielle laisse ce transfert ouvert, sans bloquer les autres.</p></div>}
    </>}
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
  </section>;
}
