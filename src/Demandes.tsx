/** Types et utilitaires partagés des demandes de transit (la page Demandes est ShuttleBoard). */
import type { Doc } from "../convex/_generated/dataModel";
import { TRANSIT_COLOR } from "./components/crm/LogisticsCard";
export type Request = Doc<"mlRequests"> & { collected?: boolean; photoUrl?: string | null };
export const stages = [{ key: "a_preparer", label: "Nouveau", color: "#3b82f6" }, { key: "en_transit", label: "En transit", color: TRANSIT_COLOR }, { key: "receptionnee", label: "Disponible à destination", color: "#10b981" }] as const;
export const statusLabel = (status: Request["status"]) => status === "annulee" ? "Annulée" : stages.find(stage => stage.key === status)?.label ?? status;
/** Noms courts des lieux, identiques aux cartes Bâtire. */
export function shortLocation(value: string) {
  const name = value.toLocaleLowerCase("fr-FR");
  if (name.includes("comptoir")) return "Comptoir C";
  if (name.includes("solidarium") || name.includes("usine") || name.includes("pays de bray") || name.includes("lachapelle")) return "Solidarium";
  if (name.includes("esspace") || name.includes("gournay")) return "ESSpace 150";
  return value;
}
export const date = (value: number) => new Date(value).toLocaleDateString("fr-FR");
