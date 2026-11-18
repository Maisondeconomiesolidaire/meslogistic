import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Bus, CalendarClock, Check, CheckCheck, ChevronRight, ImageOff, PackageCheck, QrCode, UserRound } from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { FullSpinner } from "./components/ui/Spinner";
import { shortLocation } from "./Demandes";
import { SlotTag } from "./StorageSlot";

const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const errorText = (caught: unknown) => {
  const data = (caught as { data?: unknown })?.data;
  return typeof data === "string" ? data : caught instanceof Error ? caught.message.replace(/^.*Uncaught ConvexError: /s, "").split("\n")[0] : String(caught);
};

/** Thème de Meslogistic (sombre par défaut), hors du shell de l'application. */
function useAppTheme() {
  useEffect(() => {
    const light = localStorage.getItem("meslogistic-theme") === "light";
    const classes = light ? ["crm-light"] : ["dark"];
    document.documentElement.classList.add(...classes);
    document.body.classList.add(...classes);
    return () => { document.documentElement.classList.remove(...classes); document.body.classList.remove(...classes); };
  }, []);
}

/**
 * Page de ramassage, ouverte en scannant le QR code d'une navette : le
 * conducteur coche chaque objet récupéré. Pensée pour le téléphone.
 * Sans identifiant (/scan) : les navettes finalisées à récupérer.
 */
export function ScanPage({ shuttleId }: { shuttleId: string | null }) {
  useAppTheme();
  return <div className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
    {shuttleId ? <Pickup shuttleId={shuttleId} /> : <PickupList />}
  </div>;
}

function Message({ title, text }: { title: string; text: string }) {
  return <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
    <QrCode size={40} className="text-zinc-500" />
    <h1 className="text-xl font-bold">{title}</h1>
    <p className="text-sm text-zinc-400">{text}</p>
    <a href="/scan" className="mt-2 text-sm font-semibold text-brand-500">Voir mes navettes à récupérer</a>
  </div>;
}

function PickupList() {
  const list = useQuery(api.meslogisticShuttles.myPickups, {});
  if (!list) return <FullSpinner label="Chargement…" />;
  return <div className="mx-auto max-w-lg px-4 pb-10 pt-6">
    <h1 className="flex items-center gap-2 text-2xl font-bold"><PackageCheck size={24} className="text-brand-500" />Ramassages</h1>
    <p className="mt-1 text-sm text-zinc-400">Scannez le QR code reçu par e-mail, ou choisissez une navette.</p>
    {list.length === 0 ? <p className="mt-6 rounded-2xl bg-[var(--crm-surface)] p-5 text-sm text-zinc-400">Aucune navette finalisée à récupérer.</p>
      : <ul className="mt-5 space-y-2">{list.map(item => <li key={item._id}>
        <a href={`/scan/${item._id}`} className="flex items-center gap-3 rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)] p-4 active:bg-[var(--crm-surface-2)]">
          <Bus size={20} className="shrink-0 text-brand-500" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{item.name}</span>
            <span className="block text-xs capitalize text-zinc-400">{longDate(item.scheduledDate)}{item.driverName ? ` · ${item.driverName}` : ""}</span>
          </span>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${item.checked === item.total ? "bg-green-500/15 text-green-500" : "bg-amber-500/15 text-amber-500"}`}>{item.checked}/{item.total}</span>
          <ChevronRight size={18} className="shrink-0 text-zinc-500" />
        </a>
      </li>)}</ul>}
  </div>;
}

function Pickup({ shuttleId }: { shuttleId: string }) {
  const data = useQuery(api.meslogisticShuttles.scanShuttle, { shuttleId });
  const check = useMutation(api.meslogisticShuttles.scanCheck);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (!data) return <FullSpinner label="Ouverture de la navette…" />;
  if (data.state === "missing") return <Message title="Navette introuvable" text="Ce QR code ne correspond à aucune navette. Elle a peut-être été supprimée." />;
  if (data.state === "denied") return <Message title="Accès refusé" text="Cette navette ne vous est pas attribuée. Demandez à la logistique de vous l'assigner." />;

  const { shuttle, items, canCheck } = data;
  const open = shuttle.status === "planifiee";
  const editable = canCheck && open;
  const done = items.filter(item => item.loadedAt).length;
  const total = items.length;
  const complete = total > 0 && done === total;

  async function toggle(requestId: Id<"mlRequests"> | undefined, loaded: boolean) {
    setPending(requestId ?? "all"); setError("");
    try { await check({ shuttleId: shuttle._id, requestId, loaded }); }
    catch (caught) { setError(errorText(caught)); }
    finally { setPending(null); }
  }

  return <div className="mx-auto max-w-lg pb-28">
    {/* En-tête fixe : la navette et l'avancement du ramassage. */}
    <header className="sticky top-0 z-10 border-b border-[var(--crm-border)] bg-[var(--crm-surface)]/95 px-4 pb-3 pt-4 backdrop-blur">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-500"><PackageCheck size={14} />Ramassage</p>
      <h1 className="mt-0.5 text-xl font-bold leading-tight">{shuttle.name}</h1>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400">
        <span className="flex items-center gap-1 capitalize"><CalendarClock size={13} />{longDate(shuttle.scheduledDate)}</span>
        {shuttle.driverName && <span className="flex items-center gap-1"><UserRound size={13} />{shuttle.driverName}</span>}
        {shuttle.vehicleName && <span>{shuttle.vehicleName}</span>}
      </p>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--crm-surface-2)]"><div className={`h-full rounded-full transition-all ${complete ? "bg-green-500" : "bg-brand-500"}`} style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
        <span className={`text-sm font-bold tabular-nums ${complete ? "text-green-500" : ""}`}>{done}/{total}</span>
      </div>
    </header>

    {!open && <p className="mx-4 mt-4 rounded-2xl bg-sky-500/15 p-3 text-sm font-semibold text-sky-400">{shuttle.status === "en_route" ? "La navette est partie : le ramassage est clos." : "Navette terminée."}</p>}
    {open && !canCheck && <p className="mx-4 mt-4 rounded-2xl bg-[var(--crm-surface-2)] p-3 text-sm text-zinc-400">Lecture seule : seuls le conducteur et la logistique peuvent cocher les objets.</p>}
    {error && <p role="alert" className="mx-4 mt-4 rounded-2xl bg-red-500/15 p-3 text-sm font-semibold text-red-500">{error}</p>}
    {complete && open && <p className="mx-4 mt-4 flex items-center gap-2 rounded-2xl bg-green-500/15 p-3 text-sm font-semibold text-green-500"><CheckCheck size={18} />Tout est récupéré. Bonne route !</p>}

    {total === 0 ? <p className="m-4 rounded-2xl bg-[var(--crm-surface)] p-5 text-sm text-zinc-400">Aucun objet à récupérer dans cette navette.</p>
      : <ul className="space-y-2 p-4">{items.map(item => {
        const checked = Boolean(item.loadedAt);
        return <li key={item._id}>
          <button type="button" disabled={!editable || pending !== null} onClick={() => void toggle(item._id, !checked)} aria-pressed={checked}
            className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors disabled:cursor-default ${checked ? "border-green-500 bg-green-500/10" : "border-[var(--crm-border)] bg-[var(--crm-surface)] active:bg-[var(--crm-surface-2)]"} ${pending === item._id ? "opacity-60" : ""}`}>
            {item.photoUrl ? <img src={item.photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
              : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[var(--crm-surface-2)] text-zinc-500"><ImageOff size={20} /></span>}
            <span className="min-w-0 flex-1">
              <span className="block font-semibold leading-snug">{item.title}</span>
              <span className="block text-sm font-bold text-brand-500">{item.quantity} {item.unit}</span>
              <span className="mt-0.5 flex items-center gap-1 text-xs text-zinc-400">{shortLocation(item.origin)}<ArrowRight size={11} />{shortLocation(item.destination)}</span>
              {item.storageSlot && <span className="mt-1 flex"><SlotTag slot={item.storageSlot} /></span>}
              {item.notes && <span className="mt-1 block text-xs italic text-zinc-400">{item.notes}</span>}
              {checked && item.loadedBy && <span className="mt-1 block text-[11px] text-green-500">Récupéré par {item.loadedBy}</span>}
            </span>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${checked ? "border-green-500 bg-green-500 text-white" : "border-zinc-500 text-transparent"}`}><Check size={20} strokeWidth={3} /></span>
          </button>
        </li>;
      })}</ul>}

    {editable && total > 0 && <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--crm-border)] bg-[var(--crm-surface)]/95 p-3 backdrop-blur" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      <div className="mx-auto max-w-lg">
        {complete ? <button type="button" disabled={pending !== null} onClick={() => void toggle(undefined, false)} className="h-12 w-full rounded-2xl border border-[var(--crm-border)] text-sm font-semibold text-zinc-400">Tout décocher</button>
          : <button type="button" disabled={pending !== null} onClick={() => { if (window.confirm(`Confirmer que les ${total - done} objet${total - done > 1 ? "s" : ""} restant${total - done > 1 ? "s sont récupérés" : " est récupéré"} ?`)) void toggle(undefined, true); }} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-base font-bold text-white active:bg-brand-700"><CheckCheck size={18} />Tout est récupéré ({total - done} restant{total - done > 1 ? "s" : ""})</button>}
      </div>
    </div>}
  </div>;
}
