import { useEffect, useState } from "react";
import { SignedIn, SignedOut, UserButton, useUser } from "@clerk/clerk-react";
import { useConvexAuth, useQuery } from "convex/react";
import { Navigate, useLocation } from "react-router-dom";
import { CrmShell } from "./components/crm/CrmShell";
import { api } from "../convex/_generated/api";
import { AuthSwitch } from "./components/ui/auth-switch";
import { FullSpinner } from "./components/ui/Spinner";
import { Demandes } from "./Demandes";
export default function App() {
  const location = useLocation();
  const auth = location.pathname === "/connexion" || location.pathname === "/inscription";
  if (auth) return <AuthSwitch appName="Meslogistic" welcomeTitle="Le bon objet, au bon endroit." signinSubtitle="Connectez-vous pour suivre les navettes et déplacements Bâtire." redirectUrl="/" initialMode={location.pathname === "/inscription" ? "signup" : "signin"} homeHref="https://mesoutils.groupemes.fr" homeLabel="Mes Outils" />;
  return <><SignedOut><Navigate to="/connexion" replace /></SignedOut><SignedIn><Workspace /></SignedIn></>;
}
function Workspace() {
  const { user } = useUser();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const access = useQuery(api.permissions.myAccess, isAuthenticated ? {} : "skip");
  const [light, setLight] = useState(() => localStorage.getItem("meslogistic-theme") === "light");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", !light);
    document.documentElement.classList.toggle("crm-light", light);
    document.body.classList.toggle("dark", !light);
    document.body.classList.toggle("crm-light", light);
    return () => { document.documentElement.classList.remove("dark", "crm-light"); document.body.classList.remove("dark", "crm-light"); };
  }, [light]);
  if (isLoading || !access) return <FullSpinner label="Connexion à Meslogistic…" />;
  const can = (action: string) => access.isAdmin || access.bootstrapMode || (access.isStaff && access.grants.some(g => g.pageKey === "meslogistic:demandes" && g.actions.includes(action)));
  const account = <div className="flex items-center gap-3 rounded-lg bg-[var(--crm-surface-2)] px-3 py-2"><UserButton appearance={{ elements: { avatarBox: "h-9 w-9" } }} /><div className="min-w-0"><p className="truncate text-sm font-medium">{user?.fullName ?? user?.primaryEmailAddress?.emailAddress}</p><p className="truncate text-xs text-zinc-500">{user?.primaryEmailAddress?.emailAddress}</p></div></div>;
  return <CrmShell isDark={!light} onToggleTheme={() => { localStorage.setItem("meslogistic-theme", light ? "dark" : "light"); setLight(!light); }} account={account}>
    {can("read") ? <Demandes canCreate={can("create")} canUpdate={can("update")} /> : <div className="p-10"><h1 className="text-xl font-bold">Accès aux demandes requis</h1><p className="mt-3 text-zinc-500">Votre administrateur peut vous attribuer les droits Meslogistic depuis Mes Outils.</p><a className="mt-4 inline-block text-brand-500" href="https://mesoutils.groupemes.fr">Ouvrir Mes Outils</a></div>}
  </CrmShell>;
}
