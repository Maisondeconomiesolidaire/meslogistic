import { shortLocation } from "./Demandes";
import type { Shuttle } from "./ShuttleBoard";
import type { NavPlan } from "./shuttleRoute";

const STATUS_LABEL: Record<Shuttle["status"], string> = { planifiee: "Nouveau", en_route: "En transit", terminee: "Terminée" };
const longDay = (date: Date) => date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]!);

type Row = Shuttle["transits"][number];
/** Où se trouve l'objet en ce moment. */
function whereNow(row: Row) {
  if (row.status === "receptionnee") return `Livré à ${shortLocation(row.destination)}`;
  if (row.status === "en_transit") return "Dans la navette";
  return `${row.loadedAt ? "Chargé" : "À charger"} · ${shortLocation(row.origin)}`;
}

/**
 * Feuille de route imprimable d'une navette : lieu de départ, arrêts et lieu
 * d'arrivée (sans carte ni horaires), puis les objets avec photo, provenance et destination.
 */
export function printShuttle(shuttle: Shuttle, plan: NavPlan | null) {
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) { window.alert("Autorisez les fenêtres pop-up pour imprimer la feuille de route."); return; }

  const scheduled = new Date(`${shuttle.scheduledDate}T12:00:00`);
  // Arrêts dans l'ordre optimisé (sinon : départ, puis lieux de chargement et de livraison).
  const names = plan ? plan.stops.map(stop => ({ name: stop.name, pickups: stop.pickups, drops: stop.drops })) : (() => {
    const list: { name: string; pickups: string[]; drops: string[] }[] = [];
    const at = (name: string) => { let stop = list.find(item => item.name === name); if (!stop) { stop = { name, pickups: [], drops: [] }; list.push(stop); } return stop; };
    if (shuttle.origin) at(shortLocation(shuttle.origin));
    for (const row of shuttle.transits) at(shortLocation(row.origin)).pickups.push(`${row.quantity} ${row.unit} · ${row.title}`);
    for (const row of shuttle.transits) at(shortLocation(row.destination)).drops.push(`${row.quantity} ${row.unit} · ${row.title}`);
    return list;
  })();
  const last = names.length - 1;
  const stops = names.map((stop, index) => `<tr>
      <td class="num"><span class="badge ${index === 0 ? "start" : index === last ? "end" : ""}">${index === 0 ? "D" : index}</span></td>
      <td><div class="kind">${index === 0 ? "Départ" : index === last ? "Arrivée" : `Arrêt ${index}`}</div><strong>${escape(stop.name)}</strong>
        ${stop.pickups.length ? `<div class="sub">Charger : ${stop.pickups.map(escape).join(", ")}</div>` : ""}
        ${stop.drops.length ? `<div class="sub">Livrer : ${stop.drops.map(escape).join(", ")}</div>` : ""}</td>
    </tr>`).join("");

  const objects = shuttle.transits.map(row => `<tr>
      <td class="photo">${row.photoUrl ? `<img src="${escape(row.photoUrl)}" alt="" />` : `<div class="nophoto"></div>`}</td>
      <td><strong>${escape(`${row.quantity} ${row.unit} · ${row.title}`)}</strong>${row.reference ? `<div class="sub">${escape(row.reference)}</div>` : ""}</td>
      <td>${escape(shortLocation(row.origin))}</td>
      <td>${escape(shortLocation(row.destination))}</td>
      <td>${escape(whereNow(row))}</td>
    </tr>`).join("");

  win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8" /><title>Feuille de route · ${escape(shuttle.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 22px; margin: 0; } h2 { font-size: 15px; margin: 24px 0 8px; text-transform: uppercase; letter-spacing: .06em; }
  .muted, .sub { color: #555; } .sub { font-size: 12px; margin-top: 2px; }
  .meta { margin-top: 4px; color: #333; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border-bottom: 1px solid #ddd; padding: 8px 6px; vertical-align: top; text-align: left; }
  th { font-size: 11px; text-transform: uppercase; color: #555; }
  tr { break-inside: avoid; }
  .num { width: 36px; } .badge { display: inline-flex; width: 26px; height: 26px; border-radius: 50%; align-items: center; justify-content: center; background: #1e40af; color: #fff; font-weight: 700; }
  .badge.start { background: #059669; } .badge.end { background: #111; }
  .kind { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #555; }
  .photo { width: 76px; } .photo img, .nophoto { width: 64px; height: 64px; object-fit: cover; border-radius: 8px; background: #eee; display: block; }
  @media print { body { margin: 12mm; } }
</style></head><body>
  <h1>${escape(shuttle.name)}</h1>
  <p class="meta">${STATUS_LABEL[shuttle.status]} · ${longDay(scheduled)}${shuttle.origin ? ` · Départ : ${escape(shortLocation(shuttle.origin))}` : ""} · ${shuttle.transits.length} objet${shuttle.transits.length > 1 ? "s" : ""}</p>
  ${names.length ? `<h2>Itinéraire</h2><table><tbody>${stops}</tbody></table>` : ""}
  <h2>Objets</h2>
  ${shuttle.transits.length ? `<table><thead><tr><th></th><th>Objet</th><th>De</th><th>Vers</th><th>Où il est</th></tr></thead><tbody>${objects}</tbody></table>` : `<p class="muted">Aucun objet dans cette navette.</p>`}
  <script>
    const imgs = Array.from(document.images);
    Promise.all(imgs.map(img => img.complete ? null : new Promise(done => { img.onload = img.onerror = done; }))).then(() => { window.focus(); window.print(); });
  </script>
</body></html>`);
  win.document.close();
}
