import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bus, Plus } from "lucide-react";
import { api } from "../convex/_generated/api";
import { PageHeader } from "./components/crm/PageHeader";
import { Button } from "./components/ui/Button";
import { Input } from "./components/ui/Field";
import { FullSpinner } from "./components/ui/Spinner";
import { EmptyState } from "./components/ui/EmptyState";
import { shortDate } from "./components/crm/LogisticsCard";
import { shortLocation, stages, statusLabel } from "./Demandes";
import { RequestDetail } from "./RequestDetail";
import { sortShuttles, today } from "./TransferPlanning";

const statusColor = (status: string) => status === "annulee" ? "#71717a" : stages.find(stage => stage.key === status)?.color ?? "#71717a";

/** Création des navettes et vue des transits qu’elles regroupent. L’affectation se fait depuis la fiche d’un transit. */
export function Navettes({ canCreate, canUpdate }: { canCreate: boolean; canUpdate: boolean }) {
  const shuttles = useQuery(api.meslogistic.shuttlesOverview, {});
  const requests = useQuery(api.meslogistic.list, {});
  const create = useMutation(api.meslogistic.createShuttle);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const selected = requests?.find(request => request._id === open);
  const unassigned = (requests ?? []).filter(request => request.status === "a_preparer" && !request.shuttleId && !request.collected);
  const now = today();

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await create({ name, scheduledDate: date }); setName(""); setDate(""); setFormOpen(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Création impossible."); }
    finally { setBusy(false); }
  }

  return <div className="flex min-h-screen flex-col">
    <PageHeader title="Navettes" actions={canCreate && !formOpen && <Button size="sm" onClick={() => { setError(""); setFormOpen(true); }}><Plus size={16} />Nouvelle navette</Button>} />
    <div className="flex-1 space-y-6 p-4 sm:p-6">
      {formOpen && <form onSubmit={submit} className="max-w-2xl space-y-4 rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)] p-4">
        <h2 className="font-semibold">Nouvelle navette</h2>
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">Nom<Input required maxLength={100} placeholder="Ex. Tournée du mardi" value={name} onChange={event => setName(event.target.value)} /></label>
          <label className="block text-sm">Date prévue<Input required type="date" min={now} value={date} onChange={event => setDate(event.target.value)} /></label>
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2"><Button type="submit" disabled={busy || !name.trim() || !date}>{busy ? "Création…" : "Créer la navette"}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setFormOpen(false)}>Annuler</Button></div>
      </form>}

      {requests && unassigned.length > 0 && <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-300">Transits à affecter <span className="ml-1 rounded-full bg-[var(--crm-surface-3)] px-2 py-0.5 text-xs text-zinc-400">{unassigned.length}</span></h2>
        <ul className="flex flex-wrap gap-2">{unassigned.map(request => <li key={request._id}><button type="button" onClick={() => setOpen(request._id)} className="rounded-xl border border-dashed border-[var(--crm-border-strong)] bg-[var(--crm-surface-2)] px-3 py-2 text-left text-xs transition hover:border-brand-500">
          <span className="block font-semibold">{request.reference} · {request.title}</span>
          <span className="block text-zinc-500">{shortLocation(request.origin)} → {shortLocation(request.destination)}{request.dueDate ? ` · échéance ${shortDate(request.dueDate)}` : ""}</span>
        </button></li>)}</ul>
      </section>}

      {shuttles === undefined ? <FullSpinner label="Chargement des navettes…" />
        : shuttles.length === 0 ? <EmptyState icon={<Bus size={32} />} title="Aucune navette" description="Créez une navette pour y regrouper les transits à effectuer." />
        : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sortShuttles(shuttles).map(shuttle => {
          const past = shuttle.scheduledDate < now;
          return <article key={shuttle._id} className={`flex flex-col rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)] p-4 ${past ? "opacity-70" : ""}`}>
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h3 className="flex items-center gap-2 font-semibold"><Bus size={16} className="shrink-0" /><span className="truncate">{shuttle.name}</span></h3><p className="mt-1 text-xs text-zinc-500">{new Date(`${shuttle.scheduledDate}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}{past ? " · passée" : ""}</p></div>
              <span className="shrink-0 rounded-full bg-[var(--crm-surface-3)] px-2 py-0.5 text-xs text-zinc-400">{shuttle.transits.length}</span>
            </header>
            {shuttle.transits.length === 0 ? <p className="mt-4 text-sm text-zinc-500">Aucun transit affecté pour l’instant.</p>
              : <ul className="mt-4 space-y-2">{shuttle.transits.map(transit => <li key={transit._id}><button type="button" onClick={() => setOpen(transit._id)} className="w-full rounded-xl bg-[var(--crm-surface-2)] px-3 py-2 text-left text-xs transition hover:ring-1 hover:ring-brand-500">
                <span className="flex items-center justify-between gap-2"><span className="min-w-0 truncate font-semibold">{transit.reference} · {transit.quantity} {transit.unit} {transit.title}</span><span className="flex shrink-0 items-center gap-1 text-zinc-400"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor(transit.status) }} />{statusLabel(transit.status)}</span></span>
                <span className="mt-0.5 block text-zinc-500">{shortLocation(transit.origin)} → {shortLocation(transit.destination)}{transit.customerName ? ` · ${transit.customerName}` : ""}</span>
              </button></li>)}</ul>}
          </article>;
        })}</div>}
    </div>
    {selected && <RequestDetail key={selected._id} request={selected} canUpdate={canUpdate} onClose={() => setOpen(null)} />}
  </div>;
}
