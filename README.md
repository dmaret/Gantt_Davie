# Atelier — Planification

Application web de planification pour atelier multi-sites : personnes, projets, machines, lieux de production, stockages, stocks, déplacements, commandes.

## Utilisation

**Option 1 — local (aucune installation)**
Ouvrir `index.html` par double-clic dans le navigateur. Les données sont sauvegardées dans le `localStorage` du navigateur. Utiliser les boutons **Exporter / Importer** en haut à droite pour des sauvegardes JSON.

**Option 2 — serveur web institutionnel**
Copier tous les fichiers (`index.html`, `styles.css`, `app.js`, `data.js`, dossier `views/`) sur n'importe quel serveur statique (IIS, Apache, Nginx, etc.). Aucune dépendance serveur — rien à installer.

## Données

Le jeu de démonstration contient :
- **70 personnes** avec rôles, compétences, lieu principal, capacité hebdomadaire
- **7 lieux de production** répartis sur 3 étages (2e, 1er, Rez)
- **12 zones de stockage** (Rez arrivages & expédition, sous-sol tampon & archives, 1er matières/consommables/outillage, 2e matières/consommables/prototypes, produits chimiques)
- **10 machines** (CNC, laser, plieuses, soudure, peinture, montage, test)
- **6 projets** en parallèle avec tâches générées automatiquement et jalons
- **12 articles de stock** avec seuils d'alerte et projets liés
- **Commandes** avec workflow de validation **4A**

## Modules

| Onglet | Contenu |
|---|---|
| **Tableau de bord** | KPI, conflits, prochaines tâches, déplacements à venir, charge par lieu |
| **Gantt** | Vue chronologique, regroupement par projet / personne / machine / lieu, glisser-déposer pour replanifier, barres colorées par projet, jalons en losange, conflits en rouge |
| **Personnes** | Annuaire, compétences, charge sur 7 jours |
| **Lieux** | Production + stockages arborescents par étage |
| **Projets** | Cartes projet avec avancement, priorité, retard éventuel |
| **Stock** | Articles, seuils d'alerte, stockage, projets liés |
| **Déplacements** | Mouvements entre sites, personnes, motifs |
| **Commandes** | Saisie, workflow **4A n'engage pas la commande** |

## Règle « 4A n'engage pas la commande »

Une commande doit être validée par les **4 axes obligatoires** avant engagement :

- **A1** — Chef de projet
- **A2** — Logistique
- **A3** — Direction technique
- **A4** — Contrôle budget

Tant que les 4 ne sont pas cochés, le bouton **Engager** n'apparaît pas et la commande reste bloquée avec le badge « bloquée ». Les axes peuvent être cochés/décochés depuis la liste des commandes ou le formulaire d'édition. Si une validation est retirée après engagement, la commande repasse en attente.

Les intitulés des axes sont configurables dans le JSON (`state.regle4A.axes`).

## Détection de conflits (automatique)

- **Personnes** : même personne assignée à des tâches qui se chevauchent
- **Machines** : même machine utilisée simultanément
- **Stock** : articles sous le seuil d'alerte
- **Commandes** : demandes sans validation 4A complète

Les tâches en conflit apparaissent cerclées de rouge dans le Gantt.

## Données & sauvegardes

- Toutes les données sont stockées dans `localStorage` (clé `atelier_plan_v1`).
- **Exporter** télécharge un fichier JSON daté (`atelier-plan-YYYY-MM-DD.json`).
- **Importer** remplace les données par le contenu d'un fichier JSON.
- **Reset** recharge le jeu de démonstration.

## Extensions possibles (non livrées)

- Authentification multi-utilisateur (nécessite un backend)
- Impression PDF du Gantt
- Notifications/rappels par e-mail
- Intégration API avec un ERP existant
- Historique/journal des modifications
