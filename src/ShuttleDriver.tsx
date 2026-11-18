import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation } from "convex/react";
import QRCode from "qrcode";
import { ExternalLink, QrCode, Search, UserRound, X } from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Shuttle } from "./ShuttleBoard";

type Person = { clerkId: string; name: string; email: string; imageUrl: string | null };

/** Lien de la page de ramassage, celui qu'encode le QR code envoyé au conducteur. */
export const scanUrl = (shuttleId: string) => `${window.location.origin}/scan/${shuttleId}`;

/**
 * Conducteur d'une navette logistique : choisi parmi les salariés
 * (@eco-solidaire.fr). Le trajet d'un salarié garde la personne qui a réservé.
 */
export function DriverPicker({ shuttle, canUpdate, onError }: { shuttle: Shuttle; canUpdate: boolean; onError: (message: string) => void }) {
  const loadDirectory = useAction(api.meslogisticShuttles.driverDirectory);
  const assign = useMutation(api.meslogisticShuttles.assignDriver);
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const editable = canUpdate && !shuttle.fromReservation && shuttle.status === "planifiee";

  useEffect(() => {
    if (!open || people) return;
    loadDirectory({}).then(setPeople).catch(caught => { onError(caught instanceof Error ? caught.message : String(caught)); setOpen(false); });
  }, [open, people, loadDirectory, onError]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (people ?? []).filter(person => !term || person.name.toLowerCase().includes(term) || person.email.includes(term));
  }, [people, search]);

  async function choose(person: Person | null) {
    setBusy(true); onError("");
    try { await assign({ shuttleId: shuttle._id, driver: person && { clerkId: person.clerkId, name: person.name, email: person.email } }); setOpen(false); setSearch(""); }
    catch (caught) { onError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  return <div className="relative">
    <div className="flex items-center gap-2 text-sm">
      <UserRound size={15} className="shrink-0 text-zinc-400" />
      <span className="text-zinc-400">Conducteur :</span>
      <span className="min-w-0 truncate font-semibold">{shuttle.driverName ?? <span className="font-normal text-zinc-500">non assigné</span>}</span>
      {editable && <button type="button" onClick={() => setOpen(!open)} className="ml-auto shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-brand-500 hover:bg-[var(--crm-surface-2)]">{shuttle.driverName ? "Changer" : "Assigner"}</button>}
    </div>
    {open && <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)] shadow-2xl">
      <label className="flex items-center gap-2 border-b border-[var(--crm-border)] px-3 py-2"><Search size={14} className="text-zinc-500" />
        <input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher un salarié…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="text-zinc-500 hover:text-zinc-100"><X size={14} /></button>
      </label>
      <ul className="max-h-64 overflow-y-auto py-1">
        {!people ? <li className="px-3 py-2 text-sm text-zinc-500">Chargement de l'annuaire…</li>
          : shown.length === 0 ? <li className="px-3 py-2 text-sm text-zinc-500">Aucun salarié trouvé.</li>
          : shown.map(person => <li key={person.clerkId}>
            <button type="button" disabled={busy} onClick={() => void choose(person)} className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-[var(--crm-surface-2)] ${person.clerkId === shuttle.driverClerkId ? "bg-brand-500/10" : ""}`}>
              {person.imageUrl ? <img src={person.imageUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--crm-surface-2)]"><UserRound size={14} /></span>}
              <span className="min-w-0"><span className="block truncate font-semibold">{person.name}</span><span className="block truncate text-xs text-zinc-500">{person.email}</span></span>
            </button>
          </li>)}
      </ul>
      {shuttle.driverName && <button type="button" disabled={busy} onClick={() => void choose(null)} className="w-full border-t border-[var(--crm-border)] px-3 py-2 text-left text-sm font-semibold text-red-500 hover:bg-[var(--crm-surface-2)]">Retirer le conducteur</button>}
    </div>}
  </div>;
}

/** QR code de la navette finalisée : ouvre la page de ramassage. */
export function ShuttleQr({ shuttle }: { shuttle: Shuttle }) {
  const [src, setSrc] = useState<string | null>(null);
  const url = scanUrl(shuttle._id);
  useEffect(() => { QRCode.toDataURL(url, { width: 240, margin: 1 }).then(setSrc).catch(() => setSrc(null)); }, [url]);
  if (!shuttle.finalizedAt) return null;
  return <div className="flex items-center gap-3 rounded-2xl border border-[var(--crm-border)] p-2.5">
    {src ? <img src={src} alt="QR code de la navette" className="h-20 w-20 shrink-0 rounded-lg bg-white p-1" /> : <QrCode size={40} className="shrink-0 text-zinc-500" />}
    <div className="min-w-0 text-xs text-zinc-400">
      <p className="text-sm font-semibold text-[var(--foreground)]">Navette finalisée</p>
      <p>Le {new Date(shuttle.finalizedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · QR code envoyé à {shuttle.driverName ?? "le conducteur"}</p>
      <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold text-brand-500 hover:underline">Page de ramassage<ExternalLink size={11} /></a>
    </div>
  </div>;
}
