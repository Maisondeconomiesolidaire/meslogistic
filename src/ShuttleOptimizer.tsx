import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { AlertTriangle, Bus, Check, ExternalLink, Loader2, MapPin, Route, Sparkles } from "lucide-react";
import { api } from "../convex/_generated/api";
import type { ShuttleSuggestion } from "../convex/meslogisticAi";
import type { Request } from "./Demandes";
import { shortLocation } from "./Demandes";
import { shortDate } from "./components/crm/LogisticsCard";
import { Button } from "./components/ui/Button";
import { assignableShuttles } from "./TransferPlanning";

type Suggestion = ShuttleSuggestion;

const errorText = (caught: unknown) => {
  const data = (caught as { data?: unknown })?.data;
  if (typeof data === "string") return data;
  return caught instanceof Error ? caught.message.replace(/^.*(ConvexError|Uncaught Error):\s*/s, "").split("\n")[0] : "Opération impossible.";
};

/** Itinéraire Google Maps de la tournée proposée (aucune clé nécessaire). */
function mapsUrl(stops: { address: string }[]) {
  if (stops.length < 2) return null;
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", stops[0].address);
  url.searchParams.set("destination", stops[stops.length - 1].address);
  if (stops.length > 2) url.searchParams.set("waypoints", stops.slice(1, -1).map(stop => stop.address).join("|"));
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}

/**
 * Onglet « Navettes » : l'IA étudie les transits ouverts et les navettes à
 * venir, avec les distances routières réelles, puis propose la meilleure
 * navette pour ce transit. L'équipe garde la main : rien n'est assigné sans clic.
 */
export function ShuttleOptimizer({ request, canUpdate }: { request: Request; canUpdate: boolean }) {
  const suggest = useAction(api.meslogisticAi.suggestShuttle);
  const assign = useMutation(api.meslogistic.assignShuttle);
  const createShuttle = useMutation(api.meslogistic.createShuttle);
  const shuttles = useQuery(api.meslogistic.shuttlesOverview, {});
  const [result, setResult] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const editable = canUpdate && request.status === "a_preparer";
  const current = shuttles?.find(shuttle => shuttle._id === request.shuttleId);
  const upcoming = shuttles ? assignableShuttles(shuttles, request.shuttleId) : [];

  async function analyse() {
    setLoading(true); setError(""); setDone("");
    try { setResult(await suggest({ requestId: request._id })); } catch (caught) { setError(errorText(caught)); } finally { setLoading(false); }
  }
  async function apply() {
    const recommendation = result?.recommendation;
    if (!recommendation) return;
    setBusy(true); setError("");
    try {
      const shuttleId = recommendation.kind === "existing" ? recommendation.shuttleId : await createShuttle({ name: recommendation.name, scheduledDate: recommendation.date });
      await assign({ id: request._id, shuttleId, expectedUpdatedAt: request.updatedAt });
      setDone(recommendation.kind === "existing" ? `Transit affecté à « ${recommendation.name} ».` : `Navette « ${recommendation.name} » créée et transit affecté.`);
    } catch (caught) { setError(errorText(caught)); } finally { setBusy(false); }
  }

  const recommendation = result?.recommendation;
  const recommendedId = recommendation?.kind === "existing" ? recommendation.shuttleId : null;
  const itinerary = result ? mapsUrl(result.stops) : null;
  return <div className="grid gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start">
    <section className="min-w-0 space-y-4">
      <div className="rounded-2xl border border-[var(--crm-border)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-semibold"><Sparkles size={18} className="text-brand-500" />Optimisation de tournée</h3>
            <p className="mt-1 text-sm text-zinc-500">L’IA compare ce transit ({shortLocation(request.origin)} → {shortLocation(request.destination)}{request.dueDate ? `, échéance ${shortDate(request.dueDate)}` : ""}) aux navettes à venir et aux autres transits ouverts, avec les distances routières réelles.</p>
          </div>
          <Button onClick={() => void analyse()} disabled={loading || request.status !== "a_preparer"}>{loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}{loading ? "Analyse en cours…" : result ? "Relancer l’analyse" : "Proposer la meilleure navette"}</Button>
        </div>
        {request.status !== "a_preparer" && <p className="mt-3 text-sm text-zinc-500">Ce transit est déjà parti ou clôturé : plus de navette à proposer.</p>}
        {current && <p className="mt-3 flex items-center gap-2 text-sm"><Bus size={15} />Navette actuelle : <strong>{current.name}</strong> · {shortDate(current.scheduledDate)}</p>}
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-500">{error}</p>}
      {done && <p role="status" className="flex items-center gap-2 rounded-xl bg-green-500/10 p-3 text-sm text-green-500"><Check size={16} />{done}</p>}

      {result && <div className="space-y-4">
        <div className={`rounded-2xl border p-5 ${recommendation ? "border-brand-500/50 bg-brand-500/10" : "border-amber-500/50 bg-amber-500/10"}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Proposition de l’IA</p>
          {recommendation ? <>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-bold"><Bus size={22} />{recommendation.name}</p>
            <p className="mt-1 text-sm">{recommendation.kind === "existing" ? "Navette existante" : "Nouvelle navette à créer"} · départ le <strong>{new Date(`${recommendation.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</strong></p>
          </> : <p className="mt-2 font-semibold">Aucune navette exploitable proposée.</p>}
          {result.summary && <p className="mt-3 text-sm">{result.summary}</p>}
          {result.warnings.map(warning => <p key={warning} className="mt-2 flex items-center gap-2 text-sm text-amber-500"><AlertTriangle size={15} />{warning}</p>)}
          {recommendation && editable && !done && <Button className="mt-4" disabled={busy || (recommendation.kind === "existing" && recommendation.shuttleId === request.shuttleId)} onClick={() => void apply()}>{busy ? "Enregistrement…" : recommendation.kind === "existing" ? (recommendation.shuttleId === request.shuttleId ? "Déjà affecté à cette navette" : "Affecter à cette navette") : "Créer la navette et affecter"}</Button>}
        </div>

        {result.reasons.length > 0 && <div className="rounded-2xl border border-[var(--crm-border)] p-5"><h4 className="text-sm font-semibold">Pourquoi</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{result.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}

        {result.stops.length > 0 && <div className="rounded-2xl border border-[var(--crm-border)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-2 text-sm font-semibold"><Route size={16} />Tournée proposée</h4>
            <span className="text-xs text-zinc-500">{[result.estimatedKm !== null && `≈ ${result.estimatedKm} km`, result.estimatedMinutes !== null && `≈ ${Math.round(result.estimatedMinutes)} min`].filter(Boolean).join(" · ")}</span>
          </div>
          <ol className="mt-3 space-y-2">{result.stops.map((stop, index) => <li key={`${stop.label}-${index}`} className="flex items-start gap-3 text-sm"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{index + 1}</span><span className="min-w-0"><span className="font-medium">{stop.label}</span>{stop.address !== stop.label && <span className="block text-xs text-zinc-500">{stop.address}</span>}</span></li>)}</ol>
          {itinerary && <a href={itinerary} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-500 hover:underline"><ExternalLink size={14} />Ouvrir l’itinéraire dans Google Maps</a>}
        </div>}

        {result.groupWith.length > 0 && <div className="rounded-2xl border border-[var(--crm-border)] p-5"><h4 className="text-sm font-semibold">À embarquer dans la même navette</h4><ul className="mt-2 space-y-1.5 text-sm">{result.groupWith.map(row => <li key={row._id} className="flex flex-wrap justify-between gap-2"><span><span className="font-mono text-xs text-zinc-500">{row.reference}</span> · {row.title}</span><span className="text-zinc-500">{shortLocation(row.origin)} → {shortLocation(row.destination)}{row.dueDate ? ` · ${shortDate(row.dueDate)}` : ""}</span></li>)}</ul><p className="mt-2 text-xs text-zinc-500">Affectez-les depuis leur propre fiche.</p></div>}

        {result.alternatives.length > 0 && <div className="rounded-2xl border border-[var(--crm-border)] p-5"><h4 className="text-sm font-semibold">Autres options écartées</h4><ul className="mt-2 space-y-1.5 text-sm">{result.alternatives.map(item => <li key={item.label}><strong>{item.label}</strong>{item.why ? <span className="text-zinc-500"> — {item.why}</span> : null}</li>)}</ul></div>}

        <p className="text-xs text-zinc-500">Distances : {result.distanceProvider}{result.unlocated.length ? ` · lieux non géolocalisés : ${result.unlocated.join(", ")}` : ""} · modèle {result.model}. Vérifiez la proposition avant de l’appliquer.</p>
      </div>}
    </section>

    <aside className="space-y-3 lg:sticky lg:top-4">
      <h3 className="font-semibold">Navettes à venir</h3>
      {shuttles === undefined ? <p className="text-sm text-zinc-500">Chargement…</p> : upcoming.length === 0 ? <p className="rounded-xl bg-[var(--crm-surface-2)] p-3 text-sm text-zinc-500">Aucune navette à venir.</p> :
        <ul className="space-y-2">{upcoming.map(shuttle => <li key={shuttle._id} className={`rounded-xl border p-3 text-sm ${shuttle._id === recommendedId ? "border-brand-500 bg-brand-500/10" : "border-[var(--crm-border)] bg-[var(--crm-surface-2)]"}`}>
          <p className="flex items-center justify-between gap-2 font-semibold"><span className="flex min-w-0 items-center gap-2"><Bus size={14} className="shrink-0" /><span className="truncate">{shuttle.name}</span></span><span className="shrink-0 text-xs font-normal text-zinc-500">{shortDate(shuttle.scheduledDate)}</span></p>
          {shuttle.transits.length === 0 ? <p className="mt-1 text-xs text-zinc-500">Aucun transit</p> : <ul className="mt-1.5 space-y-0.5">{shuttle.transits.map(transit => <li key={transit._id} className="flex items-center gap-1.5 text-xs text-zinc-500"><MapPin size={11} className="shrink-0" /><span className="truncate">{shortLocation(transit.origin)} → {shortLocation(transit.destination)}</span></li>)}</ul>}
        </li>)}</ul>}
    </aside>
  </div>;
}
