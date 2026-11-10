import { useState } from "react";
import { useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "../convex/_generated/api";
import { PageHeader } from "./components/crm/PageHeader";
import { KanbanColumn } from "./components/crm/KanbanColumn";
import { Button } from "./components/ui/Button";
import { FullSpinner } from "./components/ui/Spinner";
import { RequestDetail } from "./RequestDetail";
import { NewShuttle, STATUS, ShuttleCard, ShuttleDetail, type Shuttle } from "./ShuttleBoard";

const COLUMNS: { status: Shuttle["status"]; title: string; empty: string }[] = [
  { status: "planifiee", title: "Nouveau", empty: "Aucune navette en préparation." },
  { status: "en_route", title: "En transit", empty: "Aucune navette en route." },
  { status: "terminee", title: "Terminée", empty: "Aucune navette terminée." },
];

/**
 * Navettes v2 : suivi des navettes. Ce sont elles qui portent le statut
 * (Nouveau → En transit → Terminée) ; leurs objets suivent.
 */
export function ShuttleKanban({ canCreate, canUpdate }: { canCreate: boolean; canUpdate: boolean }) {
  const board = useQuery(api.meslogisticShuttles.board, {});
  const requests = useQuery(api.meslogistic.list, {});
  const [openShuttle, setOpenShuttle] = useState<string | null>(null);
  const [openRequest, setOpenRequest] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showAllDone, setShowAllDone] = useState(false);
  const shuttle = board?.shuttles.find(item => item._id === openShuttle);
  const request = requests?.find(item => item._id === openRequest);
  const column = (status: Shuttle["status"]) => (board?.shuttles ?? []).filter(item => item.status === status)
    .sort((a, b) => status === "terminee" ? b.scheduledDate.localeCompare(a.scheduledDate) : a.scheduledDate.localeCompare(b.scheduledDate));

  return <div className="flex min-h-screen flex-col lg:h-screen">
    <PageHeader title="Navettes v2" actions={canCreate && <Button size="sm" onClick={() => setCreating(true)}><Plus size={16} />Nouvelle navette</Button>} />
    <div className="flex-1 overflow-auto p-4 sm:p-6">
      {!board ? <FullSpinner label="Chargement des navettes…" /> : <div className="flex flex-col gap-4 lg:h-full lg:flex-row">
        {COLUMNS.map(({ status, title, empty }) => {
          const rows = column(status);
          const visible = status === "terminee" && !showAllDone ? rows.slice(0, 8) : rows;
          return <KanbanColumn key={status} title={title} count={rows.length} accent={STATUS[status].color}>
            {rows.length === 0 ? <p className="p-3 text-center text-xs text-zinc-500">{empty}</p> : visible.map(item => <ShuttleCard key={item._id} shuttle={item} onOpen={() => setOpenShuttle(item._id)} />)}
            {status === "terminee" && rows.length > 8 && <button type="button" onClick={() => setShowAllDone(!showAllDone)} className="w-full rounded-lg py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-200">{showAllDone ? "Réduire" : `Voir les ${rows.length - 8} autres`}</button>}
          </KanbanColumn>;
        })}
      </div>}
    </div>
    {creating && <NewShuttle onClose={() => setCreating(false)} onCreated={id => { setCreating(false); setOpenShuttle(id); }} />}
    {shuttle && board && <ShuttleDetail key={shuttle._id} shuttle={shuttle} unassigned={board.unassigned} canUpdate={canUpdate} onClose={() => setOpenShuttle(null)} onOpenRequest={setOpenRequest} />}
    {request && <RequestDetail key={request._id} request={request} canUpdate={canUpdate} onClose={() => setOpenRequest(null)} />}
  </div>;
}
