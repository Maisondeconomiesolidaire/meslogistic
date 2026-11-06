import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { Button } from "./components/ui/Button";
import { Input, Select } from "./components/ui/Field";

export function TransferPlanning({ request, canUpdate }: { request: Doc<"mlRequests">; canUpdate: boolean }) {
  const shuttles = useQuery(api.meslogistic.listShuttles, {});
  const create = useMutation(api.batire.createPickupShuttle);
  const update = useMutation(api.batire.updatePickup);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [quantity, setQuantity] = useState(String(request.receivedQuantity ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "Enregistrement impossible."); } finally { setBusy(false); }
  }
  const assign = (shuttleId: Id<"mlShuttles">) => update({ orderId: request.orderId!, step: "assign", shuttleId, expectedTransferUpdatedAt: request.updatedAt });
  if (!request.orderId) return null;
  return <section className="mt-5 space-y-4 rounded-xl border border-[var(--crm-border)] p-4">
    <h3 className="font-semibold">Navette et réception de ce transfert</h3>
    <p className="text-sm text-zinc-500">Une navette peut regrouper plusieurs transferts. La réception reste propre à chaque retrait.</p>
    <label className="block text-sm">Navette affectée<Select className="mt-1" disabled={!canUpdate || busy || request.status !== "a_preparer"} value={request.shuttleId ?? ""} onChange={event => { if (event.target.value) void run(() => assign(event.target.value as Id<"mlShuttles">)); }}><option value="">À affecter</option>{shuttles?.map(shuttle => <option key={shuttle._id} value={shuttle._id}>{shuttle.name} · {shuttle.scheduledDate}</option>)}</Select></label>
    {canUpdate && request.status === "a_preparer" && <details><summary className="cursor-pointer text-sm font-semibold">Créer une navette</summary><div className="mt-3 space-y-3"><label className="block text-sm">Nom de la navette<Input value={name} maxLength={100} onChange={event => setName(event.target.value)} /></label><label className="block text-sm">Date prévue<Input type="date" value={date} onChange={event => setDate(event.target.value)} /></label><Button disabled={busy || !name.trim() || !date} onClick={() => void run(async () => { const id = await create({ name, scheduledDate: date }); await assign(id); setName(""); setDate(""); })}>Créer et affecter</Button></div></details>}
    <p className="text-sm">Reçu : {request.receivedQuantity ?? 0} / {request.quantity} {request.unit}{request.receivedAt ? ` · Dernière réception le ${new Date(request.receivedAt).toLocaleString("fr-FR")}` : ""}</p>
    {canUpdate && request.status === "en_transit" && <div className="space-y-3"><label className="block text-sm">Quantité totale reçue (cumulée)<Input type="number" min={request.receivedQuantity ?? 0} max={request.quantity} step="any" value={quantity} onChange={event => setQuantity(event.target.value)} /></label><Button disabled={busy || quantity === ""} onClick={() => void run(() => update({ orderId: request.orderId!, step: "receive", receivedQuantity: Number(quantity), expectedTransferUpdatedAt: request.updatedAt }))}>Enregistrer la réception</Button><p className="text-xs text-zinc-500">Une réception partielle laisse ce transfert ouvert, sans bloquer les autres.</p></div>}
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
  </section>;
}
