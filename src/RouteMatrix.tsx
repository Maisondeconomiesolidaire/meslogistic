import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ArrowRight, Bus, Check, ExternalLink, Plus } from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { PageHeader } from "./components/crm/PageHeader";
import { shortDate } from "./components/crm/LogisticsCard";
import { Button } from "./components/ui/Button";
import { Input } from "./components/ui/Field";
import { Drawer } from "./components/ui/Drawer";
import { FullSpinner } from "./components/ui/Spinner";
import { shortLocation } from "./Demandes";
import { RequestDetail } from "./RequestDetail";
import { today } from "./TransferPlanning";
import { STATUS, Stops, compatibility, errorText, stopsOf, type Shuttle, type Transit } from "./ShuttleBoard";

/** Les trois sites, dans l'ordre de l'axe ; les autres lieux suivent par ordre alphabétique. */
const AXIS_ORDER = ["Comptoir C", "Solidarium", "ESSpace 150"];
const objets = (count: number) => `${count} objet${count > 1 ? "s" : ""}`;

type Route = { from: string; to: string };

/**
 * Demandes v3 : la grille des flux entre sites. Départs en lignes, arrivées en
 * colonnes ; chaque cellule compte les objets à transporter sur ce trajet et
 * s'ouvre pour les affecter à une navette.
 */
export function RouteMatrix({ canCreate, canUpdate }: { canCreate: boolean; canUpdate: boolean }) {
  const board = useQuery(api.meslogisticShuttles.board, {});
  const requests = useQuery(api.meslogistic.list, {});
  const [route, setRoute] = useState<Route | null>(null);
  const [openRequest, setOpenRequest] = useState<string | null>(null);
  const request = requests?.find(item => item._id === openRequest);

  const planned = useMemo(() => (board?.shuttles ?? []).filter(shuttle => shuttle.status === "planifiee"), [board]);
  const places = useMemo(() => {
    const seen = new Set<string>(AXIS_ORDER);
    for (const row of board?.unassigned ?? []) { seen.add(shortLocation(row.origin)); seen.add(shortLocation(row.destination)); }
    for (const shuttle of planned) for (const row of shuttle.transits) { seen.add(shortLocation(row.origin)); seen.add(shortLocation(row.destination)); }
    const others = [...seen].filter(place => !AXIS_ORDER.includes(place)).sort((a, b) => a.localeCompare(b, "fr"));
    return [...AXIS_ORDER, ...others];
  }, [board, planned]);

  const onRoute = <T extends { origin: string; destination: string }>(rows: T[], from: string, to: string) => rows.filter(row => shortLocation(row.origin) === from && shortLocation(row.destination) === to);
  const plannedTransits = planned.flatMap(shuttle => shuttle.transits.map(row => ({ ...row, shuttle })));
  const total = board?.unassigned.length ?? 0;

  return <div className="flex min-h-screen flex-col">
    <PageHeader title="Demandes v3" subtitle={`Flux entre les sites · ${objets(total)} à planifier. Cliquez sur un trajet pour affecter ses objets à une navette.`} />
    <div className="flex-1 overflow-auto p-4 sm:p-6">
      {!board ? <FullSpinner label="Chargement des flux…" /> : <section className="rounded-3xl border border-[var(--crm-border)] bg-[var(--crm-surface)] p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Flux entre les sites</h2>
          <p className="flex items-center gap-2 text-xs text-zinc-500"><span>Lignes : départ</span><ArrowRight size={12} /><span>Colonnes : arrivée</span></p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-2">
            <thead><tr><th className="w-32" />{places.map(place => <th key={place} scope="col" className="px-2 pb-1 text-center text-sm font-semibold">{place}</th>)}</tr></thead>
            <tbody>{places.map(from => <tr key={from}>
              <th scope="row" className="pr-2 text-left text-sm font-semibold">{from}</th>
              {places.map(to => {
                if (from === to) return <td key={to} className="h-20 text-center text-zinc-500">–</td>;
                const count = onRoute(board.unassigned, from, to).length;
                const inShuttle = onRoute(plannedTransits, from, to).length;
                const selected = route?.from === from && route.to === to;
                return <td key={to} className="h-20 p-0">
                  <button type="button" onClick={() => setRoute({ from, to })} aria-label={`${from} vers ${to} : ${objets(count)} à planifier`}
                    className={`flex h-full w-full flex-col items-center justify-center rounded-xl border transition hover:border-brand-500/70 ${selected ? "border-brand-500 bg-brand-500/10" : count ? "border-[var(--crm-border-strong,var(--crm-border))] bg-[var(--crm-surface-2)]" : "border-[var(--crm-border)] bg-transparent"}`}>
                    <span className={`text-2xl font-bold tabular-nums ${count ? "" : "text-zinc-500"}`}>{count}</span>
                    <span className="text-[11px] text-zinc-500">{count > 1 ? "objets" : "objet"}</span>
                    {inShuttle > 0 && <span className="mt-0.5 text-[10px] font-semibold text-brand-500">+{inShuttle} en navette</span>}
                  </button>
                </td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
      </section>}
    </div>
    {route && board && <RouteModal key={`${route.from}-${route.to}`} route={route} unassigned={onRoute(board.unassigned, route.from, route.to)} inShuttle={onRoute(plannedTransits, route.from, route.to)} shuttles={planned} canCreate={canCreate} canUpdate={canUpdate} onClose={() => setRoute(null)} onOpenRequest={setOpenRequest} />}
    {request && <RequestDetail key={request._id} request={request} canUpdate={canUpdate} onClose={() => setOpenRequest(null)} />}
  </div>;
}

function RouteModal({ route, unassigned, inShuttle, shuttles, canCreate, canUpdate, onClose, onOpenRequest }: {
  route: Route; unassigned: Transit[]; inShuttle: Array<Transit & { shuttle: Shuttle }>; shuttles: Shuttle[];
  canCreate: boolean; canUpdate: boolean; onClose: () => void; onOpenRequest: (id: string) => void;
}) {
  const addRequests = useMutation(api.meslogisticShuttles.addRequests);
  const createShuttle = useMutation(api.meslogistic.createShuttle);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(unassigned.map(row => row._id)));
  const [target, setTarget] = useState<string>("");
  const [newName, setNewName] = useState(`${route.from} → ${route.to}`);
  const [newDate, setNewDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  // Les objets affectés quittent la liste : on ne garde cochés que ceux encore à planifier.
  useEffect(() => setPicked(current => new Set([...current].filter(id => unassigned.some(row => row._id === id)))), [unassigned]);

  const selection = unassigned.filter(row => picked.has(row._id));
  const earliestDue = selection.map(row => row.dueDate).filter(Boolean).sort()[0];
  const now = today();
  const candidates = shuttles.filter(shuttle => shuttle.scheduledDate >= now).map(shuttle => {
    const reference = selection[0] ?? unassigned[0];
    return { shuttle, ...(reference ? compatibility(reference, shuttle.transits) : { score: 0 }), late: Boolean(earliestDue && shuttle.scheduledDate > earliestDue) };
  }).sort((a, b) => b.score - a.score || a.shuttle.scheduledDate.localeCompare(b.shuttle.scheduledDate));

  async function assign() {
    if (!selection.length) return;
    setBusy(true); setError(""); setDone("");
    try {
      let shuttleId = target as Id<"mlShuttles">;
      let name = shuttles.find(shuttle => shuttle._id === target)?.name ?? "";
      if (target === "new") { shuttleId = await createShuttle({ name: newName, scheduledDate: newDate }); name = newName.trim(); }
      await addRequests({ shuttleId, requestIds: selection.map(row => row._id) });
      setDone(`${objets(selection.length)} affecté${selection.length > 1 ? "s" : ""} à « ${name} ».`);
      setTarget("");
    } catch (caught) { setError(errorText(caught)); } finally { setBusy(false); }
  }
  const toggle = (id: string) => setPicked(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return <Drawer open onClose={onClose} variant="modal"
    title={<span className="flex items-center gap-2"><Bus size={18} />Trajet</span>}
    headerContent={<><h2 className="flex flex-wrap items-center gap-3 text-2xl font-bold"><span>{route.from}</span><ArrowRight size={22} /><span>{route.to}</span></h2><p className="mt-1 text-sm text-zinc-500">{objets(unassigned.length)} à planifier{inShuttle.length ? ` · ${objets(inShuttle.length)} déjà en navette` : ""}</p></>}>
    <div className="grid gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:items-start">
      <section className="min-w-0 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">Objets à planifier ({unassigned.length})</h3>
          {unassigned.length > 1 && <button type="button" className="text-xs font-semibold text-brand-500" onClick={() => setPicked(picked.size === unassigned.length ? new Set() : new Set(unassigned.map(row => row._id)))}>{picked.size === unassigned.length ? "Tout décocher" : "Tout cocher"}</button>}
        </div>
        {unassigned.length === 0 ? <p className="rounded-xl bg-[var(--crm-surface-2)] p-4 text-sm text-zinc-500">Aucun objet à planifier sur ce trajet.</p> :
          <ul className="space-y-2">{unassigned.map(row => {
            const late = row.dueDate && row.dueDate < now;
            return <li key={row._id} className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${picked.has(row._id) ? "border-brand-500 bg-brand-500/10" : "border-[var(--crm-border)] bg-[var(--crm-surface-2)]"}`}>
              <input type="checkbox" className="mt-1" checked={picked.has(row._id)} disabled={!canUpdate} onChange={() => toggle(row._id)} aria-label={`Sélectionner ${row.title}`} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{row.quantity} {row.unit} · {row.title}</p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-zinc-500"><span>{row.customerName || "Déplacement interne"}</span><span className="font-mono">{row.reference}</span>{row.dueDate && <span className={late ? "font-semibold text-red-500" : ""}>échéance {shortDate(row.dueDate)}</span>}</p>
              </div>
              <button type="button" onClick={() => onOpenRequest(row._id)} className="shrink-0 text-zinc-500 hover:text-zinc-200" aria-label="Ouvrir la fiche"><ExternalLink size={15} /></button>
            </li>;
          })}</ul>}

        {inShuttle.length > 0 && <div className="pt-3"><h3 className="mb-2 font-semibold">Déjà en navette ({inShuttle.length})</h3>
          <ul className="space-y-1.5">{inShuttle.map(row => <li key={row._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--crm-surface-2)] px-3 py-2 text-sm">
            <button type="button" onClick={() => onOpenRequest(row._id)} className="min-w-0 truncate text-left">{row.quantity} {row.unit} · {row.title}</button>
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-500"><Bus size={13} />{row.shuttle.name} · {shortDate(row.shuttle.scheduledDate)}{row.loadedAt ? " · chargé" : ""}</span>
          </li>)}</ul>
        </div>}
      </section>

      <aside className="space-y-3 rounded-2xl border border-[var(--crm-border)] p-4 lg:sticky lg:top-4">
        <h3 className="font-semibold">Affecter à une navette</h3>
        {!canUpdate ? <p className="text-sm text-zinc-500">Lecture seule.</p> : <>
          <p className="text-xs text-zinc-500">{selection.length ? `${objets(selection.length)} sélectionné${selection.length > 1 ? "s" : ""}${earliestDue ? ` · échéance la plus proche ${shortDate(earliestDue)}` : ""}` : "Cochez au moins un objet."}</p>
          <ul className="max-h-[40vh] space-y-2 overflow-y-auto pr-1">
            {candidates.map(({ shuttle, label, late }) => <li key={shuttle._id}><label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${target === shuttle._id ? "border-brand-500 bg-brand-500/10" : "border-[var(--crm-border)] bg-[var(--crm-surface-2)]"}`}>
              <input type="radio" name="shuttle" className="mt-1" checked={target === shuttle._id} onChange={() => setTarget(shuttle._id)} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 font-semibold"><span className="truncate">{shuttle.name}</span><span className="shrink-0 text-xs font-normal text-zinc-500">{shortDate(shuttle.scheduledDate)}</span></span>
                <Stops stops={stopsOf(shuttle.transits)} className="mt-1 text-xs text-zinc-400" />
                <span className="mt-1 flex flex-wrap gap-1">{label && <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-500">{label}</span>}{late && <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-500"><AlertTriangle size={11} />après l’échéance</span>}<span className="text-[11px] text-zinc-500">{objets(shuttle.transits.length)}</span></span>
              </span>
            </label></li>)}
            {canCreate && <li><label className={`flex cursor-pointer items-start gap-3 rounded-xl border border-dashed p-3 text-sm ${target === "new" ? "border-brand-500 bg-brand-500/10" : "border-[var(--crm-border)]"}`}>
              <input type="radio" name="shuttle" className="mt-1" checked={target === "new"} onChange={() => setTarget("new")} />
              <span className="min-w-0 flex-1 space-y-2"><span className="flex items-center gap-1.5 font-semibold"><Plus size={14} />Nouvelle navette</span>
                {target === "new" && <><Input maxLength={100} value={newName} onChange={event => setNewName(event.target.value)} aria-label="Nom de la navette" /><Input type="date" min={now} max={earliestDue} value={newDate} onChange={event => setNewDate(event.target.value)} aria-label="Date de départ" /></>}
              </span>
            </label></li>}
          </ul>
          {candidates.length === 0 && !canCreate && <p className="text-sm text-zinc-500">Aucune navette planifiée à venir.</p>}
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
          {done && <p role="status" className="flex items-center gap-2 text-sm text-green-500"><Check size={15} />{done}</p>}
          <Button className="w-full" disabled={busy || !selection.length || !target || (target === "new" && (!newName.trim() || !newDate))} onClick={() => void assign()}>{busy ? "Affectation…" : `Affecter ${selection.length ? objets(selection.length) : ""}`}</Button>
          <p className="text-[11px] text-zinc-500">Le départ et l’arrivée se gèrent ensuite dans « Navettes v2 ». Statut des navettes proposées : {STATUS.planifiee.label.toLocaleLowerCase("fr-FR")}.</p>
        </>}
      </aside>
    </div>
  </Drawer>;
}
