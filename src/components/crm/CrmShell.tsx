import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Bus, ClipboardList, Grid3x3, House, Kanban, Menu, Moon, PanelLeftClose, PanelLeftOpen, Route, Store, Sun } from "lucide-react";
import { Drawer } from "../ui/Drawer";

/** Recycapp layout, with navigation specific to Meslogistic. */
const SEEN_KEY = "meslogistic:demandes-seen-at";
function readSeen() {
  try { const value = Number(localStorage.getItem(SEEN_KEY)); return Number.isFinite(value) && value > 0 ? value : null; } catch { return null; }
}
const COLLAPSED_KEY = "meslogistic:sidebar-collapsed";
function readCollapsed() {
  try { return localStorage.getItem(COLLAPSED_KEY) === "1"; } catch { return false; }
}
function writeSeen(value: number) {
  try { localStorage.setItem(SEEN_KEY, String(value)); } catch { /* préférence locale facultative */ }
}

export function CrmShell({ isDark, onToggleTheme, account, canRead, children }: {
  isDark: boolean; onToggleTheme: () => void; account: ReactNode; canRead: boolean; children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Barre latérale réduite aux icônes (bureau), mémorisée sur ce poste.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleCollapsed = () => setCollapsed(current => { const next = !current; try { localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0"); } catch { /* préférence locale facultative */ } return next; });
  // Pastille comme dans le CRM Recycapp : nouvelles demandes arrivées depuis la
  // dernière visite de la page Demandes. Elle disparaît et se remet à zéro dès
  // que la page est ouverte.
  const { pathname } = useLocation();
  const onDemandes = pathname === "/demandes";
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
  const links = [{ to: "/", label: "Accueil", icon: House }, { to: "/demandes", label: "Demandes", icon: ClipboardList }, { to: "/v2", label: "Demandes v2", icon: Route }, { to: "/v3", label: "Demandes v3", icon: Grid3x3 }, { to: "/navettes", label: "Navettes", icon: Bus }, { to: "/navettes-v2", label: "Navettes v2", icon: Kanban }];
  const renderNavigation = (compact: boolean) => <>{links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end onClick={() => setMenuOpen(false)} title={compact ? label : undefined} aria-label={compact ? label : undefined} className={({ isActive }) => `${compact ? "relative flex justify-center" : "grid grid-cols-[20px_minmax(0,1fr)_auto] gap-3"} items-center rounded-lg border-l-2 px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "border-brand-500 bg-brand-600/15 text-brand-300" : "border-transparent text-zinc-400 hover:bg-[var(--crm-surface-2)] hover:text-zinc-100"}`}><Icon className="h-5 w-5 shrink-0 justify-self-center" />{!compact && <span className="min-w-0 truncate">{label}</span>}{to === "/demandes" && (pending ?? 0) > 0 ? compact ? <span aria-label={`${pending} nouvelle${pending! > 1 ? "s" : ""} demande${pending! > 1 ? "s" : ""}`} className="absolute right-1.5 top-1 min-w-4 rounded-full bg-brand-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">{pending}</span> : <span aria-label={`${pending} nouvelle${pending! > 1 ? "s" : ""} demande${pending! > 1 ? "s" : ""}`} className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">{pending}</span> : null}</NavLink>)}</>;
  const navigation = renderNavigation(false);
  const renderFooter = (compact: boolean) => compact ? <>
    <a href="https://batire.groupemes.fr" title="Retour à la boutique" aria-label="Retour à la boutique" className="flex w-full justify-center rounded-lg px-3 py-2.5 text-zinc-400 transition-colors hover:bg-[var(--crm-surface-2)] hover:text-zinc-100"><Store className="h-4 w-4" /></a>
    <div className="flex justify-center [&_p]:hidden [&>div]:gap-0 [&>div]:bg-transparent [&>div]:p-1">{account}</div>
    <button type="button" onClick={onToggleTheme} title={isDark ? "Basculer en mode clair" : "Basculer en mode sombre"} aria-label={isDark ? "Basculer en mode clair" : "Basculer en mode sombre"} className="flex w-full justify-center rounded-lg px-3 py-2.5 text-zinc-400 transition-colors hover:bg-[var(--crm-surface-2)] hover:text-zinc-100">{isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
  </> : <>
    <a href="https://batire.groupemes.fr" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-[var(--crm-surface-2)] hover:text-zinc-100"><Store className="h-4 w-4 shrink-0" /><span className="truncate">Retour à la boutique</span></a>
    {account}
    <button type="button" onClick={onToggleTheme} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-[var(--crm-surface-2)] hover:text-zinc-100">{isDark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}<span>{isDark ? "Basculer en mode clair" : "Basculer en mode sombre"}</span></button>
  </>;
  const footer = renderFooter(false);
  const collapseButton = <button type="button" onClick={toggleCollapsed} title={collapsed ? "Déplier le menu" : "Réduire le menu"} aria-label={collapsed ? "Déplier le menu" : "Réduire le menu"} className="shrink-0 rounded-lg p-2 text-zinc-400 transition-colors hover:bg-[var(--crm-surface-2)] hover:text-zinc-100">{collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}</button>;
  return <div className={isDark ? "dark" : "crm-light"}>
    <div className="flex min-h-screen bg-[var(--crm-bg)] text-zinc-100 transition-colors duration-200">
      <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-[var(--crm-border)] bg-[var(--crm-surface)] transition-[width] duration-200 lg:flex ${collapsed ? "w-[72px]" : "w-64"}`}>
        <div className={`flex h-16 items-center border-b border-[var(--crm-border)] ${collapsed ? "justify-center px-2" : "justify-between gap-2 pl-5 pr-3"}`}>{!collapsed && brand}{collapseButton}</div>
        <nav aria-label="Navigation principale" className={`flex-1 space-y-1 overflow-y-auto overflow-x-hidden ${collapsed ? "p-2" : "p-3"}`}>{renderNavigation(collapsed)}</nav>
        <div className={`space-y-2 border-t border-[var(--crm-border)] ${collapsed ? "p-2" : "p-3"}`}>{renderFooter(collapsed)}</div>
      </aside>
      <div className={`min-w-0 flex-1 transition-[padding] duration-200 ${collapsed ? "lg:pl-[72px]" : "lg:pl-64"}`}>
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
