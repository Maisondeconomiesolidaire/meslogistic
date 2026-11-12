import { Warehouse } from "lucide-react";

export type StorageSlot = { label: string; kind?: "stockage" | "depart" | "arrivee"; depot?: string } | null | undefined;

/** Mêmes types et couleurs que la page Emplacements de Bâtire. */
const KINDS = {
  stockage: { label: "Stockage", color: "#2795b3" },
  depart: { label: "Départ marchandise", color: "#d97706" },
  arrivee: { label: "Arrivée marchandise", color: "#16a34a" },
} as const;

export const slotText = (slot: StorageSlot) => slot ? `${slot.label}${slot.kind ? ` · ${KINDS[slot.kind].label}` : ""}` : "";

/** Emplacement de l'article Bâtire dans son dépôt : où aller le chercher. */
export function SlotTag({ slot, className = "" }: { slot: StorageSlot; className?: string }) {
  if (!slot) return null;
  const kind = slot.kind ? KINDS[slot.kind] : null;
  return <span className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${className}`} style={{ backgroundColor: `${kind?.color ?? "#71717a"}22`, color: kind?.color ?? "#a1a1aa" }} title={kind ? `Emplacement · ${kind.label}` : "Emplacement"}>
    <Warehouse size={11} className="shrink-0" /><span className="truncate">{slot.label}{kind ? ` · ${kind.label}` : ""}</span>
  </span>;
}
