import type { ReactNode } from "react";
import { Package } from "lucide-react";

/** Orange : le lot doit être déplacé vers un autre lieu. Bleu : retrait sur le lieu de stockage. */
export const TRANSIT_COLOR = "#ff914d";
export const ON_SITE_COLOR = "#8ec5ff";

/** « 29/10/26 », comme sur les cartes logistiques partagées avec Meslogistic. */
export function shortDate(value: number | string) {
  const date = typeof value === "string" ? new Date(`${value}T12:00:00`) : new Date(value);
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/**
 * Carte « source · client · produit · départ → arrivée · échéance ».
 * Même dessin dans Bâtire et Meslogistic pour qu'un lot se reconnaisse d'une app à l'autre.
 */
/** Miniature d'un objet (icône si l'article n'a pas de photo). */
export function Thumb({ src, size = 52, className = "" }: { src?: string | null; size?: number; className?: string }) {
  return <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black/10 ${className}`} style={{ width: size, height: size }}>
    {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Package size={Math.round(size * 0.42)} className="opacity-50" />}
  </span>;
}

export function LogisticsCard({ source, date, customer, product, origin, destination, footer, color, onOpen, photos }: {
  source: string;
  date: string;
  customer: string;
  product: string;
  origin?: string;
  destination?: string;
  footer?: ReactNode;
  color: string;
  onOpen: () => void;
  /** Une photo : miniature à gauche. Plusieurs (navette) : rangée de miniatures. */
  photos?: Array<string | null | undefined>;
}) {
  const single = photos?.length === 1;
  const strip = photos && photos.length > 1 ? photos : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ backgroundColor: color }}
      className="block w-full rounded-[22px] px-3.5 py-3 text-left text-zinc-950 shadow-sm ring-1 ring-black/5 transition hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/60"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="truncate text-[13px] font-bold">{source}</span>
        <span className="shrink-0 text-[11px] tabular-nums">{date}</span>
      </span>
      {strip && <span className="mt-2 flex items-center gap-1.5">{strip.slice(0, 5).map((src, index) => <Thumb key={index} src={src} size={36} className="rounded-lg" />)}{strip.length > 5 && <span className="text-[11px] font-semibold">+{strip.length - 5}</span>}</span>}
      <span className={single ? "mt-2 flex items-center gap-3" : "contents"}>
      {single && <Thumb src={photos![0]} />}
      <span className={single ? "min-w-0 flex-1" : "contents"}>
      <span className={`${single ? "" : "mt-2 "}flex items-baseline justify-between gap-3 text-[13px]`}>
        <span className="min-w-0 truncate">{customer}</span>
        <span className="min-w-0 truncate text-right">{product}</span>
      </span>
      {origin !== undefined && <span className="mt-2.5 flex items-center gap-1.5 text-[13px] font-bold">
        <span className="max-w-[45%] truncate">{origin}</span>
        <span aria-hidden className="flex min-w-6 flex-1 items-center">
          <span className="h-px flex-1 bg-current" />
          <span className="border-y-[4px] border-l-[7px] border-y-transparent border-l-current" />
        </span>
        <span className="sr-only">vers</span>
        <span className="max-w-[45%] truncate">{destination}</span>
      </span>}
      </span>
      </span>
      {footer && <span className="mt-1 block text-right text-[11px] tabular-nums">{footer}</span>}
    </button>
  );
}
