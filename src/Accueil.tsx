import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ArrowLeft, ArrowRight, Bus, CalendarClock, Check, ChevronLeft, ChevronRight, ClipboardCheck, ExternalLink, GripVertical, MapPin, PackageCheck, Plus, Printer, Search, Trash2, Truck, Undo2, X } from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { Thumb, TRANSIT_COLOR, shortDate } from "./components/crm/LogisticsCard";
import { Button } from "./components/ui/Button";
import { Drawer } from "./components/ui/Drawer";
import { FullSpinner } from "./components/ui/Spinner";
import { shortLocation, statusLabel, type Request } from "./Demandes";
import { SlotTag } from "./StorageSlot";
import { ArticlePreview, RequestDetail } from "./RequestDetail";
import { CARD_COLOR, NewShuttle, STATUS, Stops, errorText, stopsOf, type Shuttle } from "./ShuttleBoard";
import { today } from "./TransferPlanning";
import { LogisticsMap, SELECTED_COLOR, locate } from "./LogisticsMap";
import { suggestOnRoute, type NavPlan, type RouteSuggestion } from "./shuttleRoute";
import { printShuttle } from "./shuttlePrint";

type Status = Shuttle["status"];
/** Libellés de la page d'accueil, comme sur le kanban des navettes. */
const SHUTTLE_LABEL: Record<Status, string> = { planifiee: "Nouveau", en_route: "En transit", terminee: "Terminée" };
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
  const [openShuttleId, setOpenShuttleId] = useState<string | null>(null);
  const [navPlan, setNavPlan] = useState<NavPlan | null>(null);
  const onPlace = useCallback((next: string | null) => setPlace(next), []);

  const active = useMemo(() => (requests ?? [])
    .filter(request => request.status === "a_preparer" || request.status === "en_transit")
    .sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") || a.createdAt - b.createdAt), [requests]);
  // Liste de gauche : seulement les objets pas encore affectés à une navette.
  // Un lieu choisi sur la carte ne garde que les objets qui s'y trouvent.
  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("fr-FR");
    return active.filter(request => !request.shuttleId
      && (!place || (request.status === "a_preparer" && shortLocation(request.origin) === place))
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
        <LogisticsMap requests={active} selected={selected} place={place} onPlace={onPlace} isDark={isDark} shuttle={board.shuttles.find(shuttle => shuttle._id === openShuttleId) ?? null} onPlan={setNavPlan} />
      </section>
      <ShuttleSection shuttles={board.shuttles} openId={openShuttleId} setOpenId={setOpenShuttleId} dragging={dragging} canCreate={canCreate} canUpdate={canUpdate} onSelectRequest={id => setSelectedId(id)} selectedId={selectedId} navPlan={navPlan} candidates={active.filter(request => request.status === "a_preparer" && !request.shuttleId)} />
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
      {r.storageSlot && <span className="mt-1 flex"><SlotTag slot={r.storageSlot} /></span>}
      <span className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="flex min-w-0 items-center gap-1.5 truncate font-semibold" style={{ color: state.color }}><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: state.color }} /><span className="truncate">{state.label}</span></span>
        <span className={`shrink-0 tabular-nums ${late ? "font-bold text-red-500" : soon ? "font-semibold text-amber-500" : "text-zinc-500"}`}>{r.dueDate ? `${late ? "en retard · " : ""}${shortDate(r.dueDate)}` : "sans échéance"}</span>
      </span>
    </span>
  </button>;
}

/** Date locale au format AAAA-MM-JJ. */
const isoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parseDay = (iso: string) => new Date(`${iso}T12:00:00`);
const addDays = (iso: string, days: number) => { const date = parseDay(iso); date.setDate(date.getDate() + days); return isoDay(date); };
/** Lundi de la semaine du jour donné. */
const mondayOf = (iso: string) => addDays(iso, -((parseDay(iso).getDay() + 6) % 7));
const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
type View = "mois" | "semaine" | "jour";
const VIEWS: { key: View; label: string }[] = [{ key: "mois", label: "Mois" }, { key: "semaine", label: "Semaine" }, { key: "jour", label: "Jour" }];

/** Jours affichés : la journée, la semaine (lundi → dimanche) ou le mois en semaines complètes. */
function periodDays(view: View, cursor: string) {
  if (view === "jour") return [cursor];
  if (view === "semaine") return Array.from({ length: 7 }, (_, index) => addDays(mondayOf(cursor), index));
  const start = parseDay(`${cursor.slice(0, 7)}-01`);
  const lead = (start.getDay() + 6) % 7;
  const length = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const first = addDays(isoDay(start), -lead);
  return Array.from({ length: Math.ceil((lead + length) / 7) * 7 }, (_, index) => addDays(first, index));
}

/** Section du bas : le calendrier des navettes, ou la navette ouverte (même emplacement). */
function ShuttleSection({ shuttles, openId, setOpenId, dragging, canCreate, canUpdate, onSelectRequest, selectedId, navPlan, candidates }: {
  shuttles: Shuttle[]; openId: string | null; setOpenId: (id: string | null) => void; dragging: string | null; canCreate: boolean; canUpdate: boolean; onSelectRequest: (id: string) => void; selectedId: string | null; navPlan: NavPlan | null; candidates: Request[];
}) {
  const addRequests = useMutation(api.meslogisticShuttles.addRequests);
  const [view, setView] = useState<View>("semaine");
  const [returnView, setReturnView] = useState<View | null>(null);
  const [cursor, setCursor] = useState(() => isoDay(new Date()));
  const [creating, setCreating] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [error, setError] = useState("");
  const open = shuttles.find(shuttle => shuttle._id === openId);
  const todayIso = isoDay(new Date());

  const byDay = useMemo(() => {
    const map = new Map<string, Shuttle[]>();
    for (const shuttle of shuttles) map.set(shuttle.scheduledDate, [...(map.get(shuttle.scheduledDate) ?? []), shuttle]);
    const rank: Record<Status, number> = { en_route: 0, planifiee: 1, terminee: 2 };
    for (const list of map.values()) list.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name, "fr"));
    return map;
  }, [shuttles]);

  async function drop(shuttle: Shuttle, event: DragEvent) {
    event.preventDefault(); event.stopPropagation(); setDropTarget(null);
    const requestId = event.dataTransfer.getData(DRAG_TYPE);
    if (!requestId || shuttle.status !== "planifiee") return;
    setError("");
    try { await addRequests({ shuttleId: shuttle._id, requestIds: [requestId as Id<"mlRequests">] }); } catch (caught) { setError(errorText(caught)); }
  }
  const dropProps = (shuttle: Shuttle) => shuttle.status === "planifiee" && canUpdate ? {
    onDragOver: (event: DragEvent) => { if (!event.dataTransfer.types.includes(DRAG_TYPE)) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; setDropTarget(shuttle._id); },
    onDragLeave: () => setDropTarget(current => current === shuttle._id ? null : current),
    onDrop: (event: DragEvent) => void drop(shuttle, event),
  } : {};

  const days = periodDays(view, cursor);
  const title = view === "mois" ? parseDay(`${cursor.slice(0, 7)}-01`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : view === "semaine" ? `${parseDay(days[0]).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – ${parseDay(days[6]).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`
    : longDate(cursor);
  const shift = (direction: number) => setCursor(current => {
    if (view === "jour") return addDays(current, direction);
    if (view === "semaine") return addDays(current, 7 * direction);
    const date = parseDay(`${current.slice(0, 7)}-01`); date.setMonth(date.getMonth() + direction); return isoDay(date);
  });
  const openDay = (day: string) => { setReturnView(view); setCursor(day); setView("jour"); };

  const chip = (shuttle: Shuttle, large: boolean) => {
    const target = dropTarget === shuttle._id;
    const droppable = Boolean(dragging) && shuttle.status === "planifiee" && canUpdate;
    return <button key={shuttle._id} type="button" {...dropProps(shuttle)} onClick={event => { event.stopPropagation(); setOpenId(shuttle._id); }} title={`${shuttle.name} · ${SHUTTLE_LABEL[shuttle.status]} · ${objets(shuttle.transits.length)}`}
      className={`flex w-full min-w-0 shrink-0 items-center gap-1.5 rounded-md text-left font-semibold text-zinc-950 ${large ? "px-2.5 py-1.5 text-xs" : "px-1.5 py-0.5 text-[11px]"} ${target ? "ring-2 ring-white" : droppable ? "ring-2 ring-brand-500" : "hover:brightness-110"}`}
      style={{ backgroundColor: CARD_COLOR[shuttle.status] }}>
      <span className="min-w-0 flex-1 truncate">{shuttle.name}</span><span className="shrink-0 tabular-nums opacity-70">{shuttle.transits.length}</span>
    </button>;
  };

  return <section aria-label="Navettes" className="flex min-h-[340px] flex-[2] flex-col overflow-hidden rounded-3xl border border-[var(--crm-border)] bg-[var(--crm-surface)]">
    {error && <p role="alert" className="flex shrink-0 items-center justify-between gap-2 bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}<button type="button" onClick={() => setError("")} aria-label="Fermer"><X size={14} /></button></p>}
    {open ? <ShuttleInline shuttle={open} canUpdate={canUpdate} dragging={dragging} dropActive={dropTarget === open._id} dropProps={dropProps(open)} onBack={() => setOpenId(null)} onSelectRequest={onSelectRequest} selectedId={selectedId} onError={setError} navPlan={navPlan} candidates={candidates} /> : <>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--crm-border)] px-4 py-2.5">
        {view === "jour" && returnView && <button type="button" onClick={() => { setView(returnView); setReturnView(null); }} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-zinc-400 hover:bg-[var(--crm-surface-2)] hover:text-zinc-100"><ArrowLeft size={16} />{returnView === "mois" ? "Mois" : "Semaine"}</button>}
        <h2 className="mr-1 text-lg font-bold">Navettes</h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} aria-label="Période précédente" className="rounded-lg p-1.5 text-zinc-400 hover:bg-[var(--crm-surface-2)] hover:text-zinc-100"><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => setCursor(todayIso)} className="rounded-lg border border-[var(--crm-border)] px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:bg-[var(--crm-surface-2)]">Aujourd’hui</button>
          <button type="button" onClick={() => shift(1)} aria-label="Période suivante" className="rounded-lg p-1.5 text-zinc-400 hover:bg-[var(--crm-surface-2)] hover:text-zinc-100"><ChevronRight size={18} /></button>
        </div>
        <p className="text-sm font-semibold capitalize">{title}</p>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-full bg-[var(--crm-surface-2)] p-0.5 text-xs font-semibold">{VIEWS.map(item => <button key={item.key} type="button" onClick={() => { setReturnView(null); setView(item.key); }} className={`rounded-full px-3 py-1 transition-colors ${view === item.key ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-100"}`}>{item.label}</button>)}</div>
          {canCreate && <Button size="sm" onClick={() => setCreating(true)}><Plus size={15} />Nouvelle navette</Button>}
        </div>
      </div>
      {dragging && <p className="shrink-0 bg-brand-500/10 px-4 py-1 text-xs font-semibold text-brand-500">Déposez la demande sur une navette « Nouveau » (encadrée).</p>}

      {view === "jour" ? <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {(byDay.get(cursor) ?? []).length === 0 ? <p className="p-3 text-sm text-zinc-500">Aucune navette prévue ce jour.</p> :
          <ul className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">{(byDay.get(cursor) ?? []).map(shuttle => {
            const loaded = shuttle.transits.filter(row => row.loadedAt).length;
            const target = dropTarget === shuttle._id;
            const droppable = Boolean(dragging) && shuttle.status === "planifiee" && canUpdate;
            return <li key={shuttle._id}><button type="button" {...dropProps(shuttle)} onClick={() => setOpenId(shuttle._id)} className={`w-full rounded-2xl border p-3 text-left text-sm transition-colors ${target ? "border-brand-500 bg-brand-500/20" : droppable ? "border-brand-500/60 bg-brand-500/5" : "border-[var(--crm-border)] hover:bg-[var(--crm-surface-2)]"}`}>
              <span className="flex items-center justify-between gap-2"><span className="truncate font-bold">{shuttle.name}</span><span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS[shuttle.status].color }} />{SHUTTLE_LABEL[shuttle.status]}</span></span>
              <span className="mt-1 block text-xs text-zinc-400">{shuttle.origin ? `Départ : ${shortLocation(shuttle.origin)}` : "Départ non renseigné"}</span>
              <Stops stops={stopsOf(shuttle.transits)} className="mt-1 text-xs font-semibold text-zinc-300" />
              <span className="mt-2 flex items-center gap-2"><span className="flex -space-x-2">{shuttle.transits.slice(0, 5).map(row => <Thumb key={row._id} src={row.photoUrl} size={28} className="rounded-lg bg-[var(--crm-surface-3)] ring-2 ring-[var(--crm-surface)]" />)}</span><span className="text-xs text-zinc-400">{objets(shuttle.transits.length)}{shuttle.status === "planifiee" && shuttle.transits.length ? ` · ${loaded} chargé${loaded > 1 ? "s" : ""}` : ""}</span></span>
            </button></li>;
          })}</ul>}
      </div> : <div className="flex min-h-0 flex-1 flex-col p-2">
        <div className="grid shrink-0 grid-cols-7 pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{WEEKDAYS.map((day, index) => <span key={day}>{view === "semaine" ? `${day} ${parseDay(days[index]).getDate()}` : day}</span>)}</div>
        <div className="grid min-h-0 flex-1 grid-cols-7 gap-1" style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(0, 1fr))` }}>
          {days.map(day => {
            const list = byDay.get(day) ?? [];
            const outside = view === "mois" && day.slice(0, 7) !== cursor.slice(0, 7);
            const max = view === "semaine" ? 8 : 2;
            return <div key={day} role="button" tabIndex={0} onClick={() => openDay(day)} onKeyDown={event => { if (event.key === "Enter") openDay(day); }} title="Voir les navettes du jour"
              className={`flex min-h-0 cursor-pointer flex-col gap-0.5 overflow-hidden rounded-lg border p-1 transition-colors hover:bg-[var(--crm-surface-2)] ${day === todayIso ? "border-brand-500" : "border-[var(--crm-border)]"} ${outside ? "opacity-40" : ""}`}>
              {view === "mois" && <span className={`shrink-0 self-end px-1.5 text-[11px] font-semibold tabular-nums ${day === todayIso ? "rounded-full bg-brand-500 text-white" : "text-zinc-400"}`}>{parseDay(day).getDate()}</span>}
              {list.slice(0, max).map(shuttle => chip(shuttle, view === "semaine"))}
              {list.length > max && <span className="shrink-0 px-1 text-[10px] font-semibold text-zinc-400">+{list.length - max} autre{list.length - max > 1 ? "s" : ""}</span>}
            </div>;
          })}
        </div>
      </div>}
    </>}
    {creating && <NewShuttle onClose={() => setCreating(false)} onCreated={id => { setCreating(false); setOpenId(id); }} />}
  </section>;
}

function ShuttleInline({ shuttle, canUpdate, dragging, dropActive, dropProps, onBack, onSelectRequest, selectedId, onError, navPlan, candidates }: {
  shuttle: Shuttle; canUpdate: boolean; dragging: string | null; dropActive: boolean; dropProps: Record<string, unknown>;
  onBack: () => void; onSelectRequest: (id: string) => void; selectedId: string | null; onError: (message: string) => void; navPlan: NavPlan | null; candidates: Request[];
}) {
  const removeRequest = useMutation(api.meslogisticShuttles.removeRequest);
  const setLoaded = useMutation(api.meslogisticShuttles.setLoaded);
  const depart = useMutation(api.meslogisticShuttles.departShuttle);
  const deliver = useMutation(api.meslogisticShuttles.deliverShuttle);
  const deleteShuttle = useMutation(api.meslogisticShuttles.deleteShuttle);
  const cancelDeparture = useMutation(api.meslogisticShuttles.cancelDeparture);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const planned = shuttle.status === "planifiee";
  const loaded = shuttle.transits.filter(row => row.loadedAt).length;
  const total = shuttle.transits.length;
  async function run(action: () => Promise<unknown>) {
    setBusy(true); onError("");
    try { await action(); } catch (caught) { onError(errorText(caught)); } finally { setBusy(false); }
  }
  let actions: ReactNode = null;
  const loadedRows = shuttle.transits.filter(row => row.loadedAt);
  const leftRows = shuttle.transits.filter(row => !row.loadedAt);
  if (canUpdate && planned) actions = <>
    {total > 0 && loaded < total && <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirm({
      title: "Les produits ont bien été chargés ?", confirmLabel: "Oui, tout est chargé", icon: <Check size={15} />,
      body: <><p>Confirmez que les {objets(total)} de « {shuttle.name} » sont bien dans le véhicule.</p><ObjectList rows={shuttle.transits} /></>,
      action: () => setLoaded({ shuttleId: shuttle._id, loaded: true }),
    })}><Check size={14} />Tout est chargé</Button>}
    <Button size="sm" disabled={busy || loaded === 0} onClick={() => setConfirm({
      title: "Les produits ont bien été chargés ?", confirmLabel: "Oui, départ", icon: <Truck size={15} />,
      body: <>
        <p>{objets(loadedRows.length)} chargé{loadedRows.length > 1 ? "s" : ""} partira en transit avec « {shuttle.name} ».</p>
        <ObjectList rows={loadedRows} />
        {leftRows.length > 0 && <><p className="mt-3 font-semibold text-amber-500">{objets(leftRows.length)} non chargé{leftRows.length > 1 ? "s" : ""} ne partira pas et reviendra dans la liste à planifier :</p><ObjectList rows={leftRows} /></>}
      </>,
      action: () => depart({ shuttleId: shuttle._id }),
    })}><Truck size={14} />Départ</Button>
  </>;
  if (canUpdate && shuttle.status === "en_route") actions = <>
    <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirm({
      title: "Annuler le transit ?", confirmLabel: "Annuler le transit", icon: <Undo2 size={15} />, danger: true,
      body: <p>« {shuttle.name} » redevient « Nouveau » : ses objets ne sont plus en transit mais restent chargés dans la navette. Vous pourrez la relancer avec « Départ ».</p>,
      action: () => cancelDeparture({ shuttleId: shuttle._id }),
    })}><Undo2 size={14} />Annuler le transit</Button>
    <Button size="sm" disabled={busy} onClick={() => void run(() => deliver({ shuttleId: shuttle._id }))}><PackageCheck size={14} />Arrivée</Button>
  </>;

  return <div {...dropProps} className={`flex min-h-0 flex-1 flex-col transition-colors ${dropActive ? "bg-brand-500/10" : ""}`}>
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--crm-border)] px-4 py-3">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-zinc-400 hover:bg-[var(--crm-surface-2)] hover:text-zinc-100"><ArrowLeft size={16} />Navettes</button>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-lg font-bold"><Bus size={18} />{shuttle.name}<span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-zinc-950" style={{ backgroundColor: STATUS[shuttle.status].color }}>{SHUTTLE_LABEL[shuttle.status]}</span></p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400"><span className="flex items-center gap-1 capitalize"><CalendarClock size={13} />{longDate(shuttle.scheduledDate)}</span>{shuttle.origin && <span className="flex items-center gap-1"><MapPin size={13} />{shortLocation(shuttle.origin)}{shuttle.destination ? <><ArrowRight size={12} />{shortLocation(shuttle.destination)}</> : null}</span>}<Stops stops={stopsOf(shuttle.transits)} className="font-semibold text-zinc-300" /></p>
      </div>
      {planned && total > 0 && <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${loaded === total ? "bg-green-500/15 text-green-500" : "bg-amber-500/15 text-amber-500"}`}><ClipboardCheck size={14} />{loaded}/{objets(total)} chargé{loaded > 1 ? "s" : ""}</span>}
      <div className="ml-auto flex flex-wrap gap-2">
        {actions}
        <Button size="sm" variant="secondary" onClick={() => printShuttle(shuttle, navPlan)} title="Feuille de route : départ, arrêts, arrivée et objets"><Printer size={14} />Imprimer</Button>
        {canUpdate && planned && <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirm({
          title: "Supprimer la navette ?", confirmLabel: "Supprimer", icon: <Trash2 size={15} />, danger: true,
          body: <p>« {shuttle.name} » sera supprimée. {total ? `Ses ${objets(total)} reviendront dans la liste à planifier.` : ""}</p>,
          action: () => deleteShuttle({ shuttleId: shuttle._id }).then(onBack),
        })}><Trash2 size={14} />Supprimer</Button>}
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-auto p-3">
      {planned && <OnRoute shuttle={shuttle} candidates={candidates} canUpdate={canUpdate} onSelectRequest={onSelectRequest} onError={onError} />}
      {planned && canUpdate && <div className={`mb-3 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-sm font-semibold transition-colors ${dropActive ? "border-brand-500 bg-brand-500/15 text-brand-500" : dragging ? "border-brand-500/60 text-brand-500" : "border-[var(--crm-border)] text-zinc-500"}`}><GripVertical size={16} />Glissez ici des demandes de la liste de gauche</div>}
      {total === 0 ? <p className="p-3 text-sm text-zinc-500">Aucun objet dans cette navette.</p> :
        <ul className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">{shuttle.transits.map(row => {
          const late = planned && row.dueDate && row.dueDate < shuttle.scheduledDate;
          return <li key={row._id} className={`flex items-center gap-3 rounded-2xl border p-2.5 text-sm ${row._id === selectedId ? "border-transparent ring-2" : "border-[var(--crm-border)]"}`} style={row._id === selectedId ? { ["--tw-ring-color" as string]: SELECTED_COLOR } : undefined}>
            <button type="button" onClick={() => onSelectRequest(row._id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <Thumb src={row.photoUrl} size={44} className="bg-[var(--crm-surface-3)]" />
              <span className="min-w-0"><span className="block truncate font-semibold">{row.quantity} {row.unit} · {row.title}</span>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-zinc-400">{shortLocation(row.origin)}<ArrowRight size={11} />{shortLocation(row.destination)}{row.dueDate && <span className={late ? "ml-1 font-semibold text-amber-500" : "ml-1 text-zinc-500"}>· {shortDate(row.dueDate)}</span>}{late && <AlertTriangle size={12} className="text-amber-500" />}</span>{row.storageSlot && <span className="mt-1 flex"><SlotTag slot={row.storageSlot} /></span>}</span>
            </button>
            <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
              {planned && row.status === "a_preparer" ? <label className={`flex items-center gap-1.5 font-semibold ${row.loadedAt ? "text-green-500" : "text-amber-500"}`}><input type="checkbox" disabled={!canUpdate || busy} checked={Boolean(row.loadedAt)} onChange={event => void run(() => setLoaded({ shuttleId: shuttle._id, requestId: row._id, loaded: event.target.checked }))} />{row.loadedAt ? "Chargé" : "À charger"}</label>
                : <span className={row.status === "receptionnee" ? "font-semibold text-green-500" : "font-semibold"} style={row.status === "en_transit" ? { color: TRANSIT_COLOR } : undefined}>{row.status === "receptionnee" ? "Arrivé" : row.status === "en_transit" ? "En transit" : statusLabel(row.status)}</span>}
              {canUpdate && planned && <button type="button" disabled={busy} onClick={() => void run(() => removeRequest({ requestId: row._id }))} className="flex items-center gap-1 text-zinc-500 hover:text-red-500"><X size={12} />Retirer</button>}
            </span>
          </li>;
        })}</ul>}
    </div>
    {confirm && <Drawer open onClose={() => !busy && setConfirm(null)} variant="modal" title={confirm.title} panelClassName="max-w-lg">
      <div className="space-y-4 py-4 text-sm">
        <div>{confirm.body}</div>
        <div className="flex flex-wrap gap-2">
          <Button variant={confirm.danger ? "danger" : "primary"} disabled={busy} autoFocus onClick={() => { const current = confirm; void run(current.action).then(() => setConfirm(null)); }}>{confirm.icon}{busy ? "En cours…" : confirm.confirmLabel}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>Non, revenir</Button>
        </div>
      </div>
    </Drawer>}
  </div>;
}

type Confirm = { title: string; body: ReactNode; confirmLabel: string; icon: ReactNode; danger?: boolean; action: () => Promise<unknown> };

/** Liste compacte des objets (photo, quantité, trajet) dans une confirmation. */
function ObjectList({ rows }: { rows: Shuttle["transits"] }) {
  if (!rows.length) return null;
  return <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">{rows.map(row => <li key={row._id} className="flex items-center gap-2.5 rounded-xl bg-[var(--crm-surface-2)] p-2">
    <Thumb src={row.photoUrl} size={36} className="bg-[var(--crm-surface-3)]" />
    <span className="min-w-0"><span className="block truncate font-semibold">{row.quantity} {row.unit} · {row.title}</span><span className="flex items-center gap-1 text-xs text-zinc-500">{shortLocation(row.origin)}<ArrowRight size={11} />{shortLocation(row.destination)}</span></span>
  </li>)}</ul>;
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
        {r.storageSlot && <div className="col-span-2"><dt className="text-xs text-zinc-500">Emplacement{r.storageSlot.depot ? ` · ${shortLocation(r.storageSlot.depot)}` : ""}</dt><dd className="mt-0.5"><SlotTag slot={r.storageSlot} className="text-xs" /></dd></div>}
      </dl>
      {r.notes && <p className="whitespace-pre-wrap rounded-xl bg-[var(--crm-surface-2)] p-3 text-sm">{r.notes}</p>}
      <ArticlePreview materialId={r.materialId} title={r.title} quantity={r.quantity} unit={r.unit} />
      <Button variant="secondary" className="w-full" onClick={onOpenFull}><ExternalLink size={15} />Fiche complète (gestion, historique)</Button>
    </div>
  </aside>;
}

const minutes = (seconds: number) => { const value = Math.round(seconds / 60); return value < 60 ? `${value} min` : `${Math.floor(value / 60)} h ${String(value % 60).padStart(2, "0")}`; };

/**
 * « Sur ce trajet » : les demandes à planifier dont le chargement et la
 * livraison tiennent sur le trajet départ → arrivée de la navette, avec le
 * détour en temps de route Mapbox.
 */
function OnRoute({ shuttle, candidates, canUpdate, onSelectRequest, onError }: { shuttle: Shuttle; candidates: Request[]; canUpdate: boolean; onSelectRequest: (id: string) => void; onError: (message: string) => void }) {
  const addRequests = useMutation(api.meslogisticShuttles.addRequests);
  const [result, setResult] = useState<{ base: number; suggestions: RouteSuggestion<Request>[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const key = `${shuttle.origin}|${shuttle.destination}|${candidates.map(request => `${request._id}:${request.origin}>${request.destination}`).join(",")}`;
  useEffect(() => {
    if (!shuttle.origin || !shuttle.destination) { setResult(null); return; }
    let cancelled = false;
    setLoading(true); setFailure("");
    suggestOnRoute(shuttle.origin, shuttle.destination, candidates, locate)
      .then(value => { if (!cancelled) setResult(value); })
      .catch((caught: unknown) => { if (!cancelled) setFailure(caught instanceof Error ? caught.message : "Suggestions indisponibles."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!shuttle.destination) return <p className="mb-3 rounded-2xl bg-[var(--crm-surface-2)] p-3 text-xs text-zinc-500">Renseignez le lieu d’arrivée de la navette (page Navettes, « Modifier ») pour voir les objets à prendre sur le trajet.</p>;
  async function add(request: Request) {
    setBusy(request._id); onError("");
    try { await addRequests({ shuttleId: shuttle._id, requestIds: [request._id as Id<"mlRequests">] }); } catch (caught) { onError(errorText(caught)); } finally { setBusy(null); }
  }
  const list = result?.suggestions ?? [];
  return <section className="mb-3 rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface-2)] p-3">
    <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold">Sur ce trajet<span className="text-xs font-normal text-zinc-500">{shortLocation(shuttle.origin ?? "")} → {shortLocation(shuttle.destination)}{result ? ` · ${minutes(result.base)} en direct` : ""}</span></p>
    {loading ? <p className="mt-2 text-xs text-zinc-500">Calcul des trajets…</p>
      : failure ? <p className="mt-2 text-xs text-red-500">{failure}</p>
        : list.length === 0 ? <p className="mt-2 text-xs text-zinc-500">Aucun objet à planifier sur ce trajet.</p>
          : <ul className="mt-2 grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">{list.map(({ item: request, detourSeconds }) => <li key={request._id} className="flex items-center gap-2.5 rounded-xl border border-[var(--crm-border)] bg-[var(--crm-surface)] p-2 text-sm">
            <button type="button" onClick={() => onSelectRequest(request._id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
              <Thumb src={request.photoUrl} size={40} className="bg-[var(--crm-surface-3)]" />
              <span className="min-w-0"><span className="block truncate font-semibold">{request.quantity} {request.unit} · {request.title}</span>
                <span className="flex items-center gap-1 text-xs text-zinc-400">{shortLocation(request.origin)}<ArrowRight size={11} />{shortLocation(request.destination)}</span>
                <span className={`text-[11px] font-semibold ${detourSeconds < 120 ? "text-green-500" : "text-amber-500"}`}>{detourSeconds < 120 ? "Sans détour" : `+${minutes(detourSeconds)} de détour`}{request.dueDate ? ` · échéance ${shortDate(request.dueDate)}` : ""}</span></span>
            </button>
            {canUpdate && <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void add(request)}><Plus size={14} />{busy === request._id ? "…" : "Ajouter"}</Button>}
          </li>)}</ul>}
  </section>;
}
