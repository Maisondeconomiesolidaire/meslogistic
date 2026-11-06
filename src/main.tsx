import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { frFR } from "@clerk/localizations";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import App from "./App";
import { MissingConfig } from "./components/MissingConfig";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

// Lorsqu'un onglet reste ouvert pendant un redéploiement, les anciens chunks
// hashés disparaissent du serveur : tout import dynamique (ex. le détourage via
// @imgly/background-removal) échoue alors avec « Failed to fetch dynamically
// imported module ». On recharge une seule fois pour récupérer les assets frais.
window.addEventListener("vite:preloadError", () => {
  // Garde-fou anti-boucle : on ne recharge pas plus d'une fois toutes les 10 s.
  const last = Number(sessionStorage.getItem("preload-error-reload-at") ?? 0);
  if (Date.now() - last < 10_000) return;
  sessionStorage.setItem("preload-error-reload-at", String(Date.now()));
  window.location.reload();
});

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const root = createRoot(document.getElementById("root")!);

const missing: string[] = [];
if (!convexUrl) missing.push("VITE_CONVEX_URL");
if (!clerkKey || clerkKey.includes("REMPLACER")) {
  missing.push("VITE_CLERK_PUBLISHABLE_KEY");
}

if (missing.length > 0) {
  // Les clés ne sont pas encore configurées : on affiche les instructions de setup
  // plutôt que de planter au démarrage.
  root.render(
    <StrictMode>
      <MissingConfig missing={missing} />
    </StrictMode>,
  );
} else {
  const convex = new ConvexReactClient(convexUrl);
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <ClerkProvider
          publishableKey={clerkKey}
          localization={frFR}
          appearance={{ variables: { colorPrimary: "#ff7700" } }}
          signInUrl="/connexion"
          signUpUrl="/inscription"
        >
          <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ConvexProviderWithClerk>
        </ClerkProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
