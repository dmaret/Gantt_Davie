// Serveur Gantt Davie — Express + JWT + stockage JSON + backup NAS
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const jwt     = require('jsonwebtoken');

const app        = express();
const PORT       = process.env.PORT       || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'gantt-davie-dev-secret-changeme';
const DATA_DIR   = path.join(__dirname, 'data');
const DATA_FILE  = path.join(DATA_DIR, 'state.json');

// Dossier de backup NAS — définir via variable d'environnement BACKUP_DIR
// Exemple : BACKUP_DIR="/Volumes/MyCloudHome/GanttDavie" npm start
// Laisser vide pour désactiver le backup automatique
const BACKUP_DIR = process.env.BACKUP_DIR || '';

// Utilisateurs par défaut (première utilisation, avant que le state soit créé)
const DEFAULT_USERS = [
  { id: 'U_CP',   nom: 'Alice Chef-Projet',  groupe: 'MSP',         axes: ['A1'] },
  { id: 'U_LOG',  nom: 'Bruno Logistique',   groupe: 'MSP',         axes: ['A2'] },
  { id: 'U_TECH', nom: 'Carla Tech',         groupe: 'MSP',         axes: ['A3'] },
  { id: 'U_BUD',  nom: 'David Budget',       groupe: 'MSP',         axes: ['A4'] },
  { id: 'U_DIR',  nom: 'Elena Direction',    groupe: 'admin',       axes: ['A1','A2','A3','A4'] },
  { id: 'U_OBS',  nom: 'Frank Observateur',  groupe: 'utilisateur', axes: [] },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function readState() {
  if (!fs.existsSync(DATA_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return null; }
}

function writeState(state) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(state));
}

function getUsers() {
  const state = readState();
  return state?.utilisateurs || DEFAULT_USERS;
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

// ─── Backup NAS ──────────────────────────────────────────────────────────────

function doBackup() {
  if (!BACKUP_DIR) return;
  if (!fs.existsSync(DATA_FILE)) return;
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const time = new Date().toTimeString().slice(0, 5).replace(':', 'h');
    const dest = path.join(BACKUP_DIR, `gantt-davie-${date}-${time}.json`);
    fs.copyFileSync(DATA_FILE, dest);
    // Garder seulement les 30 derniers backups
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('gantt-davie-') && f.endsWith('.json'))
      .sort();
    if (files.length > 30) {
      files.slice(0, files.length - 30).forEach(f => {
        try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch {}
      });
    }
    console.log(`💾  Backup NAS → ${dest}`);
  } catch (e) {
    console.error(`⚠️  Backup NAS échoué : ${e.message}`);
  }
}

// ─── Middlewares ─────────────────────────────────────────────────────────────

app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname, { index: 'index.html' }));

// ─── Routes publiques ────────────────────────────────────────────────────────

app.get('/api/auth/users', (_req, res) => {
  res.json(getUsers().map(u => ({
    id: u.id,
    nom: u.nom,
    groupe: u.groupe,
    hasPassword: !!u.passwordHash,
  })));
});

app.post('/api/auth/login', (req, res) => {
  const { userId, passwordHash } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId requis' });
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: 'Utilisateur inconnu' });
  if (user.passwordHash && user.passwordHash !== passwordHash) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  const token = jwt.sign(
    { id: user.id, groupe: user.groupe, nom: user.nom },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  res.json({ token });
});

// ─── Routes protégées ────────────────────────────────────────────────────────

app.get('/api/state', authMiddleware, (_req, res) => {
  const state = readState();
  if (!state) return res.status(404).json({ error: 'Pas de données — premier démarrage' });
  res.json(state);
});

app.put('/api/state', authMiddleware, (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Corps JSON invalide' });
  }
  writeState(req.body);
  res.json({ ok: true });
});

// Déclencher un backup NAS manuellement
app.post('/api/backup', authMiddleware, (req, res) => {
  if (!BACKUP_DIR) return res.status(400).json({ error: 'BACKUP_DIR non configuré' });
  doBackup();
  res.json({ ok: true, dir: BACKUP_DIR });
});

// Télécharger une sauvegarde complète (navigateur)
app.get('/api/export', authMiddleware, (req, res) => {
  if (!fs.existsSync(DATA_FILE)) return res.status(404).json({ error: 'Pas de données' });
  const filename = `gantt-davie-${new Date().toISOString().slice(0, 10)}.json`;
  res.download(DATA_FILE, filename);
});

// ─── Démarrage ───────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅  Gantt Davie  →  http://localhost:${PORT}`);
  if (!fs.existsSync(DATA_FILE)) {
    console.log('ℹ️   Première utilisation — les données seront créées au premier login.');
    console.log('    Comptes disponibles : U_DIR (admin, sans mdp), U_CP, U_LOG, U_TECH, U_BUD, U_OBS');
  }
  if (BACKUP_DIR) {
    console.log(`💾  Backup NAS actif → ${BACKUP_DIR}  (toutes les heures, 30 fichiers max)`);
    setInterval(doBackup, 60 * 60 * 1000);
    setTimeout(doBackup, 5000);
  } else {
    console.log('ℹ️   Backup NAS désactivé — lance avec BACKUP_DIR="/Volumes/MyCloudHome/GanttDavie" npm start');
  }
});
