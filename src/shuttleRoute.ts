import { shortLocation } from "./Demandes";
import type { Shuttle } from "./ShuttleBoard";

export type LngLat = [number, number];
export type NavStop = { name: string; at: LngLat; arrival: Date; legSeconds: number; pickups: string[]; drops: string[] };
export type NavPlan = { stops: NavStop[]; line: LngLat[]; seconds: number; meters: number; start: Date; estimatedStart: boolean; end: Date };

const TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;
/** Heure de départ supposée d'une navette prévue un autre jour. */
export const DEFAULT_START_HOUR = 8;
const MAX_EXACT = 8;

const isoToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };

/** Objets encore à transporter par la navette, selon son statut. */
function rowsToCarry(shuttle: Shuttle) {
  if (shuttle.status === "en_route") return shuttle.transits.filter(row => row.status === "en_transit");
  if (shuttle.status === "planifiee") return shuttle.transits.filter(row => row.status === "a_preparer");
  return shuttle.transits;
}

/** Clé qui change dès que l'itinéraire de la navette doit être recalculé. */
export const routeKey = (shuttle: Shuttle) => [shuttle._id, shuttle.status, shuttle.origin ?? "", shuttle.scheduledDate, shuttle.departedAt ?? "", ...rowsToCarry(shuttle).map(row => `${row._id}:${row.status}:${row.origin}>${row.destination}`)].join("|");

/** Lieux à géocoder pour la navette (nom court → libellé brut). */
export function shuttlePlaces(shuttle: Shuttle) {
  const places = new Map<string, string>();
  const add = (raw?: string) => { if (raw) places.set(shortLocation(raw), raw); };
  add(shuttle.origin);
  for (const row of rowsToCarry(shuttle)) { add(row.origin); add(row.destination); }
  return places;
}

/**
 * Itinéraire optimal de la navette : départ du lieu de départ de la navette, puis
 * chaque lieu de chargement et de livraison, en chargeant un objet avant de le
 * livrer. Durées réelles Mapbox (matrice), ordre exact par permutations (≤ 8 lieux),
 * puis tracé et temps de chaque étape par Mapbox Directions.
 */
export async function planShuttle(shuttle: Shuttle, coordsOf: (raw: string) => Promise<LngLat | null>): Promise<NavPlan> {
  if (!TOKEN) throw new Error("Carte indisponible : jeton Mapbox manquant.");
  const rows = rowsToCarry(shuttle);
  const startRaw = shuttle.origin ?? rows[0]?.origin;
  if (!startRaw) throw new Error("Renseignez le lieu de départ de la navette ou ajoutez des objets.");
  const startName = shortLocation(startRaw);
  const loaded = shuttle.status !== "planifiee";
  const tasks = rows.map(row => ({ title: `${row.quantity} ${row.unit} · ${row.title}`, from: shortLocation(row.origin), to: shortLocation(row.destination), rawFrom: row.origin, rawTo: row.destination }))
    .map(task => ({ ...task, pickupAtStart: loaded || task.from === startName }));

  // Lieux à visiter après le départ.
  const raws = new Map<string, string>([[startName, startRaw]]);
  const nodes: string[] = [];
  const need = (name: string, raw: string) => { raws.set(name, raw); if (!nodes.includes(name)) nodes.push(name); };
  for (const task of tasks) {
    if (task.from === task.to) continue;
    if (!task.pickupAtStart) need(task.from, task.rawFrom);
    need(task.to, task.rawTo);
  }

  const points: LngLat[] = [];
  for (const name of [startName, ...nodes]) {
    const found = await coordsOf(raws.get(name)!);
    if (!found) throw new Error(`Lieu introuvable sur la carte : ${name}`);
    points.push(found);
  }

  // Heure de départ.
  const today = isoToday();
  let start = new Date(); let estimatedStart = false;
  if (shuttle.status !== "planifiee" && shuttle.departedAt) start = new Date(shuttle.departedAt);
  else if (shuttle.status === "planifiee" && shuttle.scheduledDate > today) { start = new Date(`${shuttle.scheduledDate}T${String(DEFAULT_START_HOUR).padStart(2, "0")}:00:00`); estimatedStart = true; }

  let order = nodes.map((_, index) => index + 1);
  if (nodes.length > 1) {
    const matrixUrl = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${points.map(point => point.join(",")).join(";")}?annotations=duration&access_token=${TOKEN}`;
    const matrix = await fetch(matrixUrl).then(response => response.ok ? response.json() : null) as { durations?: (number | null)[][] } | null;
    const durations = matrix?.durations;
    if (durations && nodes.length <= MAX_EXACT) {
      const position = (name: string, sequence: number[]) => sequence.findIndex(index => nodes[index - 1] === name);
      const valid = (sequence: number[]) => tasks.every(task => task.pickupAtStart || task.from === task.to || position(task.from, sequence) < position(task.to, sequence));
      let best: number[] | null = null; let bestCost = Infinity;
      const permute = (prefix: number[], rest: number[], cost: number) => {
        if (cost >= bestCost) return;
        if (!rest.length) { if (valid(prefix)) { best = prefix; bestCost = cost; } return; }
        const last = prefix.length ? prefix[prefix.length - 1] : 0;
        rest.forEach((next, index) => permute([...prefix, next], [...rest.slice(0, index), ...rest.slice(index + 1)], cost + (durations[last]?.[next] ?? Infinity)));
      };
      permute([], order, 0);
      if (best) order = best;
    }
  }

  const route = [0, ...order];
  let line: LngLat[] = route.map(index => points[index]);
  let legs: { duration: number; distance: number }[] = route.slice(1).map(() => ({ duration: 0, distance: 0 }));
  let seconds = 0; let meters = 0;
  if (route.length > 1) {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${route.map(index => points[index].join(",")).join(";")}?geometries=geojson&overview=full&alternatives=false&access_token=${TOKEN}`;
    const data = await fetch(url).then(response => response.ok ? response.json() : null) as { routes?: { duration: number; distance: number; geometry: { coordinates: LngLat[] }; legs: { duration: number; distance: number }[] }[] } | null;
    const best = data?.routes?.[0];
    if (!best) throw new Error("Itinéraire Mapbox indisponible pour le moment.");
    line = best.geometry.coordinates; legs = best.legs; seconds = best.duration; meters = best.distance;
  }

  let elapsed = 0;
  const stops: NavStop[] = route.map((index, step) => {
    const name = index === 0 ? startName : nodes[index - 1];
    const legSeconds = step === 0 ? 0 : legs[step - 1]?.duration ?? 0;
    elapsed += legSeconds;
    return {
      name, at: points[index], arrival: new Date(start.getTime() + elapsed * 1000), legSeconds,
      pickups: tasks.filter(task => step === 0 ? task.pickupAtStart && !loaded : !task.pickupAtStart && task.from === name).map(task => task.title),
      drops: step === 0 ? [] : tasks.filter(task => task.to === name && task.from !== task.to).map(task => task.title),
    };
  });
  return { stops, line, seconds, meters, start, estimatedStart, end: new Date(start.getTime() + seconds * 1000) };
}
