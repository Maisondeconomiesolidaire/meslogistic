import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Flag, ImageOff, MapPin, Recycle, X } from "lucide-react";
import type { Collecte } from "./LogisticsMap";

const time = (date: Date) => date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const day = (date: Date) => date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

/**
 * Deuxième carte flottante pour une collecte Recycapp : l'essentiel d'abord
 * (collecte, départ, arrivée), en en-tête fixe ; en dessous, les photos
 * envoyées par le client défilent et s'ouvrent en grand.
 */
export function CollecteCard({ collecte, className, onClose }: { collecte: Collecte; className: string; onClose: () => void }) {
  const [viewer, setViewer] = useState<number | null>(null);
  const date = new Date(collecte.date);
  const firstStop = collecte.stops[0];
  const when = firstStop?.time ? `${day(date)} · ${time(new Date(firstStop.time))}` : day(date);
  const arrival = collecte.stops.length > 1 ? collecte.stops.map(stop => stop.address).join(" · ") : firstStop?.address ?? "Adresse non renseignée";

  return <section aria-label="Collecte" className={className}>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {/* En-tête fixe : on garde l'essentiel sous les yeux en faisant défiler les photos. */}
      <div className="sticky top-0 z-10 border-b border-[var(--crm-border)] bg-[var(--crm-surface)] px-4 py-3">
        <div className="flex items-start gap-2">
          <p className="flex min-w-0 flex-1 items-center gap-2 text-lg font-bold"><Recycle size={18} className="shrink-0 text-brand-500" />Collecte
            <span className="rounded-full bg-[var(--crm-surface-2)] px-2.5 py-0.5 text-xs font-semibold capitalize text-zinc-400">{collecte.status === "en_cours" ? "En cours" : "À venir"}</span></p>
          <button type="button" onClick={onClose} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-zinc-400 hover:bg-[var(--crm-surface-2)] hover:text-zinc-100"><X size={16} />Fermer</button>
        </div>
        <p className="mt-0.5 text-xs capitalize text-zinc-400">{when}</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex gap-2.5"><dt className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white" title="Départ"><Flag size={12} /></dt>
            <dd className="min-w-0"><span className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Départ</span><span className="font-semibold">{collecte.depotName}</span></dd></div>
          <div className="flex gap-2.5"><dt className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white" title="Arrivée"><MapPin size={12} /></dt>
            <dd className="min-w-0"><span className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Arrivée</span><span className="font-semibold">{arrival}</span></dd></div>
        </dl>
      </div>

      <div className="p-3">
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Photos du client · {collecte.photos.length}</p>
        {collecte.photos.length === 0 ? <p className="flex items-center gap-2 rounded-xl bg-[var(--crm-surface-2)] p-4 text-sm text-zinc-500"><ImageOff size={16} />Aucune photo envoyée.</p>
          : <ul className="grid grid-cols-2 gap-2">{collecte.photos.map((url, index) => <li key={url}>
            <button type="button" onClick={() => setViewer(index)} className="block aspect-square w-full overflow-hidden rounded-xl bg-[var(--crm-surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={`Ouvrir la photo ${index + 1}`}>
              <img src={url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform hover:scale-105" />
            </button>
          </li>)}</ul>}
      </div>
    </div>
    {viewer !== null && <PhotoViewer photos={collecte.photos} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />}
  </section>;
}

/** Photo en grand : flèches (ou clavier) pour passer de l'une à l'autre, Échap pour fermer. */
function PhotoViewer({ photos, index, onIndex, onClose }: { photos: string[]; index: number; onIndex: (index: number) => void; onClose: () => void }) {
  const go = (step: number) => onIndex((index + step + photos.length) % photos.length);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onIndex((index + 1) % photos.length);
      if (event.key === "ArrowLeft") onIndex((index - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onClose, onIndex]);
  return <div role="dialog" aria-modal="true" aria-label="Photo de la collecte" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
    <img src={photos[index]} alt="" className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" onClick={event => event.stopPropagation()} />
    <button type="button" onClick={onClose} aria-label="Fermer" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><X size={20} /></button>
    {photos.length > 1 && <>
      <button type="button" onClick={event => { event.stopPropagation(); go(-1); }} aria-label="Photo précédente" className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><ChevronLeft size={24} /></button>
      <button type="button" onClick={event => { event.stopPropagation(); go(1); }} aria-label="Photo suivante" className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><ChevronRight size={24} /></button>
      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-sm text-white">{index + 1} / {photos.length}</p>
    </>}
  </div>;
}
