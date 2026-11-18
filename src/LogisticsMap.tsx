import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Clock, Loader2, MapPinOff, Navigation, Recycle, Truck, X } from "lucide-react";
import { api } from "../convex/_generated/api";
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
/** Couleurs des tracés et repères : plus foncées sur le fond clair pour rester lisibles. */
const PALETTES = {
  dark: { onSite: ON_SITE_COLOR, transit: TRANSIT_COLOR, selected: SELECTED_COLOR, nav: NAV_COLOR, idle: "#d4d4d8", labelText: "#09090b", lineOpacity: 0.8 },
  light: { onSite: "#1d4ed8", transit: "#c2410c", selected: "#6d28d9", nav: "#1e40af", idle: "#52525b", labelText: "#ffffff", lineOpacity: 0.95 },
};

/** Coordonnées d'un lieu : un des trois sites, sinon géocodage Mapbox (mis en cache). */
const geocodeCache = new Map<string, Promise<LngLat | null>>();
export function locate(place: string): Promise<LngLat | null> {
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

/** Lieux d'une navette : la destination d'un trajet Mes Outils a ses coordonnées exactes. */
function shuttleLocator(shuttle: Shuttle) {
  const exact = shuttle.trip?.destinationAt ?? null;
  return (raw: string): Promise<LngLat | null> => exact && raw === shuttle.destination ? Promise.resolve(exact) : locate(raw);
}

const isoToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };

/** Navettes affichées par défaut : en route, ou planifiées aujourd'hui ou plus tard. */
export function currentShuttles(shuttles: Shuttle[]) {
  const today = isoToday();
  return shuttles.filter(shuttle => shuttle.status === "en_route" || (shuttle.status === "planifiee" && shuttle.scheduledDate >= today));
}

/**
 * Tracé d'aperçu d'une navette (sans optimisation) : départ, lieux de ses
 * objets dans l'ordre, arrivée ; un trajet Mes Outils revient à son départ.
 */
async function overviewLine(shuttle: Shuttle): Promise<{ line: LngLat[]; places: string[] } | null> {
  const rows = shuttle.transits.filter(row => shuttle.status === "en_route" ? row.status === "en_transit" : row.status === "a_preparer");
  const raws = [shuttle.origin ?? rows[0]?.origin, ...rows.flatMap(row => [row.origin, row.destination]), shuttle.destination, shuttle.trip ? shuttle.origin : undefined]
    .filter((raw): raw is string => Boolean(raw));
  const names: string[] = [];
  const ordered: string[] = [];
  for (const raw of raws) {
    const name = shortLocation(raw);
    if (names[names.length - 1] === name) continue;
    names.push(name); ordered.push(raw);
  }
  const locateOf = shuttleLocator(shuttle);
  const points = (await Promise.all(ordered.map(raw => locateOf(raw)))).filter((point): point is LngLat => Boolean(point));
  if (points.length < 2) return null;
  const legs = await Promise.all(points.slice(1).map((point, index) => road(points[index], point)));
  return { line: legs.flat(), places: names };
}

/** Une couleur par navette ; deux navettes qui partagent un lieu n'ont jamais la même. */
const SHUTTLE_COLORS = ["#2563eb", "#16a34a", "#db2777", "#ea580c", "#0891b2", "#ca8a04", "#7c3aed", "#dc2626", "#0d9488", "#4f46e5"];
function colorShuttles(items: Array<{ id: string; places: string[] }>) {
  const colors = new Map<string, string>();
  for (const item of items) {
    const taken = new Set(items.filter(other => other.id !== item.id && colors.has(other.id) && other.places.some(place => item.places.includes(place))).map(other => colors.get(other.id)));
    colors.set(item.id, SHUTTLE_COLORS.find(color => !taken.has(color)) ?? SHUTTLE_COLORS[colors.size % SHUTTLE_COLORS.length]);
  }
  return colors;
}

type LineKind = "navette" | "collecte";
type ShuttleChoice = { id: string; name: string; color: string; status: string; kind: LineKind };
/** Filtre de la carte (pastilles en haut). */
type Layer = "tout" | "navettes" | "collectes";
type Collecte = NonNullable<ReturnType<typeof useQuery<typeof api.meslogisticShuttles.collectes>>>[number];
const pointKey = (at: LngLat) => `${at[0].toFixed(3)},${at[1].toFixed(3)}`;

/** Tracé d'une collecte : celui calculé par Recycapp, sinon par la route depuis le dépôt (Solidarium) jusqu'au client ; une tournée GDR revient au dépôt. */
async function collecteLine(collecte: Collecte): Promise<{ line: LngLat[]; places: string[]; stops: Array<LngLat | null> } | null> {
  // Les demandes du calendrier n'ont que l'adresse : géocodée ici (mise en cache).
  const located = await Promise.all(collecte.stops.map(stop => stop.at ? Promise.resolve(stop.at) : locate(stop.address)));
  const stops = located.flatMap(at => at ? [at] : []);
  const points = collecte.depot ? [collecte.depot, ...stops, ...(collecte.roundTrip ? [collecte.depot] : [])] : stops;
  const places = points.map(pointKey);
  if (collecte.route && collecte.route.length > 1) return { line: collecte.route, places, stops: located };
  if (points.length < 2) return null;
  const legs = await Promise.all(points.slice(1).map((point, index) => road(points[index], point)));
  return { line: legs.flat(), places, stops: located };
}

/** Propriétés d'un objet cliqué sur la carte (le typage Mapbox ne les expose pas). */
const featureProps = (feature: unknown) => ((feature as { properties?: Record<string, unknown> } | undefined)?.properties ?? {});

type LineFeature = { type: "Feature"; properties: Record<string, unknown>; geometry: { type: "LineString"; coordinates: LngLat[] } };
const emptyCollection = { type: "FeatureCollection" as const, features: [] as LineFeature[] };
const lineFeature = (coordinates: LngLat[], properties: Record<string, unknown>): LineFeature => ({ type: "Feature", properties, geometry: { type: "LineString", coordinates } });

/**
 * Carte des demandes : un repère par lieu (nombre d'objets qui y attendent un
 * départ) et le tracé routier de chaque liaison. Orange : objets en transit ;
 * bleu : objets à planifier. La demande sélectionnée est surlignée en violet.
 */
export function LogisticsMap({ requests, selected, place, onPlace, isDark, shuttle, onPlan, shuttles = [], onOpenShuttle, leftInset = 0 }: {
  requests: Request[]; selected?: Request | null; place: string | null; onPlace: (place: string | null) => void; isDark: boolean;
  /** Navette ouverte : la carte passe en mode navigation. */
  shuttle?: Shuttle | null;
  /** Reçoit l'itinéraire calculé de la navette ouverte (pour l'impression). */
  onPlan?: (plan: NavPlan | null) => void;
  /** Toutes les navettes : celles en cours / à venir sont tracées par défaut. */
  shuttles?: Shuttle[];
  /** Clic sur le tracé d'une navette : l'ouvrir. */
  onOpenShuttle?: (id: string) => void;
  /** Largeur (px) des cartes flottantes à gauche : le cadrage les évite. */
  leftInset?: number;
}) {
  const insetRef = useRef(leftInset);
  insetRef.current = leftInset;
  const pad = (base: number) => ({ top: base, bottom: base, right: base, left: base + insetRef.current });
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const fitted = useRef(false);
  // Incrémenté à chaque chargement de style (thème) : les tracés sont alors redessinés.
  const [ready, setReady] = useState(0);
  const styleUrl = isDark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12";
  const palette = PALETTES[isDark ? "dark" : "light"];
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
    planShuttle(current, shuttleLocator(current))
      .then(result => { if (!cancelled) setPlan(result); })
      .catch((caught: unknown) => { if (!cancelled) setPlanError(caught instanceof Error ? caught.message : "Itinéraire indisponible."); })
      .finally(() => { if (!cancelled) setPlanning(false); });
    return () => { cancelled = true; };
  }, [navKey]);
  const onPlanRef = useRef(onPlan);
  onPlanRef.current = onPlan;
  useEffect(() => { onPlanRef.current?.(plan); }, [plan]);
  const navMode = Boolean(shuttle);

  // Aperçu : tracé de chaque navette en cours ou à venir.
  const overview = useMemo(() => currentShuttles(shuttles), [shuttles]);
  const overviewKey = overview.map(routeKey).join("§");
  const overviewRef = useRef(overview);
  overviewRef.current = overview;
  const [shuttleLines, setShuttleLines] = useState<Array<{ id: string; name: string; status: string; line: LngLat[]; places: string[] }>>([]);
  useEffect(() => {
    let cancelled = false;
    const current = overviewRef.current;
    void Promise.all(current.map(async item => ({ id: item._id as string, name: item.name, status: String(item.status), route: await overviewLine(item).catch(() => null) })))
      .then(results => {
        if (cancelled) return;
        setShuttleLines(results.flatMap(result => result.route ? [{ id: result.id, name: result.name, status: result.status, line: result.route.line, places: result.route.places }] : []));
      });
    return () => { cancelled = true; };
  }, [overviewKey]);

  // Tournées de collecte Recycapp à venir ou en cours.
  const collectes = useQuery(api.meslogisticShuttles.collectes);
  const collectesKey = (collectes ?? []).map(item => `${item._id}:${item.status}:${item.stops.map(stop => stop.at ? pointKey(stop.at) : "").join(",")}:${item.route?.length ?? 0}`).join("§");
  const collectesRef = useRef(collectes);
  collectesRef.current = collectes;
  const [collecteLines, setCollecteLines] = useState<Array<{ id: string; name: string; status: string; line: LngLat[]; places: string[]; stops?: Array<LngLat | null> }>>([]);
  useEffect(() => {
    let cancelled = false;
    const current = collectesRef.current ?? [];
    void Promise.all(current.map(async item => ({ item, route: await collecteLine(item).catch(() => null) })))
      .then(results => {
        if (cancelled) return;
        // Une tournée en cours est tracée en plein, comme une navette en route.
        setCollecteLines(results.flatMap(({ item, route }) => route ? [{ id: item._id as string, name: item.label || "Collecte", status: item.status === "en_cours" ? "en_route" : "planifiee", line: route.line, places: route.places, stops: route.stops }] : []));
      });
    return () => { cancelled = true; };
  }, [collectesKey]);

  // Tous les tracés, une couleur chacun ; deux trajets qui partagent un lieu n'ont jamais la même.
  const allLines = useMemo(() => {
    const items = [...shuttleLines.map(line => ({ ...line, kind: "navette" as LineKind })), ...collecteLines.map(line => ({ ...line, kind: "collecte" as LineKind }))];
    const colors = colorShuttles(items.map(item => ({ id: item.id, places: item.places.map(place => item.kind === "navette" ? place : `@${place}`) })));
    return items.map(item => ({ ...item, color: colors.get(item.id)! }));
  }, [shuttleLines, collecteLines]);
  const [layer, setLayer] = useState<Layer>("tout");
  const overviewLines = useMemo(() => allLines.filter(item => layer === "tout" || (layer === "navettes" ? item.kind === "navette" : item.kind === "collecte")), [allLines, layer]);
  // Tournée de collecte ouverte (clic sur son tracé).
  const [openCollecteId, setOpenCollecteId] = useState<string | null>(null);
  const openCollecte = collectes?.find(item => item._id === openCollecteId) ?? null;
  useEffect(() => { if (shuttle) setOpenCollecteId(null); }, [shuttle]);
  useEffect(() => { if (openCollecteId && collectes && !collectes.some(item => item._id === openCollecteId)) setOpenCollecteId(null); }, [collectes, openCollecteId]);
  // Niveau de détail selon le zoom : vue d'ensemble compacte, détails en zoomant.
  const [detailed, setDetailed] = useState(false);
  // Plusieurs navettes au même endroit : liste pour choisir laquelle ouvrir.
  const [chooser, setChooser] = useState<{ x: number; y: number; items: ShuttleChoice[] } | null>(null);
  useEffect(() => { if (navMode) setChooser(null); }, [navMode]);
  const onOpenShuttleRef = useRef(onOpenShuttle);
  onOpenShuttleRef.current = onOpenShuttle;
  const openLine = (item: ShuttleChoice) => { setChooser(null); if (item.kind === "collecte") setOpenCollecteId(item.id); else { setOpenCollecteId(null); onOpenShuttle?.(item.id); } };
  const openLineRef = useRef(openLine);
  openLineRef.current = openLine;

  // Création de la carte, une seule fois.
  useEffect(() => {
    if (!TOKEN || !container.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({ container: container.current, style: appliedStyle.current, center: [1.92, 49.45], zoom: 9.4, attributionControl: false });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    const syncZoom = () => setDetailed(map.getZoom() >= 10.2);
    map.on("zoomend", syncZoom);
    syncZoom();
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    // « style.load » : au premier chargement puis à chaque changement de thème.
    map.on("style.load", () => {
      if (map.getSource("links")) return;
      map.addSource("links", { type: "geojson", data: emptyCollection });
      map.addLayer({ id: "links", type: "line", source: "links", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-opacity": ["get", "opacity"] } });
      map.addSource("nav", { type: "geojson", data: emptyCollection });
      map.addLayer({ id: "nav-casing", type: "line", source: "nav", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 10, "line-opacity": 0.9 } });
      map.addLayer({ id: "nav", type: "line", source: "nav", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 6 } });
      map.addSource("shuttles", { type: "geojson", data: emptyCollection });
      map.addLayer({ id: "shuttles-casing", type: "line", source: "shuttles", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.7 } });
      map.addLayer({ id: "shuttles", type: "line", source: "shuttles", filter: ["==", ["get", "status"], "en_route"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3, 13, 6], "line-opacity": 0.95 } });
      map.addLayer({ id: "shuttles-planned", type: "line", source: "shuttles", filter: ["!=", ["get", "status"], "en_route"], layout: { "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3, 13, 6], "line-opacity": 0.95, "line-dasharray": [1.6, 1.1] } });
      map.addLayer({ id: "shuttles-label", type: "symbol", source: "shuttles", minzoom: 10.2, layout: { "symbol-placement": "line", "text-field": ["get", "name"], "text-size": 12, "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"], "symbol-spacing": 320 }, paint: { "text-color": ["get", "color"], "text-halo-color": "#ffffff", "text-halo-width": 2 } });
      // Zone de clic plus large que le trait.
      map.addLayer({ id: "shuttles-hit", type: "line", source: "shuttles", paint: { "line-color": "#000000", "line-width": 18, "line-opacity": 0 } });
      map.addSource("selected", { type: "geojson", data: emptyCollection });
      map.addLayer({ id: "selected", type: "line", source: "selected", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 7, "line-opacity": 0.95 } });
      setReady(version => version + 1);
    });
    // Toutes les navettes sous le pointeur (des trajets peuvent emprunter la même route).
    const shuttlesAt = (features: unknown[] | undefined) => {
      const seen = new Map<string, ShuttleChoice>();
      for (const feature of features ?? []) {
        const { id, name, color, status, kind } = featureProps(feature);
        if (typeof id === "string" && !seen.has(id)) seen.set(id, { id, name: String(name ?? "Navette"), color: String(color ?? NAV_COLOR), status: String(status ?? ""), kind: kind === "collecte" ? "collecte" : "navette" });
      }
      return [...seen.values()];
    };
    map.on("click", "shuttles-hit", event => {
      const found = shuttlesAt(event.features);
      if (found.length === 1) { openLineRef.current(found[0]); return; }
      if (found.length > 1) setChooser({ x: event.point.x, y: event.point.y, items: found });
    });
    map.on("click", event => {
      if (!map.queryRenderedFeatures(event.point, { layers: ["shuttles-hit"] }).length) setChooser(null);
    });
    map.on("movestart", () => setChooser(null));
    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    map.on("mouseenter", "shuttles-hit", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mousemove", "shuttles-hit", event => {
      const found = shuttlesAt(event.features);
      if (!found.length) return;
      const escape = (text: string) => text.replace(/[<>&]/g, "");
      popup.setLngLat(event.lngLat).setHTML(found.length === 1
        ? `<span style="color:#52525b;font-size:11px">${found[0].kind === "collecte" ? "Collecte" : "Navette"}</span><br><strong style="color:#09090b">${escape(found[0].name)}</strong>`
        : `<strong style="color:#09090b">${found.length} trajets ici</strong><br><span style="color:#52525b">Cliquez pour choisir</span>`).addTo(map);
    });
    map.on("mouseleave", "shuttles-hit", () => { map.getCanvas().style.cursor = ""; popup.remove(); });
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
      return line ? [lineFeature(line, { color: link.transit ? palette.transit : palette.onSite, width: 2 + Math.min(link.count, 6), opacity: palette.lineOpacity })] : [];
    });
    // Par défaut, la carte montre les trajets des navettes ; sans navette en cours, les liaisons des demandes.
    source.setData(navMode || overviewLines.length > 0 ? emptyCollection : { type: "FeatureCollection", features });
  }, [ready, links, roads, coords, navMode, palette, overviewLines]);

  useEffect(() => {
    const source = ready ? mapRef.current?.getSource("shuttles") as mapboxgl.GeoJSONSource | undefined : undefined;
    if (!source) return;
    source.setData(navMode ? emptyCollection : {
      type: "FeatureCollection",
      features: overviewLines.map(item => lineFeature(item.line, { id: item.id, name: item.name, status: item.status, color: item.color, kind: item.kind })),
    });
  }, [ready, overviewLines, navMode, palette]);
  const openColor = shuttle ? allLines.find(item => item.id === shuttle._id)?.color ?? palette.nav : palette.nav;
  const collecteColor = openCollecte ? allLines.find(item => item.id === openCollecte._id)?.color ?? palette.nav : palette.nav;

  // Changement de filtre : cadrage sur les trajets affichés.
  const firstLayer = useRef(true);
  useEffect(() => {
    if (firstLayer.current) { firstLayer.current = false; return; }
    const map = mapRef.current;
    if (!map || navMode || !overviewLines.length) return;
    const bounds = new mapboxgl.LngLatBounds();
    overviewLines.forEach(item => item.line.forEach(point => bounds.extend(point)));
    map.fitBounds(bounds, { padding: pad(80), maxZoom: 12, duration: 700 });
  }, [layer]);

  // Tournée de collecte ouverte : tracé en surbrillance, arrêts numérotés, cadrage.
  const collecteMarkers = useRef<mapboxgl.Marker[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    collecteMarkers.current.forEach(marker => marker.remove());
    collecteMarkers.current = [];
    if (!ready || !map || navMode || !openCollecte) return;
    const line = allLines.find(item => item.id === openCollecte._id)?.line ?? [];
    const located = collecteLines.find(item => item.id === openCollecte._id)?.stops ?? [];
    const points: Array<{ at: LngLat; label: string; badge: string }> = [
      ...(openCollecte.depot ? [{ at: openCollecte.depot, label: "Dépôt", badge: "D" }] : []),
      ...openCollecte.stops.flatMap((stop, index) => { const at = stop.at ?? located[index]; return at ? [{ at, label: stop.time ? `${time(new Date(stop.time))} · ${stop.contactName ?? stop.address.split(",")[0]}` : stop.contactName ?? stop.address.split(",")[0], badge: String(index + 1) }] : []; }),
    ];
    collecteMarkers.current = points.map(point => {
      const element = document.createElement("div");
      element.className = "flex flex-col items-center gap-1";
      if (detailed) {
        const label = document.createElement("span");
        label.className = "whitespace-nowrap rounded-full bg-zinc-950/85 px-2 py-0.5 text-[11px] font-bold text-white shadow-lg";
        label.textContent = point.label;
        element.append(label);
      }
      const badge = document.createElement("span");
      badge.className = "flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-lg";
      badge.style.backgroundColor = point.badge === "D" ? "#059669" : collecteColor;
      badge.textContent = point.badge;
      element.append(badge);
      return new mapboxgl.Marker({ element, anchor: "bottom" }).setLngLat(point.at).addTo(map);
    });
    const bounds = new mapboxgl.LngLatBounds();
    [...line, ...points.map(point => point.at)].forEach(point => bounds.extend(point));
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: { ...pad(70), right: 360 }, maxZoom: 13, duration: 900 });
  }, [ready, openCollecte?._id, navMode, detailed, collecteColor, allLines.length, collecteLines]);

  // Tracé de navigation et cadrage sur la tournée.
  useEffect(() => {
    const map = mapRef.current;
    const source = ready ? map?.getSource("nav") as mapboxgl.GeoJSONSource | undefined : undefined;
    if (!map || !source) return;
    if (!navMode || !plan) { source.setData(emptyCollection); return; }
    source.setData(plan.line.length > 1 ? { type: "FeatureCollection", features: [lineFeature(plan.line, { color: openColor })] } : emptyCollection);
    const bounds = new mapboxgl.LngLatBounds();
    [...plan.line, ...plan.stops.map(stop => stop.at)].forEach(point => bounds.extend(point));
    map.fitBounds(bounds, { padding: { ...pad(70), right: 360 }, maxZoom: 13, duration: 900 });
  }, [ready, plan, navMode, palette, openColor]);

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
        label.textContent = detailed ? `${stop.name} · ${time(stop.arrival)}` : stop.name;
        const badge = document.createElement("span");
        badge.className = "flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-lg";
        badge.style.backgroundColor = index === 0 ? "#059669" : openColor;
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
      label.style.backgroundColor = active ? palette.selected : info.waiting ? palette.onSite : info.transit ? palette.transit : palette.idle;
      label.style.color = active ? "#fff" : palette.labelText;
      // Vue d'ensemble : nom seul ; en zoomant, le nombre d'objets qui attendent.
      label.textContent = name;
      if (info.waiting && detailed) { const count = document.createElement("span"); count.className = "rounded-full bg-black/80 px-1.5 text-[11px] text-white"; count.textContent = String(info.waiting); label.append(count); }
      const dot = document.createElement("span");
      dot.className = "h-3 w-3 rounded-full border-2 border-white shadow";
      dot.style.backgroundColor = active ? palette.selected : "#18181b";
      element.append(label, dot);
      element.addEventListener("click", event => { event.stopPropagation(); onPlace(place === name ? null : name); });
      return [new mapboxgl.Marker({ element, anchor: "bottom", offset: [0, 6] }).setLngLat(at).addTo(map)];
    });
    if (!fitted.current && markers.current.length > 1) {
      const bounds = new mapboxgl.LngLatBounds();
      markers.current.forEach(marker => bounds.extend(marker.getLngLat()));
      map.fitBounds(bounds, { padding: pad(90), maxZoom: 11, duration: 0 });
      fitted.current = true;
    }
  }, [ready, places, coords, place, selectedKey, onPlace, navMode, plan, palette, detailed, openColor]);

  // Demande sélectionnée : tracé en surbrillance et centrage.
  useEffect(() => {
    const map = mapRef.current;
    const source = ready ? map?.getSource("selected") as mapboxgl.GeoJSONSource | undefined : undefined;
    if (!map || !source) return;
    const [fromName, toName] = selectedKey ? selectedKey.split("|") : [];
    const from = fromName ? coords[fromName] : undefined; const to = toName ? coords[toName] : undefined;
    if (!from) {
      const line = openCollecte && !navMode ? allLines.find(item => item.id === openCollecte._id)?.line : undefined;
      source.setData(line && line.length > 1 ? { type: "FeatureCollection", features: [lineFeature(line, { color: collecteColor })] } : emptyCollection);
      return;
    }
    if (!to || fromName === toName) { source.setData(emptyCollection); map.flyTo({ center: from, zoom: 13, duration: 900 }); return; }
    let cancelled = false;
    void road(from, to).then(line => {
      if (cancelled) return;
      source.setData({ type: "FeatureCollection", features: [lineFeature(line, { color: palette.selected })] });
      const bounds = new mapboxgl.LngLatBounds(); line.forEach(point => bounds.extend(point));
      map.fitBounds(bounds, { padding: pad(90), maxZoom: 13, duration: 900 });
    });
    return () => { cancelled = true; };
  }, [ready, selectedKey, coords, palette, openCollecte?._id, navMode, collecteColor, allLines]);

  if (!TOKEN) return <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-zinc-500"><MapPinOff size={28} />Carte indisponible : VITE_MAPBOX_ACCESS_TOKEN manquant.</div>;
  return <div className="absolute inset-0">
    <div ref={container} className="h-full w-full" />
    {chooser && !navMode && <div role="menu" aria-label="Navettes à cet endroit" className="absolute z-10 w-64 overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)] text-sm text-zinc-100 shadow-2xl"
      style={{ left: Math.max(8, chooser.x - 128), top: chooser.y + 14 }}>
      <p className="border-b border-[var(--crm-border)] px-3 py-2 text-xs font-semibold text-zinc-400">{chooser.items.length} trajets passent ici · lequel ouvrir ?</p>
      <ul className="max-h-64 overflow-y-auto p-1">
        {chooser.items.map(item => <li key={item.id}><button type="button" role="menuitem" onClick={() => openLine(item)} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-[var(--crm-surface-2)]">
          <span className="h-1 w-6 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="min-w-0 flex-1 truncate font-semibold">{item.name}</span>
          <span className="shrink-0 text-[11px] text-zinc-500">{item.kind === "collecte" ? "Collecte · " : ""}{item.status === "en_route" ? "En route" : "À venir"}</span>
        </button></li>)}
      </ul>
    </div>}
    {!navMode && <div role="tablist" aria-label="Trajets affichés" className="absolute left-3 top-3 z-10 flex flex-wrap gap-2 lg:left-[var(--chips-left)]" style={{ ["--chips-left" as string]: `${leftInset + 12}px` }}>
      {([["tout", "Tout", null, allLines.length], ["navettes", "Navettes", Truck, shuttleLines.length], ["collectes", "Collectes", Recycle, collecteLines.length]] as const).map(([key, label, Icon, count]) => <button key={key} type="button" role="tab" aria-selected={layer === key} onClick={() => setLayer(key)}
        className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold shadow-lg transition-colors ${layer === key ? "bg-zinc-900 text-white ring-2 ring-white/70" : "bg-white text-zinc-800 hover:bg-zinc-100"}`}>
        {Icon && <Icon size={14} />}{label}<span className={`rounded-full px-1.5 text-[11px] tabular-nums ${layer === key ? "bg-white/20" : "bg-zinc-200"}`}>{count}</span>
      </button>)}
    </div>}
    {!navMode && openCollecte && <CollectePanel collecte={openCollecte} color={collecteColor} located={collecteLines.find(item => item.id === openCollecte._id)?.stops} onClose={() => setOpenCollecteId(null)} />}
    {navMode && shuttle && (shuttle.trip ? <TripPanel trip={shuttle.trip} /> : <NavPanel shuttle={shuttle} plan={plan} planning={planning} error={planError} />)}
    {!navMode && <div className="pointer-events-none absolute bottom-3 right-14 flex flex-wrap justify-end gap-2 text-[11px] font-semibold">
      {overviewLines.length > 0
        ? <><span className="flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-white"><span className="h-0.5 w-5 bg-white" />En route</span><span className="flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-white"><span className="w-5 border-t-2 border-dashed border-white" />À venir</span><span className="rounded-full bg-black/70 px-2.5 py-1 text-white">Une couleur par trajet · cliquez un tracé</span></>
        : [[palette.onSite, "À expédier"], [palette.transit, "En transit"], [palette.selected, "Sélection"]].map(([color, label]) => <span key={label} className="flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-white"><span className="h-2 w-4 rounded-full" style={{ backgroundColor: color }} />{label}</span>)}
    </div>}
  </div>;
}

/** Trajet d'un salarié (réservation Mes Outils) : seulement son créneau et le motif. */
function TripPanel({ trip }: { trip: NonNullable<Shuttle["trip"]> }) {
  const start = new Date(trip.start);
  const end = new Date(trip.end);
  const slot = sameDay(start, end)
    ? `De ${time(start)} à ${time(end)}`
    : `Du ${dayLabel(start)} ${time(start)} au ${dayLabel(end)} ${time(end)}`;
  return <div className="absolute right-3 top-16 w-[300px] max-w-[calc(100%-1rem)] rounded-2xl border border-[var(--crm-border)] bg-[color:color-mix(in_srgb,var(--crm-surface)_94%,transparent)] px-4 py-3 text-sm text-zinc-100 shadow-2xl backdrop-blur">
    <p className="flex items-center gap-1.5 text-base font-bold"><Clock size={15} />{slot}</p>
    {trip.purpose && <p className="mt-1 text-xs text-zinc-400">Motif : <span className="text-zinc-200">{trip.purpose}</span></p>}
  </div>;
}

/** Tournée de collecte Recycapp : date, équipe, arrêts dans l'ordre. */
function CollectePanel({ collecte, color, located, onClose }: { collecte: Collecte; color: string; located?: Array<LngLat | null>; onClose: () => void }) {
  const date = new Date(collecte.date);
  const facts = [collecte.driverName, collecte.vehicleName, collecte.distanceMeters ? `${Math.round(collecte.distanceMeters / 1000)} km` : null, collecte.durationSeconds ? duration(collecte.durationSeconds) : null].filter(Boolean);
  return <div className="absolute right-3 top-16 flex max-h-[calc(100%-5rem)] w-[320px] max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-[color:color-mix(in_srgb,var(--crm-surface)_94%,transparent)] text-sm text-zinc-100 shadow-2xl backdrop-blur">
    <div className="flex items-start gap-2 border-b border-[var(--crm-border)] px-4 py-3">
      <span className="mt-1.5 h-1.5 w-6 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400"><Recycle size={13} />Recycapp · {collecte.stops.length > 1 ? `${collecte.stops.length} collectes` : "collecte"} · {collecte.status === "en_cours" ? "en cours" : "à venir"}</p>
        <p className="truncate text-base font-bold">{collecte.label || "Tournée de collecte"}</p>
        <p className="text-xs capitalize text-zinc-400">{dayLabel(date)}</p>
        {facts.length > 0 && <p className="mt-0.5 text-xs text-zinc-300">{facts.join(" · ")}</p>}
      </div>
      <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1 text-zinc-400 hover:bg-[var(--crm-surface-2)] hover:text-zinc-100"><X size={16} /></button>
    </div>
    <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
      {collecte.depotAddress && <li className="flex gap-2.5 rounded-xl px-2 py-1.5"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">D</span><span className="min-w-0 text-xs text-zinc-300">{collecte.depotAddress}</span></li>}
      {collecte.stops.map((stop, index) => <li key={`${stop.order}-${index}`} className="flex gap-2.5 rounded-xl px-2 py-1.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: color }}>{index + 1}</span>
        <span className="min-w-0">
          {(stop.contactName || stop.time) && <span className="block truncate font-semibold">{stop.time ? `${time(new Date(stop.time))} · ` : ""}{stop.contactName}{stop.reference ? <span className="font-normal text-zinc-500"> · {stop.reference}</span> : null}</span>}
          <span className="block text-xs text-zinc-400">{stop.address}</span>
          {stop.status === "effectue" && <span className="text-[11px] font-semibold text-green-500">Effectuée</span>}
          {located && !stop.at && !located[index] && <span className="text-[11px] text-amber-500">Adresse non localisée</span>}
        </span>
      </li>)}
      {collecte.stops.length === 0 && <li className="px-2 py-1.5 text-xs text-zinc-500">Aucun arrêt.</li>}
    </ol>
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
  return <div className="absolute right-3 top-16 flex max-h-[calc(100%-5rem)] w-[340px] max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-[color:color-mix(in_srgb,var(--crm-surface)_94%,transparent)] text-sm text-zinc-100 shadow-2xl backdrop-blur">
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
