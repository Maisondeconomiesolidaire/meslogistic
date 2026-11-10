import { useCallback, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ArrowLeft, ArrowRight, Bus, CalendarClock, Check, ClipboardCheck, ExternalLink, GripVertical, MapPin, PackageCheck, Plus, Search, Truck, X } from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { Thumb, TRANSIT_COLOR, shortDate } from "./components/crm/LogisticsCard";
import { Button } from "./components/ui/Button";
import { FullSpinner } from "./components/ui/Spinner";
import { shortLocation, statusLabel, type Request } from "./Demandes";
import { ArticlePreview, RequestDetail } from "./RequestDetail";
import { NewShuttle, STATUS, Stops, errorText, stopsOf, type Shuttle } from "./ShuttleBoard";
import { today } from "./TransferPlanning";
import { LogisticsMap, SELECTED_COLOR } from "./LogisticsMap";

type Status = Shuttle["status"];
/** Libellés de la page d'accueil, comme sur le kanban des navettes. */
const SHUTTLE_LABEL: Record<Status, string> = { planifiee: "Nouveau", en_route: "En transit", terminee: "Terminée" };
const FILTERS: { key: "tous" | Status; label: string }[] = [{ key: "tous", label: "Toutes" }, { key: "planifiee", label: "Nouveau" }, { key: "en_route", label: "En transit" }, { key: "terminee", label: "Terminée" }];
const DRAG_TYPE = "application/x-meslogistic-request";
const objets = (count: number) => `${count} objet${count > 1 ? "s" : ""}`;
const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/**
 * Accueil : les demandes à gauche (échéance la plus proche d'abord), la carte au
 * centre et les navettes en bas. Une navette s'ouvre dans la même section ; on y
 * glisse les demandes de la liste. Cliquer une demande la centre sur la carte et
 * ouvre sa fiche dans un panneau à droite.
 */
export function Accueil({ canCreate, canUpdate, isDark }: { canCreate: boolean; canUpdate: boolean; isDark: boolean }) {
  const requests = useQuery(api.meslogistic.list, {}) as Request[] | undefined;
  const board = useQuery(api.meslogisticShuttles.board, {});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [fullSheet, setFullSheet] = useState(false);
  const onPlace = useCallback((next: string | null) => setPlace(next), []);

  const active = useMemo(() => (requests ?? [])
    .filter(request => request.status === "a_preparer" || request.status === "en_transit")
    .sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") || a.createdAt - b.createdAt), [requests]);
  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("fr-FR");
    return active.filter(request => (!place || shortLocation(request.origin) === place || shortLocation(request.destination) === place)
      && (!needle || [request.title, request.reference, request.customerName, request.origin, request.destination].some(value => value?.toLocaleLowerCase("fr-FR").includes(needle))));
  }, [active, place, search]);

  if (!requests || !board) return <FullSpinner label="Chargement de l’accueil…" />;
  const selected = requests.find(request => request._id === selectedId) ?? null;
  const shuttleName = (id?: string) => board.shuttles.find(shuttle => shuttle._id === id)?.name;

  return <div className="flex h-[calc(100dvh-3.5rem)] flex-col gap-3 overflow-y-auto p-3 lg:h-dvh lg:flex-row lg:overflow-hidden">
    {/* Demandes */}
    <aside className="flex min-h-[420px] w-full shrink-0 flex-col overflow-hidden rounded-3xl border border-[var(--crm-border)] bg-[var(--crm-surface)] lg:min-h-0 lg:w-[340px]">
      <div className="shrink-0 space-y-3 border-b border-[var(--crm-border)] p-4">
        <div className="flex items-baseline justify-between gap-2"><h1 className="text-lg font-bold">Demandes</h1><span className="text-xs text-zinc-500">{objets(visible.length)} · échéance la plus proche d’abord</span></div>
        <label className="flex items-center gap-2 rounded-xl bg-[var(--crm-surface-2)] px-3 py-2 text-sm"><Search size={15} className="shrink-0 text-zinc-500" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Objet, référence, client…" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-500" /></label>
        {place && <button type="button" onClick={() => setPlace(null)} className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ backgroundColor: SELECTED_COLOR }}><MapPin size={12} />{place}<X size={12} /></button>}
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3">
        {visible.length === 0 ? <li className="rounded-xl bg-[var(--crm-surface-2)] p-4 text-sm text-zinc-500">Aucune demande en cours.</li> : visible.map(request => {
          const draggable = canUpdate && request.status === "a_preparer" && !request.shuttleId;
          return <li key={request._id}><RequestRow request={request} shuttleName={shuttleName(request.shuttleId)} selected={request._id === selectedId} draggable={draggable}
            onClick={() => setSelectedId(request._id === selectedId ? null : request._id)}
            onDragStart={event => { event.dataTransfer.setData(DRAG_TYPE, request._id); event.dataTransfer.setData("text/plain", request.reference); event.dataTransfer.effectAllowed = "move"; setDragging(request._id); }}
            onDragEnd={() => setDragging(null)} /></li>;
        })}
      </ul>
    </aside>

    {/* Carte + navettes */}
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <section aria-label="Carte des demandes" className="relative min-h-[320px] flex-[3] overflow-hidden rounded-3xl border border-[var(--crm-border)] bg-[var(--crm-surface)]">
        <LogisticsMap requests={active} selected={selected} place={place} onPlace={onPlace} isDark={isDark} />
      </section>
      <ShuttleSection shuttles={board.shuttles} dragging={dragging} canCreate={canCreate} canUpdate={canUpdate} onSelectRequest={id => setSelectedId(id)} selectedId={selectedId} />
    </div>

    {/* Fiche de la demande */}
    {selected && <RequestPanel request={selected} shuttleName={shuttleName(selected.shuttleId)} onClose={() => setSelectedId(null)} onOpenFull={() => setFullSheet(true)} />}
    {selected && fullSheet && <RequestDetail request={selected} canUpdate={canUpdate} onClose={() => setFullSheet(false)} />}
  </div>;
}

function RequestRow({ request: r, shuttleName, selected, draggable, onClick, onDragStart, onDragEnd }: {
  request: Request; shuttleName?: string; selected: boolean; draggable: boolean; onClick: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void; onDragEnd: () => void;
}) {
  const late = r.dueDate && r.dueDate < today();
  const soon = r.dueDate && !late && r.dueDate <= new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const state = r.status === "en_transit" ? { label: "En transit", color: TRANSIT_COLOR } : r.shuttleId ? { label: shuttleName ?? "Navette", color: STATUS.planifiee.color } : { label: "À planifier", color: "#71717a" };
  return <button type="button" draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick} title={draggable ? "Glissez sur une navette pour l’affecter" : undefined}
    className={`group flex w-full items-start gap-3 rounded-2xl border p-2.5 text-left text-sm transition-colors ${selected ? "border-transparent ring-2" : "border-[var(--crm-border)] hover:bg-[var(--crm-surface-2)]"} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    style={selected ? { backgroundColor: `${SELECTED_COLOR}1f`, ["--tw-ring-color" as string]: SELECTED_COLOR } : undefined}>
    <Thumb src={r.photoUrl} size={52} className="bg-[var(--crm-surface-3)]" />
    <span className="min-w-0 flex-1">
      <span className="flex items-start justify-between gap-2"><span className="line-clamp-2 font-semibold leading-snug">{r.title}</span>{draggable && <GripVertical size={15} className="mt-0.5 shrink-0 text-zinc-500 opacity-60 group-hover:opacity-100" />}</span>
      <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-zinc-400"><span className="truncate">{shortLocation(r.origin)}</span><ArrowRight size={11} className="shrink-0" /><span className="truncate">{shortLocation(r.destination)}</span></span>
      <span className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="flex min-w-0 items-center gap-1.5 truncate font-semibold" style={{ color: state.color }}><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: state.color }} /><span className="truncate">{state.label}</span></span>
        <span className={`shrink-0 tabular-nums ${late ? "font-bold text-red-500" : soon ? "font-semibold text-amber-500" : "text-zinc-500"}`}>{r.dueDate ? `${late ? "en retard · " : ""}${shortDate(r.dueDate)}` : "sans échéance"}</span>
      </span>
    </span>
  </button>;
}

/** Section du bas : la liste des navettes, ou la navette ouverte (même emplacement). */
function ShuttleSection({ shuttles, dragging, canCreate, canUpdate, onSelectRequest, selectedId }: {
  shuttles: Shuttle[]; dragging: string | null; canCreate: boolean; canUpdate: boolean; onSelectRequest: (id: string) => void; selectedId: string | null;
}) {
  const addRequests = useMutation(api.meslogisticShuttles.addRequests);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"tous" | Status>("tous");
  const [creating, setCreating] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [error, setError] = useState("");
  const open = shuttles.find(shuttle => shuttle._id === openId);
  const rank: Record<Status, number> = { en_route: 0, planifiee: 1, terminee: 2 };
  const rows = shuttles.filter(shuttle => filter === "tous" || shuttle.status === filter)
    .sort((a, b) => rank[a.status] - rank[b.status] || (a.status === "terminee" ? b.scheduledDate.localeCompare(a.scheduledDate) : a.scheduledDate.localeCompare(b.scheduledDate)));

  async function drop(shuttle: Shuttle, event: DragEvent) {
    event.preventDefault(); setDropTarget(null);
    const requestId = event.dataTransfer.getData(DRAG_TYPE);
    if (!requestId || shuttle.status !== "planifiee") return;
    setError("");
    try { await addRequests({ shuttleId: shuttle._id, requestIds: [requestId as Id<"mlRequests">] }); } catch (caught) { setError(errorText(caught)); }
  }
  const dropProps = (shuttle: Shuttle) => shuttle.status === "planifiee" && canUpdate ? {
    onDragOver: (event: DragEvent) => { if (!event.dataTransfer.types.includes(DRAG_TYPE)) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(shuttle._id); },
    onDragLeave: () => setDropTarget(current => current === shuttle._id ? null : current),
    onDrop: (event: DragEvent) => void drop(shuttle, event),
  } : {};

  return <section aria-label="Navettes" className="flex min-h-[300px] flex-[2] flex-col overflow-hidden rounded-3xl border border-[var(--crm-border)] bg-[var(--crm-surface)]">
    {error && <p role="alert" className="flex shrink-0 items-center justify-between gap-2 bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}<button type="button" onClick={() => setError("")} aria-label="Fermer"><X size={14} /></button></p>}
    {open ? <ShuttleInline shuttle={open} canUpdate={canUpdate} dragging={dragging} dropActive={dropTarget === open._id} dropProps={dropProps(open)} onBack={() => setOpenId(null)} onSelectRequest={onSelectRequest} selectedId={selectedId} onError={setError} /> : <>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--crm-border)] px-4 py-3">
        <h2 className="mr-2 text-lg font-bold">Navettes</h2>
        <div className="flex flex-wrap gap-1.5">{FILTERS.map(item => {
          const count = item.key === "tous" ? shuttles.length : shuttles.filter(shuttle => shuttle.status === item.key).length;
          const color = item.key === "tous" ? undefined : STATUS[item.key].color;
          return <button key={item.key} type="button" onClick={() => setFilter(item.key)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${filter === item.key ? "border-transparent bg-zinc-100 text-zinc-950" : "border-[var(--crm-border)] text-zinc-400 hover:text-zinc-100"}`}>{color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}{item.label}<span className="tabular-nums opacity-70">{count}</span></button>;
        })}</div>
        {dragging && <span className="text-xs font-semibold text-brand-500">Déposez la demande sur une navette « Nouveau »</span>}
        {canCreate && <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}><Plus size={15} />Nouvelle navette</Button>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? <p className="p-6 text-sm text-zinc-500">Aucune navette.</p> :
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--crm-surface)] text-left text-xs text-zinc-500"><tr className="border-b border-[var(--crm-border)]">
              <th className="px-4 py-2 font-medium">Statut</th><th className="px-3 py-2 font-medium">Navette</th><th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Départ</th><th className="px-3 py-2 font-medium">Tournée</th><th className="px-3 py-2 font-medium">Objets</th>
            </tr></thead>
            <tbody>{rows.map(shuttle => {
              const loaded = shuttle.transits.filter(row => row.loadedAt).length;
              const target = dropTarget === shuttle._id;
              const droppable = Boolean(dragging) && shuttle.status === "planifiee" && canUpdate;
              return <tr key={shuttle._id} {...dropProps(shuttle)} onClick={() => setOpenId(shuttle._id)}
                className={`cursor-pointer border-b border-[var(--crm-border)] transition-colors ${target ? "bg-brand-500/20" : droppable ? "bg-brand-500/5" : "hover:bg-[var(--crm-surface-2)]"}`}>
                <td className="px-4 py-2.5"><span className="flex items-center gap-2 font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS[shuttle.status].color }} />{SHUTTLE_LABEL[shuttle.status]}</span></td>
                <td className="px-3 py-2.5 font-semibold">{shuttle.name}</td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-zinc-400">{shortDate(shuttle.scheduledDate)}</td>
                <td className="px-3 py-2.5 text-zinc-400">{shuttle.origin ? shortLocation(shuttle.origin) : "—"}</td>
                <td className="px-3 py-2.5"><Stops stops={stopsOf(shuttle.transits)} className="text-xs text-zinc-400" /></td>
                <td className="px-3 py-2.5"><span className="flex items-center gap-2"><span className="flex -space-x-2">{shuttle.transits.slice(0, 4).map(row => <Thumb key={row._id} src={row.photoUrl} size={26} className="rounded-lg bg-[var(--crm-surface-3)] ring-2 ring-[var(--crm-surface)]" />)}</span><span className="whitespace-nowrap text-xs text-zinc-400">{shuttle.transits.length}{shuttle.status === "planifiee" && shuttle.transits.length ? ` · ${loaded} chargé${loaded > 1 ? "s" : ""}` : ""}</span></span></td>
              </tr>;
            })}</tbody>
          </table>}
      </div>
    </>}
    {creating && <NewShuttle onClose={() => setCreating(false)} onCreated={id => { setCreating(false); setOpenId(id); }} />}
  </section>;
}

function ShuttleInline({ shuttle, canUpdate, dragging, dropActive, dropProps, onBack, onSelectRequest, selectedId, onError }: {
  shuttle: Shuttle; canUpdate: boolean; dragging: string | null; dropActive: boolean; dropProps: Record<string, unknown>;
  onBack: () => void; onSelectRequest: (id: string) => void; selectedId: string | null; onError: (message: string) => void;
}) {
  const removeRequest = useMutation(api.meslogisticShuttles.removeRequest);
  const setLoaded = useMutation(api.meslogisticShuttles.setLoaded);
  const depart = useMutation(api.meslogisticShuttles.departShuttle);
  const deliver = useMutation(api.meslogisticShuttles.deliverShuttle);
  const [busy, setBusy] = useState(false);
  const planned = shuttle.status === "planifiee";
  const loaded = shuttle.transits.filter(row => row.loadedAt).length;
  const total = shuttle.transits.length;
  async function run(action: () => Promise<unknown>) {
    setBusy(true); onError("");
    try { await action(); } catch (caught) { onError(errorText(caught)); } finally { setBusy(false); }
  }
  let actions: ReactNode = null;
  if (canUpdate && planned) actions = <>
    {total > 0 && loaded < total && <Button size="sm" variant="secondary" disabled={busy} onClick={() => { if (window.confirm(`Confirmer que les ${total} objets sont chargés dans « ${shuttle.name} » ?`)) void run(() => setLoaded({ shuttleId: shuttle._id, loaded: true })); }}><Check size={14} />Tout est chargé</Button>}
    <Button size="sm" disabled={busy || loaded === 0} onClick={() => { const left = total - loaded; if (left && !window.confirm(`${objets(left)} non chargé${left > 1 ? "s" : ""} ne partira pas et reviendra « À planifier ». Confirmer le départ ?`)) return; void run(() => depart({ shuttleId: shuttle._id })); }}><Truck size={14} />Départ</Button>
  </>;
  if (canUpdate && shuttle.status === "en_route") actions = <Button size="sm" disabled={busy} onClick={() => void run(() => deliver({ shuttleId: shuttle._id }))}><PackageCheck size={14} />Arrivée</Button>;

  return <div {...dropProps} className={`flex min-h-0 flex-1 flex-col transition-colors ${dropActive ? "bg-brand-500/10" : ""}`}>
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--crm-border)] px-4 py-3">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-zinc-400 hover:bg-[var(--crm-surface-2)] hover:text-zinc-100"><ArrowLeft size={16} />Navettes</button>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-lg font-bold"><Bus size={18} />{shuttle.name}<span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-zinc-950" style={{ backgroundColor: STATUS[shuttle.status].color }}>{SHUTTLE_LABEL[shuttle.status]}</span></p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400"><span className="flex items-center gap-1 capitalize"><CalendarClock size={13} />{longDate(shuttle.scheduledDate)}</span>{shuttle.origin && <span className="flex items-center gap-1"><MapPin size={13} />Départ : {shortLocation(shuttle.origin)}</span>}<Stops stops={stopsOf(shuttle.transits)} className="font-semibold text-zinc-300" /></p>
      </div>
      {planned && total > 0 && <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${loaded === total ? "bg-green-500/15 text-green-500" : "bg-amber-500/15 text-amber-500"}`}><ClipboardCheck size={14} />{loaded}/{objets(total)} chargé{loaded > 1 ? "s" : ""}</span>}
      <div className="ml-auto flex flex-wrap gap-2">{actions}</div>
    </div>
    <div className="min-h-0 flex-1 overflow-auto p-3">
      {planned && canUpdate && <div className={`mb-3 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-sm font-semibold transition-colors ${dropActive ? "border-brand-500 bg-brand-500/15 text-brand-500" : dragging ? "border-brand-500/60 text-brand-500" : "border-[var(--crm-border)] text-zinc-500"}`}><GripVertical size={16} />Glissez ici des demandes de la liste de gauche</div>}
      {total === 0 ? <p className="p-3 text-sm text-zinc-500">Aucun objet dans cette navette.</p> :
        <ul className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">{shuttle.transits.map(row => {
          const late = planned && row.dueDate && row.dueDate < shuttle.scheduledDate;
          return <li key={row._id} className={`flex items-center gap-3 rounded-2xl border p-2.5 text-sm ${row._id === selectedId ? "border-transparent ring-2" : "border-[var(--crm-border)]"}`} style={row._id === selectedId ? { ["--tw-ring-color" as string]: SELECTED_COLOR } : undefined}>
            <button type="button" onClick={() => onSelectRequest(row._id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <Thumb src={row.photoUrl} size={44} className="bg-[var(--crm-surface-3)]" />
              <span className="min-w-0"><span className="block truncate font-semibold">{row.quantity} {row.unit} · {row.title}</span>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-zinc-400">{shortLocation(row.origin)}<ArrowRight size={11} />{shortLocation(row.destination)}{row.dueDate && <span className={late ? "ml-1 font-semibold text-amber-500" : "ml-1 text-zinc-500"}>· {shortDate(row.dueDate)}</span>}{late && <AlertTriangle size={12} className="text-amber-500" />}</span></span>
            </button>
            <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
              {planned && row.status === "a_preparer" ? <label className={`flex items-center gap-1.5 font-semibold ${row.loadedAt ? "text-green-500" : "text-amber-500"}`}><input type="checkbox" disabled={!canUpdate || busy} checked={Boolean(row.loadedAt)} onChange={event => void run(() => setLoaded({ shuttleId: shuttle._id, requestId: row._id, loaded: event.target.checked }))} />{row.loadedAt ? "Chargé" : "À charger"}</label>
                : <span className={row.status === "receptionnee" ? "font-semibold text-green-500" : "font-semibold"} style={row.status === "en_transit" ? { color: TRANSIT_COLOR } : undefined}>{row.status === "receptionnee" ? "Arrivé" : row.status === "en_transit" ? "En transit" : statusLabel(row.status)}</span>}
              {canUpdate && planned && <button type="button" disabled={busy} onClick={() => void run(() => removeRequest({ requestId: row._id }))} className="flex items-center gap-1 text-zinc-500 hover:text-red-500"><X size={12} />Retirer</button>}
            </span>
          </li>;
        })}</ul>}
    </div>
  </div>;
}

/** Panneau vertical de droite : la demande sélectionnée (photo, produit, trajet). */
function RequestPanel({ request: r, shuttleName, onClose, onOpenFull }: { request: Request; shuttleName?: string; onClose: () => void; onOpenFull: () => void }) {
  const late = r.dueDate && r.dueDate < today();
  return <aside aria-label={`Demande ${r.reference}`} className="flex min-h-[480px] w-full shrink-0 flex-col overflow-hidden rounded-3xl border border-[var(--crm-border)] bg-[var(--crm-surface)] lg:min-h-0 lg:w-[380px]">
    <div className="shrink-0 px-5 py-4 text-zinc-950" style={{ backgroundColor: r.orderId ? TRANSIT_COLOR : "#d9d9d9" }}>
      <div className="flex items-center justify-between gap-2 text-xs font-semibold"><span>{r.orderId ? "BatiRE" : "Demande interne"} · {r.reference}</span><button type="button" onClick={onClose} aria-label="Fermer la fiche" className="rounded-lg p-1 hover:bg-black/10"><X size={16} /></button></div>
      <h2 className="mt-2 text-xl font-bold leading-tight">{r.title}</h2>
      <p className="mt-1 text-sm">{r.customerName || "Déplacement interne"} · {r.quantity} {r.unit}</p>
    </div>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
      <div className={`rounded-2xl border p-4 ${late ? "border-red-500/50 bg-red-500/10" : "border-[#ff914d]/40 bg-[#ff914d]/10"}`}>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500"><CalendarClock size={14} />Échéance · arrivée au plus tard</p>
        <p className={`mt-1 text-xl font-bold capitalize ${late ? "text-red-500" : ""}`}>{r.dueDate ? longDate(r.dueDate) : "À renseigner"}</p>
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <span className="mt-1.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SELECTED_COLOR }} /><div><p className="text-xs text-zinc-500">Départ</p><p className="font-semibold">{r.origin}</p></div>
        <span className="ml-[4px] h-5 w-px bg-zinc-500" /><span />
        <span className="mt-1.5 h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: SELECTED_COLOR }} /><div><p className="text-xs text-zinc-500">Arrivée</p><p className="font-semibold">{r.destination}</p></div>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-zinc-500">Statut</dt><dd className="font-medium">{statusLabel(r.status)}</dd></div>
        <div><dt className="text-xs text-zinc-500">Navette</dt><dd className="flex items-center gap-1.5 font-medium">{r.shuttleId ? <><Bus size={13} />{shuttleName ?? "…"}</> : "Aucune"}</dd></div>
        <div><dt className="text-xs text-zinc-500">Responsable</dt><dd className="font-medium">{r.assignee || "Non attribué"}</dd></div>
        <div><dt className="text-xs text-zinc-500">Réception</dt><dd className="font-medium">{r.receivedQuantity ?? 0} / {r.quantity} {r.unit}</dd></div>
      </dl>
      {r.notes && <p className="whitespace-pre-wrap rounded-xl bg-[var(--crm-surface-2)] p-3 text-sm">{r.notes}</p>}
      <ArticlePreview materialId={r.materialId} title={r.title} quantity={r.quantity} unit={r.unit} />
      <Button variant="secondary" className="w-full" onClick={onOpenFull}><ExternalLink size={15} />Fiche complète (gestion, historique)</Button>
    </div>
  </aside>;
}
