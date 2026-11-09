import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Bus, ClipboardList, Menu, Moon, Store, Sun } from "lucide-react";
import { Drawer } from "../ui/Drawer";

/** Recycapp layout, with navigation specific to Meslogistic. */
const SEEN_KEY = "meslogistic:demandes-seen-at";
function readSeen() {
  try { const value = Number(localStorage.getItem(SEEN_KEY)); return Number.isFinite(value) && value > 0 ? value : null; } catch { return null; }
}
function writeSeen(value: number) {
  try { localStorage.setItem(SEEN_KEY, String(value)); } catch { /* préférence locale facultative */ }
}

export function CrmShell({ isDark, onToggleTheme, account, canRead, children }: {
  isDark: boolean; onToggleTheme: () => void; account: ReactNode; canRead: boolean; children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Pastille comme dans le CRM Recycapp : nouvelles demandes arrivées depuis la
  // dernière visite de la page Demandes. Elle disparaît et se remet à zéro dès
  // que la page est ouverte.
  const { pathname } = useLocation();
  const onDemandes = pathname === "/";
  const requests = useQuery(api.meslogistic.list, canRead ? {} : "skip");
  const [seenAt, setSeenAt] = useState<number>(() => { const saved = readSeen(); if (saved) return saved; const now = Date.now(); writeSeen(now); return now; });
  useEffect(() => {
    if (!onDemandes) return;
    const latest = Math.max(Date.now(), ...(requests ?? []).map(request => request.createdAt));
    writeSeen(latest);
    setSeenAt(latest);
  }, [onDemandes, requests]);
  const pending = onDemandes ? 0 : (requests ?? []).filter(request => request.createdAt > seenAt && request.status !== "annulee").length;
  const brand = <a href="/" className="flex min-w-0 items-center text-lg font-bold tracking-tight" aria-label="Meslogistic — accueil">Meslogistic</a>;
  const links = [{ to: "/", label: "Demandes", icon: ClipboardList }, { to: "/navettes", label: "Navettes", icon: Bus }];
  const navigation = <>{links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end onClick={() => setMenuOpen(false)} className={({ isActive }) => `grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "border-brand-500 bg-brand-600/15 text-brand-300" : "border-transparent text-zinc-400 hover:bg-[var(--crm-surface-2)] hover:text-zinc-100"}`}><Icon className="h-5 w-5 shrink-0 justify-self-center" /><span className="min-w-0 truncate">{label}</span>{to === "/" && (pending ?? 0) > 0 ? <span aria-label={`${pending} nouvelle${pending! > 1 ? "s" : ""} demande${pending! > 1 ? "s" : ""}`} className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">{pending}</span> : null}</NavLink>)}</>;
  const footer = <>
    <a href="https://batire.groupemes.fr" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-[var(--crm-surface-2)] hover:text-zinc-100"><Store className="h-4 w-4 shrink-0" /><span className="truncate">Retour à la boutique</span></a>
    {account}
    <button type="button" onClick={onToggleTheme} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-[var(--crm-surface-2)] hover:text-zinc-100">{isDark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}<span>{isDark ? "Basculer en mode clair" : "Basculer en mode sombre"}</span></button>
  </>;
  return <div className={isDark ? "dark" : "crm-light"}>
    <div className="flex min-h-screen bg-[var(--crm-bg)] text-zinc-100 transition-colors duration-200">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[var(--crm-border)] bg-[var(--crm-surface)] lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-[var(--crm-border)] px-5">{brand}</div>
        <nav aria-label="Navigation principale" className="flex-1 space-y-1 overflow-y-auto p-3">{navigation}</nav>
        <div className="space-y-2 border-t border-[var(--crm-border)] p-3">{footer}</div>
      </aside>
      <div className="min-w-0 flex-1 lg:pl-64">
        <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--crm-border)] bg-[color:color-mix(in_srgb,var(--crm-bg)_92%,transparent)] px-4 backdrop-blur lg:hidden">
          <button type="button" aria-label="Ouvrir le menu" onClick={() => setMenuOpen(true)} className="rounded-lg p-2 text-zinc-300 hover:bg-[var(--crm-surface-2)] hover:text-zinc-100"><Menu className="h-5 w-5" /></button>
          {brand}
        </div>
        <main>{children}</main>
      </div>
    </div>
    <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} variant="left" title="Navigation" bodyClassName="p-3"><nav aria-label="Navigation mobile" className="space-y-2">{navigation}<div className="mt-1 space-y-2 border-t border-[var(--crm-border)] pt-1">{footer}</div></nav></Drawer>
  </div>;
}
