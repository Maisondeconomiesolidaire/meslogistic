import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ArrowRight, Bus, CalendarClock, Check, ClipboardCheck, MapPin, PackageCheck, Pencil, Plus, Trash2, Truck, X } from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { LOCATIONS, onTheWay, sameDirection, tourStops } from "../convex/meslogisticRules";
import { PageHeader } from "./components/crm/PageHeader";
import { KanbanColumn } from "./components/crm/KanbanColumn";
import { LogisticsCard, ON_SITE_COLOR, TRANSIT_COLOR, Thumb, shortDate } from "./components/crm/LogisticsCard";
import { Button } from "./components/ui/Button";
import { Input } from "./components/ui/Field";
import { Drawer } from "./components/ui/Drawer";
import { FullSpinner } from "./components/ui/Spinner";
import { EmptyState } from "./components/ui/EmptyState";
import { shortLocation } from "./Demandes";
import { RequestDetail } from "./RequestDetail";
import { today } from "./TransferPlanning";

export type Board = NonNullable<ReturnType<typeof useQuery<typeof api.meslogisticShuttles.board>>>;
export type Shuttle = Board["shuttles"][number];
export type Transit = Board["unassigned"][number];
type Status = Shuttle["status"];

export const STATUS: Record<Status, { label: string; color: string }> = {
  planifiee: { label: "Planifiée", color: "#3b82f6" },
  en_route: { label: "En route", color: TRANSIT_COLOR },
  terminee: { label: "Terminée", color: "#10b981" },
};
const UNPLANNED_COLOR = "#a855f7";

export const errorText = (caught: unknown) => {
  const data = (caught as { data?: unknown })?.data;
  if (typeof data === "string") return data;
  return caught instanceof Error ? caught.message.replace(/^.*(ConvexError|Uncaught Error):\s*/s, "").split("\n")[0] : "Opération impossible.";
};
const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

/** Ordre des arrêts sur l'axe Comptoir C — Solidarium — Esspace 150 (sinon dans l'ordre des demandes). */
export function stopsOf(transits: { origin: string; destination: string }[]) {
  if (!transits.length) return [];
  return tourStops(transits) ?? [...new Set(transits.flatMap(row => [row.origin, row.destination]))];
}

/** Compatibilité d'une demande avec une navette, d'après les lieux. */
export function compatibility(request: Transit, transits: Transit[]): { score: number; label?: string } {
  if (!transits.length) return { score: 0 };
  if (transits.some(row => onTheWay(row, request))) return { score: 4, label: "sur le chemin" };
  if (transits.some(row => onTheWay(request, row))) return { score: 3, label: "prolonge la tournée" };
  const key = (value: string) => shortLocation(value).toLocaleLowerCase("fr-FR");
  if (transits.some(row => key(row.origin) === key(request.origin))) return { score: 2, label: "même départ" };
  if (transits.some(row => key(row.destination) === key(request.destination))) return { score: 2, label: "même arrivée" };
  if (transits.some(row => sameDirection(row, request))) return { score: 1, label: "même sens" };
  return { score: 0 };
}

export const Stops = ({ stops, className = "" }: { stops: string[]; className?: string }) => stops.length ? <p className={`flex flex-wrap items-center gap-1 ${className}`}>{stops.map((stop, index) => <span key={`${stop}-${index}`} className="inline-flex items-center gap-1">{index > 0 && <ArrowRight size={12} className="shrink-0 opacity-60" />}<span>{shortLocation(stop)}</span></span>)}</p> : null;

/**
 * Demandes v2 : on raisonne en navettes. Une navette regroupe des demandes ;
 * c'est elle qui part (toutes ses demandes passent en transit) puis arrive
 * (toutes ses demandes sont disponibles à destination).
 */
export function ShuttleBoard({ canCreate, canUpdate }: { canCreate: boolean; canUpdate: boolean }) {
  const board = useQuery(api.meslogisticShuttles.board, {});
  const requests = useQuery(api.meslogistic.list, {});
  const [openShuttle, setOpenShuttle] = useState<string | null>(null);
  const [openRequest, setOpenRequest] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const shuttle = board?.shuttles.find(item => item._id === openShuttle);
  const request = requests?.find(item => item._id === openRequest);

  const byStatus = (status: Status) => (board?.shuttles ?? []).filter(item => item.status === status).sort((a, b) => status === "terminee" ? b.scheduledDate.localeCompare(a.scheduledDate) : a.scheduledDate.localeCompare(b.scheduledDate));
  const done = byStatus("terminee");
  const unassigned = [...(board?.unassigned ?? [])].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));

  return <div className="flex min-h-screen flex-col lg:h-screen">
    <PageHeader title="Demandes v2" actions={canCreate && <Button size="sm" onClick={() => setCreating(true)}><Plus size={16} />Nouvelle navette</Button>} />
    <div className="flex-1 overflow-auto p-4 sm:p-6">
      {!board ? <FullSpinner label="Chargement des navettes…" /> : <div className="flex flex-col gap-4 lg:h-full lg:flex-row">
        <KanbanColumn title="À planifier" count={unassigned.length} accent={UNPLANNED_COLOR}>
          {unassigned.length === 0 ? <p className="p-3 text-center text-xs text-zinc-500">Toutes les demandes sont dans une navette.</p> : unassigned.map(row => <RequestCardV1 key={row._id} request={row} onOpen={() => setOpenRequest(row._id)} />)}
        </KanbanColumn>
        {(["planifiee", "en_route"] as const).map(status => <KanbanColumn key={status} title={`Navettes ${STATUS[status].label.toLocaleLowerCase("fr-FR")}s`} count={byStatus(status).length} accent={STATUS[status].color}>
          {byStatus(status).length === 0 ? <p className="p-3 text-center text-xs text-zinc-500">{status === "planifiee" ? "Aucune navette planifiée." : "Aucune navette en route."}</p> : byStatus(status).map(item => <ShuttleCard key={item._id} shuttle={item} onOpen={() => setOpenShuttle(item._id)} />)}
        </KanbanColumn>)}
        <KanbanColumn title="Navettes terminées" count={done.length} accent={STATUS.terminee.color}>
          {(showDone ? done : done.slice(0, 5)).map(item => <ShuttleCard key={item._id} shuttle={item} onOpen={() => setOpenShuttle(item._id)} />)}
          {done.length > 5 && <button type="button" onClick={() => setShowDone(!showDone)} className="w-full rounded-lg py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-200">{showDone ? "Réduire" : `Voir les ${done.length - 5} autres`}</button>}
        </KanbanColumn>
      </div>}
    </div>
    {creating && <NewShuttle onClose={() => setCreating(false)} onCreated={id => { setCreating(false); setOpenShuttle(id); }} />}
    {shuttle && board && <ShuttleDetail key={shuttle._id} shuttle={shuttle} unassigned={unassigned} canUpdate={canUpdate} onClose={() => setOpenShuttle(null)} onOpenRequest={setOpenRequest} />}
    {request && <RequestDetail key={request._id} request={request} canUpdate={canUpdate} onClose={() => setOpenRequest(null)} />}
  </div>;
}

export function RequestChip({ request, onOpen, children }: { request: Transit; onOpen?: () => void; children?: ReactNode }) {
  const late = request.dueDate && request.dueDate < today();
  return <div className="rounded-2xl bg-[var(--crm-surface)] p-3 text-sm ring-1 ring-[var(--crm-border)]">
    <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 text-left">
      <Thumb src={request.photoUrl} size={48} className="bg-[var(--crm-surface-3)]" />
      <span className="block min-w-0 flex-1">
      <span className="flex items-start justify-between gap-2"><span className="min-w-0 truncate font-semibold">{request.quantity} {request.unit} · {request.title}</span>{request.fromOrder && <span className="shrink-0 rounded-md px-1.5 text-[10px] font-bold text-zinc-950" style={{ backgroundColor: TRANSIT_COLOR }}>BatiRE</span>}</span>
      <span className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold"><MapPin size={12} className="shrink-0" />{shortLocation(request.origin)}<ArrowRight size={12} className="shrink-0" />{shortLocation(request.destination)}</span>
      <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-zinc-500"><span className="truncate">{request.customerName || request.reference}</span>{request.dueDate && <span className={`shrink-0 tabular-nums ${late ? "font-semibold text-red-500" : ""}`}>échéance {shortDate(request.dueDate)}</span>}</span>
      </span>
    </button>
    {children}
  </div>;
}

/** Couleur des cartes de navettes (même dessin que les cartes Demandes v1). */
export const CARD_COLOR: Record<Status, string> = { planifiee: ON_SITE_COLOR, en_route: TRANSIT_COLOR, terminee: "#86efac" };

export function ShuttleCard({ shuttle, onOpen }: { shuttle: Shuttle; onOpen: () => void }) {
  const count = shuttle.transits.length;
  const loaded = shuttle.transits.filter(row => row.loadedAt).length;
  const delivered = shuttle.transits.filter(row => row.status === "receptionnee").length;
  const late = shuttle.transits.filter(row => row.dueDate && row.dueDate < shuttle.scheduledDate).length;
  const stops = stopsOf(shuttle.transits).map(shortLocation);
  const progress = shuttle.status === "planifiee" ? `${loaded}/${count} objet${count > 1 ? "s" : ""} chargé${loaded > 1 ? "s" : ""}` : shuttle.status === "en_route" ? "En transit" : `${delivered} arrivé${delivered > 1 ? "s" : ""} à destination`;
  return <LogisticsCard
    photos={count ? shuttle.transits.map(row => row.photoUrl) : undefined}
    source={shuttle.name}
    date={shortDate(shuttle.scheduledDate)}
    customer={`${count} objet${count > 1 ? "s" : ""}`}
    product={count ? progress : "Aucun objet"}
    footer={<span className="flex items-center justify-between gap-2"><span className="truncate text-[12px] font-bold">Départ : {shuttle.origin ? shortLocation(shuttle.origin) : stops[0] ?? "à définir"}</span>{shuttle.status === "planifiee" && late ? <span className="shrink-0">⚠ {late} après échéance</span> : null}</span>}
    color={CARD_COLOR[shuttle.status]}
    onOpen={onOpen}
  />;
}

/** Demande sans navette, carte identique à Demandes v1. */
export function RequestCardV1({ request, onOpen }: { request: Transit; onOpen: () => void }) {
  return <LogisticsCard
    photos={[request.photoUrl]}
    source={request.fromOrder ? "BatiRE" : "Demande interne"}
    date={request.reference}
    customer={request.customerName || "Déplacement interne"}
    product={`${request.quantity} ${request.unit} · ${request.title}`}
    origin={shortLocation(request.origin)}
    destination={shortLocation(request.destination)}
    footer={request.dueDate ? `Échéance ${shortDate(request.dueDate)}` : undefined}
    color={request.fromOrder ? TRANSIT_COLOR : "#d9d9d9"}
    onOpen={onOpen}
  />;
}

/** Lieu de départ d'une navette : l'un des trois sites. */
export function OriginSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <select required value={value} onChange={event => onChange(event.target.value)} className="mt-1 block h-10 w-full rounded-xl border border-[var(--crm-border)] bg-[var(--crm-surface-2)] px-3 text-sm">
    <option value="" disabled>Choisir le lieu de départ</option>
    {Object.values(LOCATIONS).map(name => <option key={name} value={name}>{name}</option>)}
  </select>;
}

export function NewShuttle({ onClose, onCreated }: { onClose: () => void; onCreated: (id: Id<"mlShuttles">) => void }) {
  const create = useMutation(api.meslogistic.createShuttle);
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { onCreated(await create({ name, scheduledDate: date, origin })); } catch (caught) { setError(errorText(caught)); setBusy(false); }
  }
  return <Drawer open onClose={onClose} variant="modal" title="Nouvelle navette" panelClassName="max-w-xl">
    <form onSubmit={submit} className="space-y-4 py-4">
      <p className="text-sm text-zinc-500">Ensuite, ajoutez-y les demandes à transporter.</p>
      <label className="block text-sm font-medium">Nom de la navette<Input required maxLength={100} autoFocus placeholder="Ex. Tournée du mardi" value={name} onChange={event => setName(event.target.value)} /></label>
      <label className="block text-sm font-medium">Lieu de départ<OriginSelect value={origin} onChange={setOrigin} /></label>
      <label className="block text-sm font-medium">Date de départ<Input required type="date" min={today()} value={date} onChange={event => setDate(event.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2"><Button type="submit" disabled={busy || !name.trim() || !date || !origin}>{busy ? "Création…" : "Créer et ajouter des demandes"}</Button><Button type="button" variant="secondary" onClick={onClose}>Annuler</Button></div>
    </form>
  </Drawer>;
}

export function ShuttleDetail({ shuttle, unassigned, canUpdate, onClose, onOpenRequest, layout = "modal" }: { shuttle: Shuttle; unassigned: Transit[]; canUpdate: boolean; onClose: () => void; onOpenRequest: (id: string) => void; layout?: "modal" | "panel" }) {
  const addRequests = useMutation(api.meslogisticShuttles.addRequests);
  const removeRequest = useMutation(api.meslogisticShuttles.removeRequest);
  const depart = useMutation(api.meslogisticShuttles.departShuttle);
  const deliver = useMutation(api.meslogisticShuttles.deliverShuttle);
  const updateShuttle = useMutation(api.meslogisticShuttles.updateShuttle);
  const deleteShuttle = useMutation(api.meslogisticShuttles.deleteShuttle);
  const setLoaded = useMutation(api.meslogisticShuttles.setLoaded);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(shuttle.name);
  const [date, setDate] = useState(shuttle.scheduledDate);
  const [origin, setOrigin] = useState(shuttle.origin ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setPicked(new Set()); }, [shuttle.status]);
  const planned = shuttle.status === "planifiee";
  const enRoute = shuttle.status === "en_route";
  const stops = stopsOf(shuttle.transits);
  const candidates = useMemo(() => unassigned.map(request => ({ request, ...compatibility(request, shuttle.transits) })).sort((a, b) => b.score - a.score || (a.request.dueDate ?? "9999").localeCompare(b.request.dueDate ?? "9999")), [unassigned, shuttle.transits]);
  const previewStops = picked.size ? stopsOf([...shuttle.transits, ...unassigned.filter(row => picked.has(row._id))]) : null;
  const pendingDelivery = shuttle.transits.filter(row => row.status === "en_transit");
  const loadedCount = shuttle.transits.filter(row => row.loadedAt).length;
  const allLoaded = shuttle.transits.length > 0 && loadedCount === shuttle.transits.length;

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true); setError("");
    try { await action(); after?.(); } catch (caught) { setError(errorText(caught)); } finally { setBusy(false); }
  }
  const toggle = (set: Set<string>, id: string, update: (next: Set<string>) => void) => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); update(next); };

  const steps: { key: Status; label: string }[] = [{ key: "planifiee", label: "Planifiée" }, { key: "en_route", label: "En route" }, { key: "terminee", label: "Terminée" }];
  const reached = steps.findIndex(step => step.key === shuttle.status);

  const headerContent = <><h2 className="text-2xl font-bold">{shuttle.name}</h2><p className="mt-1 flex items-center gap-2 text-sm capitalize"><CalendarClock size={15} />{longDate(shuttle.scheduledDate)} · {shuttle.transits.length} objet{shuttle.transits.length > 1 ? "s" : ""}</p>{shuttle.origin && <p className="mt-1 flex items-center gap-2 text-sm font-semibold"><MapPin size={15} />Départ : {shortLocation(shuttle.origin)}</p>}</>;
  const body = <div className={layout === "panel" ? "space-y-6" : "space-y-6 py-6"}>
      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-500">{error}</p>}

      <section className="rounded-2xl border border-[var(--crm-border)] p-5">
        <ol className="flex items-center gap-2">{steps.map((step, index) => <li key={step.key} className="flex flex-1 items-center gap-2">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${index <= reached ? "border-transparent text-zinc-950" : "border-zinc-500 text-zinc-400"}`} style={index <= reached ? { backgroundColor: STATUS[step.key].color } : undefined}>{index < reached || shuttle.status === "terminee" ? <Check size={16} /> : index + 1}</span>
          <span className={`text-sm font-semibold ${index <= reached ? "" : "text-zinc-500"}`}>{step.label}</span>
          {index < steps.length - 1 && <span className="h-px flex-1 bg-[var(--crm-border)]" />}
        </li>)}</ol>
        {stops.length > 0 && <div className="mt-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Tournée</p><Stops stops={stops} className="mt-1.5 text-lg font-bold" /></div>}
        {planned && shuttle.transits.length > 0 && <div className={`mt-5 rounded-xl border p-3 ${allLoaded ? "border-green-500/40 bg-green-500/10" : "border-amber-500/40 bg-amber-500/10"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold"><ClipboardCheck size={16} />{loadedCount}/{shuttle.transits.length} objet{shuttle.transits.length > 1 ? "s" : ""} chargé{loadedCount > 1 ? "s" : ""}</p>
            {canUpdate && !allLoaded && <Button size="sm" variant="secondary" disabled={busy} onClick={() => { if (window.confirm(`Confirmer que les ${shuttle.transits.length} objets sont bien chargés dans « ${shuttle.name} » ?`)) void run(() => setLoaded({ shuttleId: shuttle._id, loaded: true })); }}><Check size={14} />Tout est chargé</Button>}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--crm-surface-3)]"><div className={`h-full rounded-full transition-all ${allLoaded ? "bg-green-500" : "bg-amber-500"}`} style={{ width: `${loadedCount / shuttle.transits.length * 100}%` }} /></div>
          {!allLoaded && <p className="mt-2 text-xs text-zinc-500">Cochez « Chargé » sur chaque objet une fois dans le véhicule. Seuls les objets chargés partent ; les autres reviendront « À planifier ».</p>}
        </div>}
        {canUpdate && planned && <div className="mt-4 flex flex-wrap items-center gap-3"><Button disabled={busy || loadedCount === 0} onClick={() => { const left = shuttle.transits.length - loadedCount; if (left && !window.confirm(`${left} objet${left > 1 ? "s" : ""} non chargé${left > 1 ? "s" : ""} ne partira pas et reviendra « À planifier ». Confirmer le départ ?`)) return; void run(() => depart({ shuttleId: shuttle._id })); }}><Truck size={16} />Départ de la navette</Button><span className="text-xs text-zinc-500">{!shuttle.transits.length ? "Ajoutez d’abord des demandes." : loadedCount === 0 ? "Cochez « Chargé » sur les objets embarqués." : `${loadedCount} objet${loadedCount > 1 ? "s" : ""} chargé${loadedCount > 1 ? "s" : ""} passe${loadedCount > 1 ? "nt" : ""} « En transit ».`}</span></div>}
        {canUpdate && enRoute && <div className="mt-5 flex flex-wrap items-center gap-3"><Button disabled={busy} onClick={() => void run(() => deliver({ shuttleId: shuttle._id }))}><PackageCheck size={16} />Arrivée</Button><span className="text-xs text-zinc-500">Les {pendingDelivery.length} objet{pendingDelivery.length > 1 ? "s" : ""} chargé{pendingDelivery.length > 1 ? "s" : ""} passe{pendingDelivery.length > 1 ? "nt" : ""} « Arrivé à destination » (Bâtire prévenu).</span></div>}
        {shuttle.departedAt && <p className="mt-3 text-xs text-zinc-500">Partie le {new Date(shuttle.departedAt).toLocaleString("fr-FR")}{shuttle.completedAt ? ` · arrivée le ${new Date(shuttle.completedAt).toLocaleString("fr-FR")}` : ""}</p>}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Demandes dans la navette ({shuttle.transits.length})</h3>
        </div>
        {shuttle.transits.length === 0 ? <p className="rounded-xl bg-[var(--crm-surface-2)] p-4 text-sm text-zinc-500">Aucune demande pour l’instant. Ajoutez-en ci-dessous.</p> :
          <div className="grid gap-2">{shuttle.transits.map(row => <RequestChip key={row._id} request={row} onOpen={() => onOpenRequest(row._id)}>
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--crm-border)] pt-2 text-xs">
              {planned && row.status === "a_preparer" ? <label className={`flex items-center gap-1.5 font-semibold ${row.loadedAt ? "text-green-500" : "text-amber-500"}`} title={row.loadedAt ? `Confirmé par ${row.loadedBy ?? "?"} le ${new Date(row.loadedAt).toLocaleString("fr-FR")}` : undefined}><input type="checkbox" disabled={!canUpdate || busy} checked={Boolean(row.loadedAt)} onChange={event => void run(() => setLoaded({ shuttleId: shuttle._id, requestId: row._id, loaded: event.target.checked }))} />{row.loadedAt ? "Chargé" : "À charger"}</label>
                : <span className={row.status === "receptionnee" ? "font-semibold text-green-500" : row.status === "en_transit" ? "font-semibold" : "text-zinc-500"} style={row.status === "en_transit" ? { color: TRANSIT_COLOR } : undefined}>{row.status === "receptionnee" ? "Arrivé à destination" : row.status === "en_transit" ? "Chargé · en transit" : "À charger"}</span>}
              {canUpdate && planned && <button type="button" disabled={busy} onClick={() => void run(() => removeRequest({ requestId: row._id }))} className="flex items-center gap-1 text-zinc-500 hover:text-red-500"><X size={13} />Retirer</button>}
            </div>
            {planned && row.dueDate && row.dueDate < shuttle.scheduledDate && <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-amber-500"><AlertTriangle size={12} />La navette part après l’échéance.</p>}
          </RequestChip>)}</div>}
        {enRoute && pendingDelivery.length === 0 && <p className="text-sm text-zinc-500">Tout est livré.</p>}
      </section>

      {canUpdate && planned && <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Ajouter des demandes</h3>
          {picked.size > 0 && <Button size="sm" disabled={busy} onClick={() => void run(() => addRequests({ shuttleId: shuttle._id, requestIds: [...picked] as Id<"mlRequests">[] }), () => setPicked(new Set()))}><Plus size={15} />Ajouter {picked.size} demande{picked.size > 1 ? "s" : ""}</Button>}
        </div>
        {previewStops && <p className="flex flex-wrap items-center gap-2 rounded-xl bg-brand-500/10 p-3 text-sm"><span className="font-semibold">Tournée après ajout :</span><Stops stops={previewStops} /></p>}
        {candidates.length === 0 ? <p className="rounded-xl bg-[var(--crm-surface-2)] p-4 text-sm text-zinc-500">Aucune demande à planifier.</p> :
          <ul className="space-y-2">{candidates.map(({ request, label }) => {
            const checked = picked.has(request._id);
            const late = request.dueDate && request.dueDate < shuttle.scheduledDate;
            return <li key={request._id}><label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${checked ? "border-brand-500 bg-brand-500/10" : "border-[var(--crm-border)] bg-[var(--crm-surface-2)]"}`}>
              <input type="checkbox" className="mt-1" checked={checked} onChange={() => toggle(picked, request._id, setPicked)} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{request.quantity} {request.unit} · {request.title}</span>{label && <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-500">{label}</span>}{late && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-500">échéance avant la navette</span>}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500"><span className="flex items-center gap-1 font-semibold text-zinc-300">{shortLocation(request.origin)}<ArrowRight size={12} />{shortLocation(request.destination)}</span><span>{request.customerName || request.reference}</span>{request.dueDate && <span>échéance {shortDate(request.dueDate)}</span>}</span>
              </span>
            </label></li>;
          })}</ul>}
      </section>}

      {canUpdate && planned && <section className="flex flex-wrap items-end gap-3 border-t border-[var(--crm-border)] pt-5">
        {editing ? <form onSubmit={event => { event.preventDefault(); void run(() => updateShuttle({ shuttleId: shuttle._id, name, scheduledDate: date, origin: origin || undefined }), () => setEditing(false)); }} className="flex flex-wrap items-end gap-2">
          <label className="text-sm">Nom<Input required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
          <label className="text-sm">Date<Input required type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
          <label className="text-sm">Départ<OriginSelect value={origin} onChange={setOrigin} /></label>
          <Button type="submit" size="sm" disabled={busy}>Enregistrer</Button><Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>Annuler</Button>
        </form> : <Button size="sm" variant="secondary" onClick={() => setEditing(true)}><Pencil size={14} />Modifier nom / date</Button>}
        <Button size="sm" variant="danger" disabled={busy} onClick={() => { if (window.confirm(`Supprimer la navette « ${shuttle.name} » ? Ses demandes reviendront dans « À planifier ».`)) void run(() => deleteShuttle({ shuttleId: shuttle._id }), onClose); }}><Trash2 size={14} />Supprimer la navette</Button>
      </section>}
    </div>;

  if (layout === "panel") return <aside aria-label={`Navette ${shuttle.name}`} className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-3xl border border-[var(--crm-border)] bg-[var(--crm-surface)] lg:w-[460px] xl:w-[520px]">
    <div className="shrink-0 px-5 py-4 text-zinc-950" style={{ backgroundColor: CARD_COLOR[shuttle.status] }}>
      <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-semibold"><Bus size={16} />Navette · {STATUS[shuttle.status].label}</span><button type="button" onClick={onClose} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold hover:bg-black/10"><X size={16} />Fermer</button></div>
      <div className="mt-2">{headerContent}</div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{body}</div>
  </aside>;

  return <Drawer open onClose={onClose} variant="modal" headerStyle={{ backgroundColor: CARD_COLOR[shuttle.status], color: "#09090b" }} headerClassName="text-zinc-950" closeButtonClassName="text-zinc-950"
    title={<span className="flex items-center gap-2 text-zinc-950"><Bus size={18} />Navette · {STATUS[shuttle.status].label}</span>}
    headerContent={headerContent}>
    {body}
  </Drawer>;
}

export function EmptyShuttles() {
  return <EmptyState icon={<Bus size={32} />} title="Aucune navette" description="Créez une navette pour commencer." />;
}
