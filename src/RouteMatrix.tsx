import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Info, Package, Plus, X } from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { PageHeader } from "./components/crm/PageHeader";
import { shortDate } from "./components/crm/LogisticsCard";
import { Button } from "./components/ui/Button";
import { Input } from "./components/ui/Field";
import { FullSpinner } from "./components/ui/Spinner";
import { shortLocation } from "./Demandes";
import { RequestDetail } from "./RequestDetail";
import { today } from "./TransferPlanning";
import { Stops, compatibility, errorText, stopsOf, type Shuttle, type Transit } from "./ShuttleBoard";

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
  // Objets déjà affectés à une navette pas encore terminée (planifiée ou en route).
  const activeTransits = (board?.shuttles ?? []).filter(shuttle => shuttle.status !== "terminee").flatMap(shuttle => shuttle.transits.filter(row => row.status !== "receptionnee").map(row => ({ ...row, shuttle })));

  const grid = { gridTemplateColumns: `minmax(84px, auto) repeat(${places.length}, minmax(0, 1fr))`, gridTemplateRows: `auto repeat(${places.length}, minmax(64px, 1fr))` };
  return <div className="flex h-[calc(100dvh-3.5rem)] flex-col lg:h-dvh">
    <PageHeader title="Demandes v3" />
    <div className="flex min-h-0 flex-1 gap-4 p-4 sm:p-6">
      {!board ? <FullSpinner label="Chargement des flux…" /> : <>
        {/* La grille occupe toute la hauteur ; elle se rétrécit quand le panneau de liaison est ouvert. */}
        <section className={`min-h-0 min-w-0 flex-1 flex-col rounded-3xl border border-[var(--crm-border)] bg-[var(--crm-surface)] p-4 sm:p-6 ${route ? "hidden lg:flex" : "flex"}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Flux entre les sites</h2>
            <p className="flex items-center gap-2 text-xs text-zinc-500"><span>Lignes : départ</span><ArrowRight size={12} /><span>Colonnes : arrivée</span></p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <div role="table" aria-label="Flux entre les sites" className="grid h-full min-w-[420px] gap-2" style={grid}>
              <div role="columnheader" />
              {places.map(place => <div key={place} role="columnheader" className="flex items-end justify-center px-1 pb-1 text-center text-sm font-semibold">{place}</div>)}
              {places.map(from => [
                <div key={`${from}-row`} role="rowheader" className="flex items-center pr-2 text-sm font-semibold">{from}</div>,
                ...places.map(to => {
                  if (from === to) return <div key={`${from}-${to}`} role="cell" className="flex items-center justify-center text-zinc-500">–</div>;
                  const count = onRoute(board.unassigned, from, to).length;
                  const inShuttle = onRoute(plannedTransits, from, to).length;
                  const selected = route?.from === from && route.to === to;
                  return <button key={`${from}-${to}`} role="cell" type="button" onClick={() => setRoute({ from, to })} aria-label={`${from} vers ${to} : ${objets(count)} à planifier`} aria-pressed={selected}
                    className={`flex min-h-0 min-w-0 flex-col items-center justify-center rounded-xl border transition hover:border-brand-500/70 ${selected ? "border-brand-500 bg-brand-500/10" : count ? "border-[var(--crm-border-strong,var(--crm-border))] bg-[var(--crm-surface-2)]" : "border-[var(--crm-border)] bg-transparent"}`}>
                    <span className={`text-2xl font-bold tabular-nums sm:text-3xl ${count ? "" : "text-zinc-500"}`}>{count}</span>
                    <span className="text-[11px] text-zinc-500">{count > 1 ? "objets" : "objet"}</span>
                    {inShuttle > 0 && <span className="mt-0.5 text-[10px] font-semibold text-brand-500">+{inShuttle} en navette</span>}
                  </button>;
                }),
              ])}
            </div>
          </div>
        </section>
        {route && <RoutePanel key={`${route.from}-${route.to}`} route={route} unassigned={onRoute(board.unassigned, route.from, route.to)} assigned={onRoute(activeTransits, route.from, route.to)} shuttles={board.shuttles} canCreate={canCreate} canUpdate={canUpdate} onClose={() => setRoute(null)} onOpenRequest={setOpenRequest} />}
      </>}
    </div>
    {request && <RequestDetail key={request._id} request={request} canUpdate={canUpdate} onClose={() => setOpenRequest(null)} />}
  </div>;
}

type Assigned = Transit & { shuttle: Shuttle };
type Filter = "tous" | "non" | "oui";

/** Panneau latéral d'une liaison : liste des objets, puis affectation à une navette. */
function RoutePanel({ route, unassigned, assigned, shuttles, canCreate, canUpdate, onClose, onOpenRequest }: {
  route: Route; unassigned: Transit[]; assigned: Assigned[]; shuttles: Shuttle[];
  canCreate: boolean; canUpdate: boolean; onClose: () => void; onOpenRequest: (id: string) => void;
}) {
  const addRequests = useMutation(api.meslogisticShuttles.addRequests);
  const createShuttle = useMutation(api.meslogistic.createShuttle);
  const createRequest = useMutation(api.meslogistic.create);
  const [step, setStep] = useState<"list" | "assign">("list");
  const [filter, setFilter] = useState<Filter>("tous");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<string>("");
  const [newName, setNewName] = useState(`${route.from} → ${route.to}`);
  const [newDate, setNewDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [item, setItem] = useState({ title: "", quantity: "1", unit: "unité", dueDate: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  // Un objet affecté entre-temps n'est plus sélectionnable.
  useEffect(() => setPicked(current => new Set([...current].filter(id => unassigned.some(row => row._id === id)))), [unassigned]);

  const now = today();
  const selection = unassigned.filter(row => picked.has(row._id));
  const earliestDue = selection.map(row => row.dueDate).filter(Boolean).sort()[0];
  const rows: Array<{ row: Transit; shuttle?: Shuttle }> = [
    ...(filter === "oui" ? [] : unassigned.map(row => ({ row }))),
    ...(filter === "non" ? [] : assigned.map(row => ({ row, shuttle: row.shuttle }))),
  ];
  const total = unassigned.length + assigned.length;
  const allPicked = unassigned.length > 0 && picked.size === unassigned.length;
  const candidates = shuttles.filter(shuttle => shuttle.status === "planifiee" && shuttle.scheduledDate >= now).map(shuttle => ({
    shuttle, ...(selection[0] ? compatibility(selection[0], shuttle.transits) : { score: 0 }), late: Boolean(earliestDue && shuttle.scheduledDate > earliestDue),
  })).sort((a, b) => b.score - a.score || a.shuttle.scheduledDate.localeCompare(b.shuttle.scheduledDate));

  const toggle = (id: string) => setPicked(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  async function confirm() {
    setBusy(true); setError("");
    try {
      let shuttleId = target as Id<"mlShuttles">;
      let name = shuttles.find(shuttle => shuttle._id === target)?.name ?? "";
      if (target === "new") { shuttleId = await createShuttle({ name: newName, scheduledDate: newDate }); name = newName.trim(); }
      await addRequests({ shuttleId, requestIds: selection.map(row => row._id) });
      setDone(`${objets(selection.length)} affecté${selection.length > 1 ? "s" : ""} à « ${name} ».`);
      setPicked(new Set()); setTarget(""); setStep("list");
    } catch (caught) { setError(errorText(caught)); } finally { setBusy(false); }
  }
  async function addItem(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await createRequest({ title: item.title, quantity: Number(item.quantity.replace(",", ".")), unit: item.unit, customerName: "", origin: route.from, destination: route.to, dueDate: item.dueDate });
      setItem({ title: "", quantity: "1", unit: "unité", dueDate: "" }); setAdding(false); setDone("Objet ajouté à la liaison.");
    } catch (caught) { setError(errorText(caught)); } finally { setBusy(false); }
  }

  const header = <div>
    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
      <span className="rounded-full bg-green-500/15 px-2.5 py-0.5 text-green-500">{route.from}</span>
      <ArrowRight size={14} className="text-zinc-500" />
      <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-sky-400">{route.to}</span>
    </p>
    <p className="mt-1.5 text-xs font-normal text-zinc-500">{objets(total)} sur cette liaison</p>
  </div>;

  const footer = step === "list" ? <div className="flex items-center justify-between gap-3">
    <div><p className="text-sm font-semibold">{objets(selection.length)} sélectionné{selection.length > 1 ? "s" : ""}</p><p className="text-[11px] text-zinc-500">Sélection possible sur plusieurs demandes</p></div>
    {canUpdate && <Button disabled={!selection.length} onClick={() => { setError(""); setDone(""); setStep("assign"); }}>Affecter<ArrowRight size={16} /></Button>}
  </div> : <Button className="w-full" disabled={busy || !selection.length || !target || (target === "new" && (!newName.trim() || !newDate))} onClick={() => void confirm()}>{busy ? "Affectation…" : "Confirmer l’affectation"}</Button>;

  // Échap ferme le panneau (sauf pendant la saisie d'un champ).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !(event.target instanceof HTMLInputElement)) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return <aside aria-label={`Liaison ${route.from} vers ${route.to}`} className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-3xl border border-[var(--crm-border)] bg-[var(--crm-surface)] lg:w-[420px] xl:w-[480px]">
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--crm-border)] px-5 py-4">{header}<button type="button" onClick={onClose} className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-zinc-400 hover:bg-[var(--crm-surface-2)] hover:text-zinc-100"><X size={16} />Fermer</button></div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-500">{error}</p>}
    {done && <p role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-green-500/10 p-3 text-sm text-green-500"><Check size={15} />{done}</p>}

    {step === "list" ? <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Objets à transporter</h3>
        {canCreate && <Button size="sm" variant="secondary" onClick={() => setAdding(!adding)}><Plus size={14} />Objet</Button>}
      </div>
      {adding && <form onSubmit={addItem} className="grid gap-2 rounded-2xl border border-dashed border-[var(--crm-border)] p-3 sm:grid-cols-2">
        <Input required autoFocus maxLength={300} placeholder="Objet (ex. Armoire)" value={item.title} onChange={event => setItem({ ...item, title: event.target.value })} className="sm:col-span-2" />
        <Input required inputMode="decimal" aria-label="Quantité" value={item.quantity} onChange={event => setItem({ ...item, quantity: event.target.value })} />
        <Input required maxLength={40} aria-label="Unité" value={item.unit} onChange={event => setItem({ ...item, unit: event.target.value })} />
        <label className="text-xs text-zinc-500 sm:col-span-2">Échéance (obligatoire)<Input required type="date" min={now} value={item.dueDate} onChange={event => setItem({ ...item, dueDate: event.target.value })} /></label>
        <div className="flex gap-2 sm:col-span-2"><Button type="submit" size="sm" disabled={busy}>Ajouter l’objet</Button><Button type="button" size="sm" variant="secondary" onClick={() => setAdding(false)}>Annuler</Button></div>
      </form>}

      <div className="grid grid-cols-3 rounded-full bg-[var(--crm-surface-2)] p-1 text-sm font-semibold">
        {([["tous", "Tous"], ["non", "Non affectés"], ["oui", "Affectés"]] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-full py-1.5 transition ${filter === key ? "bg-[var(--crm-surface-3)] text-[var(--foreground)]" : "text-zinc-500 hover:text-zinc-300"}`}>{label}</button>)}
      </div>

      {canUpdate && filter !== "oui" && unassigned.length > 0 && <div className="flex items-center justify-between text-sm">
        <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" className="h-4 w-4 rounded-full" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(unassigned.map(row => row._id)))} />Tout sélectionner</label>
        <span className="text-zinc-500">{picked.size} sélectionné{picked.size > 1 ? "s" : ""}</span>
      </div>}

      {rows.length === 0 ? <p className="rounded-xl bg-[var(--crm-surface-2)] p-4 text-sm text-zinc-500">Aucun objet.</p> :
        <ul className="space-y-2">{rows.map(({ row, shuttle }) => {
          const selectable = !shuttle && canUpdate;
          const checked = picked.has(row._id);
          const late = row.dueDate && row.dueDate < now;
          return <li key={row._id} className={`flex items-center gap-3 rounded-2xl border p-3.5 ${checked ? "border-brand-500" : "border-[var(--crm-border)]"}`}>
            <input type="checkbox" className="h-4 w-4" disabled={!selectable} checked={checked} onChange={() => toggle(row._id)} aria-label={`Sélectionner ${row.title}`} />
            <Package size={18} className="shrink-0 text-zinc-400" />
            <button type="button" onClick={() => onOpenRequest(row._id)} className="min-w-0 flex-1 text-left">
              <p className="truncate font-semibold">{row.title}{row.quantity !== 1 || row.unit !== "unité" ? <span className="font-normal text-zinc-500"> · {row.quantity} {row.unit}</span> : null}</p>
              <p className="truncate text-[11px] text-zinc-500">{row.reference}{row.customerName ? ` · ${row.customerName}` : ""}{row.dueDate ? ` · ` : ""}{row.dueDate && <span className={late ? "font-semibold text-red-500" : ""}>échéance {shortDate(row.dueDate)}</span>}</p>
            </button>
            {shuttle ? <span className="shrink-0 rounded-md bg-green-500/15 px-2 py-1 text-xs font-semibold text-green-500">{shuttle.name}</span>
              : <span className="shrink-0 rounded-md bg-orange-500/15 px-2 py-1 text-xs font-semibold text-orange-400">À affecter</span>}
          </li>;
        })}</ul>}
    </div> : <div className="space-y-5">
      <button type="button" onClick={() => setStep("list")} className="flex items-center gap-3 text-lg font-bold"><ArrowLeft size={18} />Affecter à une navette</button>
      <div>
        <p className="text-sm font-semibold">{objets(selection.length)} à affecter</p>
        <ul className="mt-2 space-y-1.5">{selection.map(row => <li key={row._id} className="flex items-center gap-2 text-sm"><Package size={14} className="shrink-0 text-zinc-400" />{row.title} · <span className="text-zinc-500">{row.reference}</span></li>)}</ul>
      </div>
      <div className="space-y-2">
        <h3 className="font-semibold">Sélectionner une navette</h3>
        {candidates.map(({ shuttle, label, late }) => <label key={shuttle._id} className="flex cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-[var(--crm-surface-2)]">
          <input type="radio" name="shuttle" className="mt-1.5 h-4 w-4" checked={target === shuttle._id} onChange={() => setTarget(shuttle._id)} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{shuttle.name}</span>
              {shuttle.transits.length ? <span className="rounded-md bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-500">{label ?? "En préparation"}</span> : <span className="rounded-md bg-[var(--crm-surface-3)] px-2 py-0.5 text-xs font-semibold">Disponible</span>}
              {late && <span className="flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-500"><AlertTriangle size={11} />après l’échéance</span>}</span>
            <span className="mt-0.5 block text-sm text-zinc-500">{shortDate(shuttle.scheduledDate)} · {shuttle.transits.length ? `${objets(shuttle.transits.length)}` : "aucun objet"}</span>
            {shuttle.transits.length > 0 && <Stops stops={stopsOf(shuttle.transits)} className="mt-0.5 text-xs text-zinc-400" />}
          </span>
        </label>)}
        {canCreate && <label className="flex cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-[var(--crm-surface-2)]">
          <input type="radio" name="shuttle" className="mt-1.5 h-4 w-4" checked={target === "new"} onChange={() => setTarget("new")} />
          <span className="min-w-0 flex-1 space-y-2"><span className="flex items-center gap-2"><span className="font-semibold">Nouvelle navette</span><span className="rounded-md bg-[var(--crm-surface-3)] px-2 py-0.5 text-xs font-semibold">Nouvelle affectation</span></span>
            {target === "new" && <><Input maxLength={100} value={newName} onChange={event => setNewName(event.target.value)} aria-label="Nom de la navette" /><Input type="date" min={now} max={earliestDue} value={newDate} onChange={event => setNewDate(event.target.value)} aria-label="Date de départ" /></>}
          </span>
        </label>}
        {candidates.length === 0 && !canCreate && <p className="text-sm text-zinc-500">Aucune navette planifiée à venir.</p>}
      </div>
      <p className="flex items-start gap-2 rounded-xl bg-[var(--crm-surface-2)] p-3 text-xs text-zinc-400"><Info size={14} className="mt-0.5 shrink-0 text-sky-400" />Les objets rejoignent la navette choisie et sa tournée est recalculée. Chargement, départ et arrivée se suivent dans « Navettes v2 ».</p>
    </div>}
    </div>
    <div className="shrink-0 border-t border-[var(--crm-border)] p-4">{footer}</div>
  </aside>;
}
