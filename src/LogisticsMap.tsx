import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPinOff } from "lucide-react";
import { shortLocation, type Request } from "./Demandes";
import { ON_SITE_COLOR, TRANSIT_COLOR } from "./components/crm/LogisticsCard";

const TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;
type LngLat = [number, number];

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
export function LogisticsMap({ requests, selected, place, onPlace, isDark }: {
  requests: Request[]; selected?: Request | null; place: string | null; onPlace: (place: string | null) => void; isDark: boolean;
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
    source.setData({ type: "FeatureCollection", features });
  }, [ready, links, roads, coords]);

  // Repères des lieux.
  const selectedPlaces = selected ? [shortLocation(selected.origin), shortLocation(selected.destination)] : [];
  const selectedKey = selectedPlaces.join("|");
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    markers.current.forEach(marker => marker.remove());
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
  }, [ready, places, coords, place, selectedKey, onPlace]);

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
    <div className="pointer-events-none absolute right-2 top-2 flex flex-wrap justify-end gap-2 text-[11px] font-semibold">
      {[[ON_SITE_COLOR, "À expédier"], [TRANSIT_COLOR, "En transit"], [SELECTED_COLOR, "Sélection"]].map(([color, label]) => <span key={label} className="flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-white"><span className="h-2 w-4 rounded-full" style={{ backgroundColor: color }} />{label}</span>)}
    </div>
  </div>;
}
