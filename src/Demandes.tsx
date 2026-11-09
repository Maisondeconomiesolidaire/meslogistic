import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Inbox, Plus, Search } from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import { PageHeader } from "./components/crm/PageHeader";
import { KanbanColumn } from "./components/crm/KanbanColumn";
import { Button } from "./components/ui/Button";
import { UnderlineTabs } from "./components/ui/UnderlineTabs";
import { Select } from "./components/ui/Field";
import { FullSpinner } from "./components/ui/Spinner";
import { EmptyState } from "./components/ui/EmptyState";
import { LogisticsCard, TRANSIT_COLOR, shortDate } from "./components/crm/LogisticsCard";
import { RequestDetail, NewRequest } from "./RequestDetail";
export type Request = Doc<"mlRequests"> & { collected?: boolean };
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
export function Demandes({ canCreate, canUpdate }: { canCreate: boolean; canUpdate: boolean }) {
  const requests = useQuery(api.meslogistic.list, {});
  const create = useMutation(api.meslogistic.create);
  const [tab, setTab] = useState<"active" | "closed">("active");
  const [search, setSearch] = useState(""); const [site, setSite] = useState("");
  const [sort, setSort] = useState("desc"); const [open, setOpen] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const rows = requests ?? [];
  // Un lot disponible à destination reste visible tant que le client ne l’a pas retiré.
  const closed = (r: Request) => r.status === "annulee" || Boolean(r.collected);
  const filtered = rows.filter(r => (tab === "closed") === closed(r)).filter(r => !site || r.origin === site || r.destination === site).filter(r => [r.title,r.reference,r.customerName,r.origin,r.destination,r.assignee].join(" ").toLocaleLowerCase("fr-FR").includes(search.toLocaleLowerCase("fr-FR"))).sort((a,b) => sort === "desc" ? b.createdAt-a.createdAt : a.createdAt-b.createdAt);
  const selected = rows.find(r => r._id === open);
  return <div className="flex min-h-screen flex-col lg:h-screen">
    <PageHeader title="Demandes" actions={canCreate && <Button size="sm" onClick={() => setNewOpen(true)}><Plus size={16}/>Nouvelle demande</Button>} />
    <div className="px-4 pt-4 sm:px-6"><UnderlineTabs items={[{key:"active", label:"Demandes en cours"},{key:"closed",label:"Retirées / Annulées"}]} value={tab} onChange={setTab} counts={{active:rows.filter(r=>!closed(r)).length,closed:rows.filter(closed).length}} /></div>
    <div className="relative z-10 border-b border-[var(--crm-border)] px-4 sm:px-6"><div className="flex flex-wrap items-center gap-2 overflow-visible py-3"><Select aria-label="Ordre des demandes" className="h-9 w-[140px] rounded-xl bg-[var(--crm-surface-2)] px-3 text-xs font-medium text-zinc-300" value={sort} onChange={e=>setSort(e.target.value)}><option value="desc">Plus récent</option><option value="asc">Plus ancien</option></Select><div className="h-4 w-px shrink-0 bg-[var(--crm-surface-3)]" /><Select aria-label="Filtrer par site" className="h-9 w-[180px] rounded-xl bg-[var(--crm-surface-2)] px-3 text-xs font-medium text-zinc-300" value={site} onChange={e=>setSite(e.target.value)}><option value="">Tous les sites</option>{[...new Set(rows.flatMap(r=>[r.origin,r.destination]))].sort().map(s=><option key={s}>{s}</option>)}</Select></div><div className="pb-3"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/><input type="search" aria-label="Rechercher une demande" className="h-10 w-full rounded-xl border border-[var(--crm-border)] bg-[var(--crm-surface-2)] pl-10 pr-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" placeholder="Rechercher un objet, un client, une commande…" value={search} onChange={e=>setSearch(e.target.value)}/></div></div></div>
    <div className="flex-1 overflow-auto p-4 sm:p-6">{!requests ? <FullSpinner label="Chargement des demandes…"/> : filtered.length === 0 ? <EmptyState icon={<Inbox size={32}/>} title="Aucune demande" description={search || site ? "Aucune demande ne correspond aux filtres." : "Les commandes Bâtire nécessitant un déplacement apparaîtront ici."}/> : <div className="flex flex-col gap-4 lg:h-full lg:flex-row">{(tab === "active" ? stages : [{key:"receptionnee",label:"Retirées",color:"#71717a"},{key:"annulee",label:"Annulées",color:"#71717a"}]).map(s=><KanbanColumn key={s.key} title={s.label} count={filtered.filter(r=>r.status===s.key).length} accent={s.color}>{filtered.filter(r=>r.status===s.key).map(r=><RequestCard key={r._id} request={r} onOpen={()=>setOpen(r._id)}/>)}</KanbanColumn>)}</div>}
      {rows.length === 500 && <p className="mt-3 text-xs text-zinc-500">Les 500 dernières demandes sont affichées.</p>}
    </div>
    {selected && <RequestDetail key={selected._id} request={selected} canUpdate={canUpdate} onClose={()=>setOpen(null)}/>}
    {newOpen && <NewRequest onClose={()=>setNewOpen(false)} onCreate={async values=>{const id=await create(values);setNewOpen(false);setTab("active");setSearch("");setSite("");setOpen(id);}}/>}
  </div>;
}
function RequestCard({request:r,onOpen}:{request:Request;onOpen:()=>void}) {
  return <LogisticsCard
    source={r.orderId ? "BatiRE" : "Demande interne"}
    date={shortDate(r.createdAt)}
    customer={r.customerName || "Déplacement interne"}
    product={`${r.quantity} ${r.unit} · ${r.title}`}
    origin={shortLocation(r.origin)}
    destination={shortLocation(r.destination)}
    footer={r.dueDate ? shortDate(r.dueDate) : r.scheduledDate ? `Navette ${shortDate(r.scheduledDate)}` : undefined}
    color={r.status === "annulee" ? "#d9d9d9" : r.orderId ? TRANSIT_COLOR : "#d9d9d9"}
    onOpen={onOpen}
  />;
}
