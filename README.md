# Atelier — Planification

Application web de planification pour atelier multi-sites. Personnes, projets, machines, lieux de production, zones de stockage, stocks, BOM, déplacements, commandes avec workflow de validation 4A, prédictions et simulations.

**Zéro dépendance. Zéro installation. Un navigateur suffit.**

## Démarrage

**Option 1 — local (recommandé)**
Double-cliquer sur `index.html`. L'application s'ouvre dans le navigateur. Les données sont sauvegardées dans le `localStorage` (persistance locale au navigateur).

**Option 2 — serveur statique**
Copier `index.html`, `styles.css`, `app.js`, `data.js` et le dossier `views/` sur n'importe quel serveur statique (IIS, Apache, Nginx, GitHub Pages, Netlify…). Aucune configuration côté serveur.

**Option 3 — GitHub Pages**
Cette app est déployée automatiquement depuis la branche `main`.

## Modules (13 vues)

| Raccourci | Onglet | Contenu |
|:-:|---|---|
| `D` | Tableau de bord | KPI, conflits, alertes proactives, prédiction fin de projet, prochaines tâches, charge par lieu |
| `G` | Gantt | Vue chronologique, regroupement par projet / personne / machine / lieu, glisser-déposer, dépendances SVG, chemin critique, cascade automatique |
| `C` | Calendrier | Vues mois / semaine, événements colorés par projet, modale détaillée au clic |
| `P` | Personnes | Annuaire, compétences, charge glissante 4 semaines, suggestions d'affectation |
| `L` | Lieux | Production + stockages arborescents par étage |
| `M` | Machines | 10 machines, charge 7 jours, conflits, CRUD, export CSV |
| `J` | Projets | Cartes projet, avancement, priorité, retard |
| `S` | Stock | Articles, seuils d'alerte, stockage, projets liés |
| `B` | BOM | Bill of Materials : besoin projet ↔ solde stock, ruptures prévues |
| `V` | Déplacements | Mouvements entre sites, personnes, motifs |
| `O` | Commandes | Workflow 4A, TVA suisse, historique signé et horodaté |
| `X` | Capacité | Heatmap capacité sur 8 / 12 / 24 semaines (par lieu, machine ou personne) |
| `W` | What-if | Snapshot, modifications, diff, commit ou rollback |

## Fonctionnalités clés

### Planification intelligente
- **Dépendances visuelles** (SVG) entre tâches avec flèches orientées
- **Chemin critique** calculé par DP sur DAG pondéré, surligné en rouge
- **Cascade automatique** : déplacer une tâche décale ses dépendantes
- **Suggestions d'affectation** : score combinant compétence (+100), charge (-5/h), proximité géographique (+10)
- **Prédiction fin de projet** par ratio de vélocité (temps consommé / avancement)
- **Alertes proactives** : stock vs BOM, conflits machine, surcharge personne, retard projet

### Workflow 4A (« 4A n'engage pas la commande »)
Une commande doit être validée par les 4 axes obligatoires avant engagement :

- **A1** — Chef de projet
- **A2** — Logistique
- **A3** — Direction technique
- **A4** — Contrôle budget

Tant que les 4 cases ne sont pas cochées, le bouton **Engager** reste inaccessible. Chaque cochage/décochage est **journalisé** (valideur + horodatage ISO). Les intitulés sont personnalisables dans `state.regle4A.axes`.

### Détection de conflits (automatique)
- **Personnes** — même personne sur des tâches qui se chevauchent
- **Machines** — même machine utilisée simultanément
- **Stock** — articles sous le seuil d'alerte
- **Commandes** — demandes sans validation 4A complète

Les tâches en conflit sont cerclées de rouge dans le Gantt.

### Devises & TVA suisse
Montants affichés en **CHF** (format suisse). TVA au taux standard **8.1 %** avec calcul HT / TVA / TTC.

### Import / Export
- **Exporter** télécharge un JSON daté (`atelier-plan-YYYY-MM-DD.json`)
- **Importer** remplace les données par un fichier JSON
- **Reset** recharge le jeu de démonstration
- **Impression** (⎙) génère un PDF A4 paysage via `@media print`

### Mode tablette
Bouton 📋 : interface agrandie en lecture seule avec rafraîchissement automatique, pour écran d'atelier.

### Thème clair / sombre
Bouton ☾ / ☀ : bascule instantanée, persisté en localStorage.

## Raccourcis clavier

| Touche | Action |
|:-:|---|
| `D` `G` `C` `P` `L` `M` `J` `S` `B` `V` `O` `X` `W` | Navigation directe vers un onglet |
| `N` | Nouvel élément (dans la vue courante) |
| `/` | Focus sur la barre de recherche |
| `?` | Afficher l'aide des raccourcis |
| `Esc` | Fermer la modale / l'aide |

> Sur macOS, les raccourcis sont identiques. Les modificateurs (`Cmd`, `Ctrl`, `Alt`) sont ignorés pour éviter les collisions avec le navigateur.

## Données de démonstration

- **70 personnes** — rôles, compétences, lieu principal, capacité hebdomadaire
- **7 lieux de production** sur 3 étages (2e, 1er, Rez)
- **12 zones de stockage** (arrivages, expédition, tampons, matières, consommables, outillage, prototypes, produits chimiques)
- **10 machines** — CNC, laser, plieuses, soudure, peinture, montage, bancs de test
- **6 projets** en parallèle, tâches auto-générées avec jalons et dépendances
- **12 articles de stock** — seuils d'alerte, projets liés, BOM
- **Commandes** — fournisseurs suisses, workflow 4A, TVA 8.1 %

## Architecture

```
index.html          Shell + topbar + modal root + script tags
styles.css          Thème clair/sombre, grille Gantt, heatmap, print
data.js             DB, seed, utilitaires dates (UTC), STORAGE_KEY
app.js              Router, modal, toast, raccourcis, conflits,
                    suggestions, prédictions, alertes proactives
views/
  dashboard.js      KPI + conflits + alertes + prédictions + charge
  gantt.js          Grille CSS + overlay SVG + drag-to-reschedule
  calendrier.js     Mois / semaine
  personnes.js      Annuaire + charge 4 semaines
  lieux.js          Arbres de stockage par étage
  machines.js       CRUD + charge + export CSV
  projets.js        Cartes
  stock.js          Articles + seuils
  bom.js            Bill of Materials projet ↔ stock
  deplacements.js   Liste + création
  commandes.js      4A + historique signé
  capacite.js       Heatmap
  whatif.js         Snapshot + diff + commit
```

**Persistance** : `localStorage['atelier_plan_v3']`. Le numéro de version (`v3`) est incrémenté lorsque le modèle de données évolue, pour invalider les anciennes sauvegardes.

**Dates en UTC** : toutes les manipulations de date passent par `D.parse`, `D.iso`, `D.addDays`, etc. qui utilisent `Date.UTC()` et `getUTCDate()`. Cela évite les décalages d'un jour lors d'un changement d'heure ou d'un fuseau non-UTC (bug historique en CEST/Zurich).

## Licence & crédits

Application développée sur mesure. Aucune dépendance tierce.
