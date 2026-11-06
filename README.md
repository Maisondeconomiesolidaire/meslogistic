# Meslogistic

Application de suivi des navettes Bâtire. Elle reprend les composants et le style de la page Demandes de Recycapp.

La feuille de styles, la police Geist, les boutons, champs, onglets, en-têtes et colonnes Kanban sont repris de Recycapp. La navigation utilise le même gabarit (barre latérale de 256 px, menu mobile, thèmes clair et sombre). Les libellés et les étapes restent propres au transport.

## Fonctionnement

Une réservation Bâtire ou une commande payée avec un lieu de retrait différent du dépôt crée automatiquement une demande par ligne de commande. Si le dépôt est inconnu, une demande est créée avec un départ à préciser. Les demandes créées avant l’installation ne sont pas importées automatiquement. Le parcours permet de préparer les objets, de déclarer le transit puis de confirmer leur réception. Une fiche manuelle peut également être créée.

Chaque étape et chaque modification d’organisation est enregistrée dans l’historique. Les accès `meslogistic:demandes` (lecture, création, modification) sont administrés dans Mes Outils. L’application utilise le déploiement Convex et l’instance Clerk partagés du groupe.

Les cartes sont des transferts, distincts des navettes : une même navette peut être affectée à plusieurs retraits et plusieurs commandes. La réception cumulée est enregistrée par transfert ; un lot partiellement reçu reste en transit. Les retraits sans transfert et la confirmation « prêt à retirer » sont gérés dans le CRM Bâtire.

## Installation frontend

```sh
npm ci
npm run dev
npm run build
```

Renseigner `VITE_CONVEX_URL` et `VITE_CLERK_PUBLISHABLE_KEY` dans `.env.local` ou dans l’environnement du projet Vercel. Utiliser impérativement la clé publique Clerk **de production** commune aux applications et `https://hip-marten-394.eu-west-1.convex.cloud`. Clerk peut refuser l’authentification sur localhost avec cette clé : le flux connecté doit être vérifié depuis un sous-domaine `groupemes.fr` autorisé.

## Backend et mise en ligne

Le backend est canonique dans `mes-outils/convex/` ; `convex/` ici est une copie en lecture seule. Respecter les instructions `AGENTS.md`, notamment pour la synchronisation et tout déploiement Convex. Le frontend vise `meslogistic.groupemes.fr` ; la configuration Vercel, le DNS et les droits utilisateurs doivent être mis en place avant utilisation.

Les ajouts au backend et aux droits Mes Outils doivent être déployés avant que l’application puisse fonctionner avec les données réelles. Ne jamais tester les mutations contre la production ; les tests du backend dans Mes Outils utilisent `convex-test`.
