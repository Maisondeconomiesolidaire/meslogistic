import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Inbox, Plus, Search, Truck, MapPin, CalendarClock } from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import { PageHeader } from "./components/crm/PageHeader";
import { KanbanColumn } from "./components/crm/KanbanColumn";
import { Button } from "./components/ui/Button";
import { UnderlineTabs } from "./components/ui/UnderlineTabs";
import { Select } from "./components/ui/Field";
import { FullSpinner } from "./components/ui/Spinner";
import { EmptyState } from "./components/ui/EmptyState";
import { RequestDetail, NewRequest } from "./RequestDetail";
export type Request = Doc<"mlRequests">;
export const stages = [{ key: "a_preparer", label: "À préparer", color: "#317fa0" }, { key: "en_transit", label: "En transit", color: "#b57426" }, { key: "receptionnee", label: "Réceptionnées", color: "#196b24" }] as const;
export const date = (value: number) => new Date(value).toLocaleDateString("fr-FR");
export function Demandes({ canCreate, canUpdate }: { canCreate: boolean; canUpdate: boolean }) {
  const requests = useQuery(api.meslogistic.list, {});
  const create = useMutation(api.meslogistic.create);
  const [tab, setTab] = useState<"active" | "closed">("active");
  const [search, setSearch] = useState(""); const [site, setSite] = useState("");
  const [sort, setSort] = useState("desc"); const [open, setOpen] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const rows = requests ?? [];
  const closed = (r: Request) => ["receptionnee", "annulee"].includes(r.status);
  const filtered = rows.filter(r => (tab === "closed") === closed(r)).filter(r => !site || r.origin === site || r.destination === site).filter(r => [r.title,r.reference,r.customerName,r.origin,r.destination,r.assignee].join(" ").toLocaleLowerCase("fr-FR").includes(search.toLocaleLowerCase("fr-FR"))).sort((a,b) => sort === "desc" ? b.createdAt-a.createdAt : a.createdAt-b.createdAt);
  const selected = rows.find(r => r._id === open);
  return <div className="flex min-h-screen flex-col lg:h-screen">
    <PageHeader title="Demandes" actions={canCreate && <Button size="sm" onClick={() => setNewOpen(true)}><Plus size={16}/>Nouvelle demande</Button>} />
    <div className="px-4 pt-4 sm:px-6"><UnderlineTabs items={[{key:"active", label:"Demandes en cours"},{key:"closed",label:"Réceptionnées / Annulées"}]} value={tab} onChange={setTab} counts={{active:rows.filter(r=>!closed(r)).length,closed:rows.filter(closed).length}} /></div>
    <div className="relative z-10 border-b border-[var(--crm-border)] px-4 sm:px-6"><div className="flex flex-wrap items-center gap-2 overflow-visible py-3"><Select aria-label="Ordre des demandes" className="h-9 w-[140px] rounded-xl bg-[var(--crm-surface-2)] px-3 text-xs font-medium text-zinc-300" value={sort} onChange={e=>setSort(e.target.value)}><option value="desc">Plus récent</option><option value="asc">Plus ancien</option></Select><div className="h-4 w-px shrink-0 bg-[var(--crm-surface-3)]" /><Select aria-label="Filtrer par site" className="h-9 w-[180px] rounded-xl bg-[var(--crm-surface-2)] px-3 text-xs font-medium text-zinc-300" value={site} onChange={e=>setSite(e.target.value)}><option value="">Tous les sites</option>{[...new Set(rows.flatMap(r=>[r.origin,r.destination]))].sort().map(s=><option key={s}>{s}</option>)}</Select></div><div className="pb-3"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/><input type="search" aria-label="Rechercher une demande" className="h-10 w-full rounded-xl border border-[var(--crm-border)] bg-[var(--crm-surface-2)] pl-10 pr-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" placeholder="Rechercher un objet, un client, une commande…" value={search} onChange={e=>setSearch(e.target.value)}/></div></div></div>
    <div className="flex-1 overflow-auto p-4 sm:p-6">{!requests ? <FullSpinner label="Chargement des demandes…"/> : filtered.length === 0 ? <EmptyState icon={<Inbox size={32}/>} title="Aucune demande" description={search || site ? "Aucune demande ne correspond aux filtres." : "Les commandes Bâtire nécessitant un déplacement apparaîtront ici."}/> : <div className="flex flex-col gap-4 lg:h-full lg:flex-row">{(tab === "active" ? stages.slice(0,2) : [{key:"receptionnee",label:"Réceptionnées",color:"#196b24"},{key:"annulee",label:"Annulées",color:"#71717a"}]).map(s=><KanbanColumn key={s.key} title={s.label} count={filtered.filter(r=>r.status===s.key).length} accent={s.color}>{filtered.filter(r=>r.status===s.key).map(r=><RequestCard key={r._id} request={r} onOpen={()=>setOpen(r._id)}/>)}</KanbanColumn>)}</div>}
      {rows.length === 500 && <p className="mt-3 text-xs text-zinc-500">Les 500 dernières demandes sont affichées.</p>}
    </div>
    {selected && <RequestDetail key={selected._id} request={selected} canUpdate={canUpdate} onClose={()=>setOpen(null)}/>}
    {newOpen && <NewRequest onClose={()=>setNewOpen(false)} onCreate={async values=>{const id=await create(values);setNewOpen(false);setTab("active");setSearch("");setSite("");setOpen(id);}}/>}
  </div>;
}
function RequestCard({request:r,onOpen}:{request:Request;onOpen:()=>void}) {
  const count=r.status==="receptionnee"?3:r.status==="en_transit"?2:r.prepared?1:0;
  return <button onClick={onOpen} style={{backgroundColor:r.status==="annulee"?"#71717a":"#317fa0"}} className="block w-full text-left rounded-xl p-3 text-white shadow-sm ring-1 ring-black/10 transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
    <div className="flex items-start justify-between gap-3"><span className="inline-flex items-center gap-1.5 text-xs font-semibold"><Truck className="h-3.5 w-3.5"/>Navette</span><div className="flex items-center gap-2"><span className="rounded bg-white/18 px-1.5 py-0.5 text-[10px] font-medium">{r.orderId?"Bâtire":"Manuelle"}</span><span className="rounded bg-white/18 px-1.5 py-0.5 text-[10px] font-medium text-white/90">{date(r.createdAt)}</span></div></div>
    <div className="mt-2.5 flex items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">{(r.customerName || "Navette").split(" ").map(w=>w[0]).slice(0,2).join("")}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{r.customerName || "Déplacement interne"}</p><p className="truncate text-xs text-white/80">{r.quantity} {r.unit} · {r.title}</p></div></div>
    <p className="mt-2 flex items-center gap-1 text-xs text-white/80"><MapPin size={12}/><span className="truncate">{r.origin} → {r.destination}</span></p>
    <div className="mt-3"><div className="flex items-center justify-between text-[11px] text-white/90"><span>{r.status==="annulee"?"Annulée":["Objets à préparer","Prêts pour la navette","En transit","Réceptionnée"][count]}</span><span>{Math.round(count/3*100)}%</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-white transition-all" style={{width:`${count/3*100}%`}}/></div></div>
    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-white/80"><span>{r.reference}</span>{r.assignee&&<span className="rounded bg-white/20 px-1.5 py-0.5">{r.assignee}</span>}{r.scheduledDate&&<span className="ml-auto inline-flex items-center gap-1 rounded bg-white/20 px-1.5 py-0.5"><CalendarClock size={12}/>{new Date(r.scheduledDate+"T12:00:00").toLocaleDateString("fr-FR")}</span>}</div>
  </button>;
}
