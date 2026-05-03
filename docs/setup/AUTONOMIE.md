# Travailler sans GitHub

Cette app est **100 % autonome** — un seul fichier HTML + localStorage. Aucun serveur requis.

---

## 1. Cloner sur ton Mac (une fois)

Ouvre le Terminal et colle :

```bash
git clone https://github.com/dmaret/Gantt_Davie.git ~/Documents/Gantt_Davie
```

Tu obtiens une copie complète : tous les fichiers **et** tout l'historique git (commits, branches, tags).

---

## 2. Utiliser l'app localement

```bash
open ~/Documents/Gantt_Davie/index.html
```

Ou double-clique sur `index.html` dans le Finder. L'app s'ouvre dans Safari/Chrome, tout fonctionne — les données sont dans le `localStorage` de ton navigateur.

---

## 3. Sauvegarder sans GitHub

| Option | Commande / action |
|---|---|
| **iCloud Drive** | Déplace le dossier dans `~/Library/Mobile Documents/com~apple~CloudDocs/` |
| **Time Machine** | Rien à faire — inclus automatiquement si le dossier est dans `~/Documents` |
| **Clé USB / NAS** | `cp -r ~/Documents/Gantt_Davie /Volumes/MaCle/` |
| **Remote git alternatif** | `git remote set-url origin git@gitlab.com:toi/Gantt_Davie.git` |

---

## 4. Continuer à versionner en local (sans remote)

```bash
cd ~/Documents/Gantt_Davie

# Modifier des fichiers, puis :
git add -A
git commit -m "ma modification"

# Voir l'historique :
git log --oneline
```

Pas besoin de `git push` — l'historique reste dans `.git/` sur ton Mac.

---

## 5. Exporter les données de l'app

Dans l'app → **Paramètres → Exporter JSON** — tu obtiens un fichier `.json` avec toutes tes données (projets, tâches, personnes…). Garde ce fichier dans iCloud ou sur une clé USB.

Pour restaurer : **Paramètres → Importer JSON**.

---

## En cas de fermeture du compte GitHub

1. Le dossier cloné sur ton Mac reste intact — **aucune perte**.
2. `index.html` continue de fonctionner indéfiniment.
3. Si tu veux partager l'app : zippe le dossier ou héberge `index.html` sur n'importe quel hébergeur statique (Netlify, Vercel, un NAS, un simple serveur Apache…).
