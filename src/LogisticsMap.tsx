import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Clock, Loader2, MapPinOff, Navigation } from "lucide-react";
import { shortLocation, type Request } from "./Demandes";
import { ON_SITE_COLOR, TRANSIT_COLOR } from "./components/crm/LogisticsCard";
import type { Shuttle } from "./ShuttleBoard";
import { DEFAULT_START_HOUR, planShuttle, routeKey, type NavPlan } from "./shuttleRoute";

const TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;
type LngLat = [number, number];
export const NAV_COLOR = "#3b82f6";
const time = (date: Date) => date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const dayLabel = (date: Date) => date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const duration = (seconds: number) => { const minutes = Math.max(1, Math.round(seconds / 60)); return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`; };

/** Les trois sites, géocodés une fois pour toutes. */
const SITES: Record<string, { coords: LngLat; address: string }> = {
  "Comptoir C": { coords: [2.104311, 49.439732], address: "13 Av. Pierre Bérégovoy, 60000 Beauvais" },
  "Solidarium": { coords: [1.902428, 49.442296], address: "4 rue de la Prairie, 60650 Lachapelle-aux-Pots" },
  "ESSpace 150": { coords: [1.725067, 49.469388], address: "150 Rte de Paris, 76220 Gournay-en-Bray" },
};
export const SELECTED_COLOR = "#a855f7";

/** Coordonnées d'un lieu : un des trois sites, sinon géocodage Mapbox (mis en cache). */
const geocodeCache = new Map<string, Promise<LngLat | null>>();
function locate(place: string): Promise<LngLat | null> {
  const key = shortLocation(place);
  if (SITES[key]) return Promise.resolve(SITES[key].coords);
  if (!TOKEN) return Promise.resolve(null);
  let pending = geocodeCache.get(key);
  if (!pending) {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(place)}.json?limit=1&country=fr&language=fr&proximity=1.9,49.45&access_token=${TOKEN}`;
    pending = fetch(url).then(response => response.ok ? response.json() : null).then((data: { features?: { center?: LngLat }[] } | null) => data?.features?.[0]?.center ?? null).catch(() => null);
    geocodeCache.set(key, pending);
  }
  return pending;
}

/** Tracé routier entre deux points (ligne droite si Mapbox ne répond pas). */
const roadCache = new Map<string, Promise<LngLat[]>>();
function road(from: LngLat, to: LngLat): Promise<LngLat[]> {
  const key = `${from.join(",")};${to.join(",")}`;
  let pending = roadCache.get(key);
  if (!pending) {
    pending = !TOKEN ? Promise.resolve([from, to]) : fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${key}?geometries=geojson&overview=full&alternatives=false&access_token=${TOKEN}`)
      .then(response => response.ok ? response.json() : null)
      .then((data: { routes?: { geometry?: { coordinates?: LngLat[] } }[] } | null) => data?.routes?.[0]?.geometry?.coordinates ?? [from, to])
      .catch(() => [from, to]);
    roadCache.set(key, pending);
  }
  return pending;
}

type LineFeature = { type: "Feature"; properties: Record<string, unknown>; geometry: { type: "LineString"; coordinates: LngLat[] } };
const emptyCollection = { type: "FeatureCollection" as const, features: [] as LineFeature[] };
const lineFeature = (coordinates: LngLat[], properties: Record<string, unknown>): LineFeature => ({ type: "Feature", properties, geometry: { type: "LineString", coordinates } });

/**
 * Carte des demandes : un repère par lieu (nombre d'objets qui y attendent un
 * départ) et le tracé routier de chaque liaison. Orange : objets en transit ;
 * bleu : objets à planifier. La demande sélectionnée est surlignée en violet.
 */
export function LogisticsMap({ requests, selected, place, onPlace, isDark, shuttle }: {
  requests: Request[]; selected?: Request | null; place: string | null; onPlace: (place: string | null) => void; isDark: boolean;
  /** Navette ouverte : la carte passe en mode navigation. */
  shuttle?: Shuttle | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const fitted = useRef(false);
  // Incrémenté à chaque chargement de style (thème) : les tracés sont alors redessinés.
  const [ready, setReady] = useState(0);
  const styleUrl = isDark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11";
  const appliedStyle = useRef(styleUrl);
  const [coords, setCoords] = useState<Record<string, LngLat>>(() => Object.fromEntries(Object.entries(SITES).map(([name, site]) => [name, site.coords])));
  const [roads, setRoads] = useState<Record<string, LngLat[]>>({});

  // Lieux et liaisons à afficher.
  const { places, links } = useMemo(() => {
    const places = new Map<string, { raw: string; waiting: number; transit: number }>();
    const links = new Map<string, { from: string; to: string; count: number; transit: boolean }>();
    const touch = (raw: string, name = shortLocation(raw)) => { if (!places.has(name)) places.set(name, { raw, waiting: 0, transit: 0 }); return name; };
    for (const [name, site] of Object.entries(SITES)) touch(site.address, name);
    for (const request of requests) {
      const from = touch(request.origin); const to = touch(request.destination);
      if (request.status === "a_preparer") places.get(from)!.waiting += 1;
      if (request.status === "en_transit") places.get(to)!.transit += 1;
      if (from === to) continue;
      const key = `${from}→${to}`;
      const link = links.get(key) ?? { from, to, count: 0, transit: false };
      link.count += 1; link.transit ||= request.status === "en_transit";
      links.set(key, link);
    }
    return { places, links };
  }, [requests]);

  // Mode navigation : itinéraire optimisé de la navette ouverte.
  const navKey = shuttle ? routeKey(shuttle) : "";
  const shuttleRef = useRef(shuttle);
  shuttleRef.current = shuttle;
  const [plan, setPlan] = useState<NavPlan | null>(null);
  const [planError, setPlanError] = useState("");
  const [planning, setPlanning] = useState(false);
  useEffect(() => {
    const current = shuttleRef.current;
    setPlan(null); setPlanError("");
    if (!current) return;
    let cancelled = false;
    setPlanning(true);
    planShuttle(current, locate)
      .then(result => { if (!cancelled) setPlan(result); })
      .catch((caught: unknown) => { if (!cancelled) setPlanError(caught instanceof Error ? caught.message : "Itinéraire indisponible."); })
      .finally(() => { if (!cancelled) setPlanning(false); });
    return () => { cancelled = true; };
  }, [navKey]);
  const navMode = Boolean(shuttle);

  // Création de la carte, une seule fois.
  useEffect(() => {
    if (!TOKEN || !container.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({ container: container.current, style: appliedStyle.current, center: [1.92, 49.45], zoom: 9.4, attributionControl: false });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-left");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    // « style.load » : au premier chargement puis à chaque changement de thème.
    map.on("style.load", () => {
      if (map.getSource("links")) return;
      map.addSource("links", { type: "geojson", data: emptyCollection });
      map.addLayer({ id: "links", type: "line", source: "links", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-opacity": 0.8 } });
      map.addSource("nav", { type: "geojson", data: emptyCollection });
      map.addLayer({ id: "nav-casing", type: "line", source: "nav", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 10, "line-opacity": 0.9 } });
      map.addLayer({ id: "nav", type: "line", source: "nav", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": NAV_COLOR, "line-width": 6 } });
      map.addSource("selected", { type: "geojson", data: emptyCollection });
      map.addLayer({ id: "selected", type: "line", source: "selected", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": SELECTED_COLOR, "line-width": 7, "line-opacity": 0.95 } });
      setReady(version => version + 1);
    });
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);
    mapRef.current = map;
    return () => { observer.disconnect(); markers.current.forEach(marker => marker.remove()); markers.current = []; map.remove(); mapRef.current = null; fitted.current = false; setReady(0); };
  }, []);

  // Thème de l'app : clair ou sombre, sans recréer la carte.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedStyle.current === styleUrl) return;
    appliedStyle.current = styleUrl;
    map.setStyle(styleUrl);
  }, [styleUrl]);

  // Géocodage des lieux inconnus.
  useEffect(() => {
    for (const [name, { raw }] of places) {
      if (coords[name]) continue;
      void locate(raw).then(found => { if (found) setCoords(current => current[name] ? current : { ...current, [name]: found }); });
    }
  }, [places, coords]);

  // Tracés routiers des liaisons.
  useEffect(() => {
    for (const link of links.values()) {
      const key = `${link.from}→${link.to}`;
      const from = coords[link.from]; const to = coords[link.to];
      if (roads[key] || !from || !to) continue;
      void road(from, to).then(line => setRoads(current => ({ ...current, [key]: line })));
    }
  }, [links, coords, roads]);

  useEffect(() => {
    const source = ready ? mapRef.current?.getSource("links") as mapboxgl.GeoJSONSource | undefined : undefined;
    if (!source) return;
    const features = [...links.entries()].flatMap(([key, link]) => {
      const line = roads[key] ?? (coords[link.from] && coords[link.to] ? [coords[link.from], coords[link.to]] : null);
      return line ? [lineFeature(line, { color: link.transit ? TRANSIT_COLOR : ON_SITE_COLOR, width: 2 + Math.min(link.count, 6) })] : [];
    });
    source.setData(navMode ? emptyCollection : { type: "FeatureCollection", features });
  }, [ready, links, roads, coords, navMode]);

  // Tracé de navigation et cadrage sur la tournée.
  useEffect(() => {
    const map = mapRef.current;
    const source = ready ? map?.getSource("nav") as mapboxgl.GeoJSONSource | undefined : undefined;
    if (!map || !source) return;
    if (!navMode || !plan) { source.setData(emptyCollection); return; }
    source.setData(plan.line.length > 1 ? { type: "FeatureCollection", features: [lineFeature(plan.line, {})] } : emptyCollection);
    const bounds = new mapboxgl.LngLatBounds();
    [...plan.line, ...plan.stops.map(stop => stop.at)].forEach(point => bounds.extend(point));
    map.fitBounds(bounds, { padding: { top: 70, bottom: 50, left: 70, right: 380 }, maxZoom: 13, duration: 900 });
  }, [ready, plan, navMode]);

  // Repères des lieux.
  const selectedPlaces = selected ? [shortLocation(selected.origin), shortLocation(selected.destination)] : [];
  const selectedKey = selectedPlaces.join("|");
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    markers.current.forEach(marker => marker.remove());
    if (navMode) {
      markers.current = (plan?.stops ?? []).map((stop, index) => {
        const element = document.createElement("div");
        element.className = "flex flex-col items-center gap-1";
        const label = document.createElement("span");
        label.className = "flex items-center gap-1.5 whitespace-nowrap rounded-full bg-zinc-950/85 px-2 py-0.5 text-[11px] font-bold text-white shadow-lg";
        label.textContent = `${stop.name} · ${time(stop.arrival)}`;
        const badge = document.createElement("span");
        badge.className = "flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-lg";
        badge.style.backgroundColor = index === 0 ? "#10b981" : NAV_COLOR;
        badge.textContent = index === 0 ? "D" : String(index);
        element.append(label, badge);
        return new mapboxgl.Marker({ element, anchor: "bottom" }).setLngLat(stop.at).addTo(map);
      });
      return;
    }
    markers.current = [...places.entries()].flatMap(([name, info]) => {
      const at = coords[name];
      if (!at) return [];
      const active = place === name || selectedKey.split("|").includes(name);
      const element = document.createElement("button");
      element.type = "button";
      element.title = `${name} : ${info.waiting} à expédier, ${info.transit} en route vers ce lieu`;
      element.className = "flex flex-col items-center gap-1 focus:outline-none";
      const label = document.createElement("span");
      label.className = `flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold text-zinc-950 shadow-lg ring-2 ${active ? "ring-white" : "ring-black/10"}`;
      label.style.backgroundColor = active ? SELECTED_COLOR : info.waiting ? ON_SITE_COLOR : info.transit ? TRANSIT_COLOR : "#d4d4d8";
      if (active) label.style.color = "#fff";
      label.textContent = name;
      if (info.waiting) { const count = document.createElement("span"); count.className = "rounded-full bg-black/80 px-1.5 text-[11px] text-white"; count.textContent = String(info.waiting); label.append(count); }
      const dot = document.createElement("span");
      dot.className = "h-3 w-3 rounded-full border-2 border-white shadow";
      dot.style.backgroundColor = active ? SELECTED_COLOR : "#18181b";
      element.append(label, dot);
      element.addEventListener("click", event => { event.stopPropagation(); onPlace(place === name ? null : name); });
      return [new mapboxgl.Marker({ element, anchor: "bottom", offset: [0, 6] }).setLngLat(at).addTo(map)];
    });
    if (!fitted.current && markers.current.length > 1) {
      const bounds = new mapboxgl.LngLatBounds();
      markers.current.forEach(marker => bounds.extend(marker.getLngLat()));
      map.fitBounds(bounds, { padding: 90, maxZoom: 11, duration: 0 });
      fitted.current = true;
    }
  }, [ready, places, coords, place, selectedKey, onPlace, navMode, plan]);

  // Demande sélectionnée : tracé en surbrillance et centrage.
  useEffect(() => {
    const map = mapRef.current;
    const source = ready ? map?.getSource("selected") as mapboxgl.GeoJSONSource | undefined : undefined;
    if (!map || !source) return;
    const [fromName, toName] = selectedKey ? selectedKey.split("|") : [];
    const from = fromName ? coords[fromName] : undefined; const to = toName ? coords[toName] : undefined;
    if (!from) { source.setData(emptyCollection); return; }
    if (!to || fromName === toName) { source.setData(emptyCollection); map.flyTo({ center: from, zoom: 13, duration: 900 }); return; }
    let cancelled = false;
    void road(from, to).then(line => {
      if (cancelled) return;
      source.setData({ type: "FeatureCollection", features: [lineFeature(line, {})] });
      const bounds = new mapboxgl.LngLatBounds(); line.forEach(point => bounds.extend(point));
      map.fitBounds(bounds, { padding: 90, maxZoom: 13, duration: 900 });
    });
    return () => { cancelled = true; };
  }, [ready, selectedKey, coords]);

  if (!TOKEN) return <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-zinc-500"><MapPinOff size={28} />Carte indisponible : VITE_MAPBOX_ACCESS_TOKEN manquant.</div>;
  return <div className="absolute inset-0">
    <div ref={container} className="h-full w-full" />
    {navMode && shuttle && <NavPanel shuttle={shuttle} plan={plan} planning={planning} error={planError} />}
    {!navMode && <div className="pointer-events-none absolute right-2 top-2 flex flex-wrap justify-end gap-2 text-[11px] font-semibold">
      {[[ON_SITE_COLOR, "À expédier"], [TRANSIT_COLOR, "En transit"], [SELECTED_COLOR, "Sélection"]].map(([color, label]) => <span key={label} className="flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-white"><span className="h-2 w-4 rounded-full" style={{ backgroundColor: color }} />{label}</span>)}
    </div>}
  </div>;
}

/** Panneau de navigation : ordre des arrêts, temps de route et heure de fin. */
function NavPanel({ shuttle, plan, planning, error }: { shuttle: Shuttle; plan: NavPlan | null; planning: boolean; error: string }) {
  const now = new Date();
  let headline = "";
  if (shuttle.status === "terminee" && shuttle.completedAt) {
    const done = new Date(shuttle.completedAt);
    headline = `La navette a été complétée${sameDay(done, now) ? "" : ` le ${dayLabel(done)}`} à ${time(done)}`;
  } else if (plan) {
    headline = `La navette sera complétée${sameDay(plan.end, now) ? "" : ` le ${dayLabel(plan.end)}`} à ${time(plan.end)}`;
  }
  return <div className="absolute right-2 top-2 flex max-h-[calc(100%-1rem)] w-[340px] max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-[color:color-mix(in_srgb,var(--crm-surface)_94%,transparent)] text-sm text-zinc-100 shadow-2xl backdrop-blur">
    <div className="shrink-0 px-4 py-3 text-white" style={{ backgroundColor: NAV_COLOR }}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] opacity-90"><Navigation size={13} />Navigation · {shuttle.name}</p>
      {planning ? <p className="mt-1 flex items-center gap-2 font-semibold"><Loader2 size={15} className="animate-spin" />Calcul du meilleur itinéraire…</p>
        : headline ? <p className="mt-1 text-base font-bold leading-snug">{headline}</p> : null}
      {plan && <p className="mt-1 text-xs opacity-90">{duration(plan.seconds)} de route · {(plan.meters / 1000).toFixed(1).replace(".", ",")} km · {plan.stops.length - 1} arrêt{plan.stops.length > 2 ? "s" : ""}</p>}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-red-500">{error}</p>}
      {plan && <ol className="relative space-y-3">
        {plan.stops.map((stop, index) => <li key={`${stop.name}-${index}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: index === 0 ? "#10b981" : NAV_COLOR }}>{index === 0 ? "D" : index}</span>
          <div className="min-w-0">
            <p className="flex items-baseline justify-between gap-2"><span className="truncate font-semibold">{stop.name}</span><span className="shrink-0 font-bold tabular-nums">{time(stop.arrival)}</span></p>
            <p className="text-xs text-zinc-500">{index === 0 ? (plan.estimatedStart ? `Départ estimé à ${DEFAULT_START_HOUR} h (${dayLabel(plan.start)})` : shuttle.status === "planifiee" ? "Départ maintenant" : "Départ de la navette") : <span className="flex items-center gap-1"><Clock size={11} />{duration(stop.legSeconds)} de route</span>}</p>
            {stop.pickups.length > 0 && <p className="mt-1 text-xs"><span className="font-semibold text-emerald-500">Charger :</span> {stop.pickups.join(", ")}</p>}
            {stop.drops.length > 0 && <p className="mt-1 text-xs"><span className="font-semibold" style={{ color: TRANSIT_COLOR }}>Livrer :</span> {stop.drops.join(", ")}</p>}
          </div>
        </li>)}
      </ol>}
      {plan && plan.stops.length === 1 && <p className="mt-2 text-xs text-zinc-500">Aucun arrêt à faire : ajoutez des objets à la navette.</p>}
      {plan && <p className="mt-3 text-[11px] text-zinc-500">Ordre optimisé et temps de route Mapbox (trafic habituel), hors temps de chargement.</p>}
    </div>
  </div>;
}
