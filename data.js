// Données + persistance localStorage + seed réaliste
const STORAGE_KEY = 'atelier_plan_v3';

const DB = {
  state: null,
  _computeChecksum(obj) {
    const str = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  },
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const checksum = localStorage.getItem(STORAGE_KEY + '_checksum');
        const computedChecksum = this._computeChecksum(data);
        if (checksum && checksum !== computedChecksum) {
          console.warn('⚠️ Données corrompues ou modifiées');
          App.toast('⚠️ Les données ont été modifiées. Restauration depuis le backup…', 'warn');
        }
        this.state = data;
        this.migrate();
        this._pushHistory();
        return;
      }
    } catch (e) { console.warn('load failed', e); }
    this.state = seed();
    this.save();
  },
  migrate() {
    // Ajouts rétrocompatibles sans invalider le localStorage
    if (!this.state.utilisateurs) this.state.utilisateurs = defaultUsers();
    if (!this.state.groupes) this.state.groupes = defaultGroupes();
    if (!this.state.dashboardOrder) this.state.dashboardOrder = defaultDashboardOrder();
    if (!this.state.equipes) this.state.equipes = defaultEquipes();
    // Horaires hebdomadaires : lundi→vendredi plein temps par défaut, weekend off
    this.state.personnes.forEach(p => { if (!p.horaires) p.horaires = defaultHoraires(); });
    // Positions sur le plan 2D pour les lieux sans coordonnées
    this.state.lieux.forEach(l => { if (l.x === undefined) Object.assign(l, autoPosition(l, this.state.lieux)); });
    // Assigner un groupe par défaut aux utilisateurs qui n'en ont pas
    this.state.utilisateurs.forEach(u => {
      if (!u.groupe) {
        if ((u.axes||[]).length >= 4) u.groupe = 'admin';
        else if ((u.axes||[]).length > 0) u.groupe = 'MSP';
        else u.groupe = 'utilisateur';
      }
    });
    this.state.commandes.forEach(c => { if (!c.validationLog) c.validationLog = []; });
    // v3.2 : absences par personne, notes sur tâches, audit log, modèles tâches
    this.state.personnes.forEach(p => { if (!p.absences) p.absences = []; });
    this.state.taches.forEach(t => { if (t.notes === undefined) t.notes = ''; });
    // v3.4 : checklists par tâche, baselines planning
    this.state.taches.forEach(t => { if (!t.checklist) t.checklist = []; });
    if (!this.state.baselines) this.state.baselines = [];
    // v3.5 : séquencement strict par projet + suivi temps réel
    this.state.projets.forEach(p => { if (p.sequencementStrict === undefined) p.sequencementStrict = false; });
    this.state.taches.forEach(t => { if (!t.tempsLog) t.tempsLog = []; });
    if (!this.state.audit) this.state.audit = [];
    if (!this.state.modeles) this.state.modeles = [];
    // v3.6 : modèles de projet (séquences d'étapes avec gestes)
    if (!this.state.modelesProjets) {
      this.state.modelesProjets = defaultModelesProjets();
    } else {
      // Injecter les modèles par défaut manquants (nouveaux ajouts)
      const existingIds = new Set(this.state.modelesProjets.map(m => m.id));
      defaultModelesProjets().forEach(dm => {
        if (!existingIds.has(dm.id)) this.state.modelesProjets.push(dm);
      });
    }
    // v3.7 : positions des blocs dans la vue Flux atelier
    if (!this.state.fluxLayout) this.state.fluxLayout = {};
    // v3.8 : groupe sur les projets + groupe sur les modèles de projet
    this.state.projets.forEach(p => { if (p.groupe === undefined) p.groupe = ''; });
    (this.state.modelesProjets || []).forEach(mp => { if (mp.groupe === undefined) mp.groupe = ''; });
    // v3.9 : accès aux modules par groupe
    Object.keys(this.state.groupes || {}).forEach(k => {
      if (!this.state.groupes[k].moduleAccess) this.state.groupes[k].moduleAccess = defaultModuleAccess(k);
    });
  },

  checkIntegrity() {
    const s = this.state;
    const issues = [];
    const projetIds = new Set(s.projets.map(p => p.id));
    const personneIds = new Set(s.personnes.map(p => p.id));
    const lieuIds = new Set(s.lieux.map(l => l.id));
    const machineIds = new Set(s.machines.map(m => m.id));
    const tacheIds = new Set(s.taches.map(t => t.id));
    const stockIds = new Set((s.stock||[]).map(a => a.id));

    // Tâches orphelines (projet supprimé)
    s.taches.forEach(t => {
      if (!projetIds.has(t.projetId))
        issues.push({ type: 'warn', entity: 'tache', id: t.id, msg: `Tâche « ${t.nom} » : projet introuvable (${t.projetId})` });
    });

    // Tâches avec assignés invalides
    s.taches.forEach(t => {
      (t.assignes||[]).forEach(pid => {
        if (!personneIds.has(pid))
          issues.push({ type: 'warn', entity: 'tache', id: t.id, msg: `Tâche « ${t.nom} » : personne assignée introuvable (${pid})` });
      });
    });

    // Tâches avec lieu/machine invalide
    s.taches.forEach(t => {
      if (t.lieuId && !lieuIds.has(t.lieuId))
        issues.push({ type: 'warn', entity: 'tache', id: t.id, msg: `Tâche « ${t.nom} » : lieu introuvable (${t.lieuId})` });
      if (t.machineId && !machineIds.has(t.machineId))
        issues.push({ type: 'warn', entity: 'tache', id: t.id, msg: `Tâche « ${t.nom} » : machine introuvable (${t.machineId})` });
    });

    // Dépendances invalides
    s.taches.forEach(t => {
      (t.dependances||[]).forEach(did => {
        if (!tacheIds.has(did))
          issues.push({ type: 'warn', entity: 'tache', id: t.id, msg: `Tâche « ${t.nom} » : dépendance introuvable (${did})` });
      });
    });

    // Dates incohérentes (fin < debut)
    s.taches.forEach(t => {
      if (!t.jalon && t.fin < t.debut)
        issues.push({ type: 'error', entity: 'tache', id: t.id, msg: `Tâche « ${t.nom} » : fin (${t.fin}) antérieure au début (${t.debut})` });
    });

    // Personnes avec lieu principal invalide
    s.personnes.forEach(p => {
      if (p.lieuPrincipalId && !lieuIds.has(p.lieuPrincipalId))
        issues.push({ type: 'warn', entity: 'personne', id: p.id, msg: `Personne « ${p.prenom} ${p.nom} » : lieu principal introuvable` });
    });

    // Absences chevauchant des tâches affectées
    s.personnes.forEach(p => {
      (p.absences||[]).forEach(a => {
        const conflicts = s.taches.filter(t =>
          (t.assignes||[]).includes(p.id) && t.debut <= a.fin && t.fin >= a.debut
        );
        conflicts.forEach(t => {
          issues.push({ type: 'info', entity: 'absence', id: p.id, msg: `« ${p.prenom} ${p.nom} » est absent(e) du ${a.debut} au ${a.fin} mais assigné(e) à « ${t.nom} »` });
        });
      });
    });

    // Stock articles avec lieu de stockage invalide
    (s.stock||[]).forEach(a => {
      if (a.lieuId && !lieuIds.has(a.lieuId))
        issues.push({ type: 'warn', entity: 'stock', id: a.id, msg: `Article « ${a.nom} » : lieu de stockage introuvable` });
    });

    return issues;
  },

  // Journal d'audit : garde les 500 dernières actions
  logAudit(action, entity, entityId, details) {
    if (!this.state.audit) this.state.audit = [];
    const user = (window.App && App.currentUser && App.currentUser()) || { id:'?', nom:'?' };
    this.state.audit.push({
      ts: new Date().toISOString(),
      userId: user.id, userNom: user.nom,
      action, entity, entityId, details: details || ''
    });
    if (this.state.audit.length > 500) this.state.audit = this.state.audit.slice(-500);
  },

  // Personne disponible ce jour-là ? (false si en absence)
  personneAbsenteLe(personneId, iso) {
    const p = this.personne(personneId);
    if (!p || !p.absences) return false;
    return p.absences.some(a => a.debut <= iso && a.fin >= iso);
  },
  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    localStorage.setItem(STORAGE_KEY + '_checksum', this._computeChecksum(this.state));
    if (this._skipHistory) { this._skipHistory = false; return; }
    this._pushHistory();
  },
  // Historique pour Undo/Redo (limité à 20 entrées)
  _history: [], _future: [],
  _pushHistory() {
    try {
      const snap = JSON.stringify(this.state);
      if (this._history.length && this._history[this._history.length-1] === snap) return;
      this._history.push(snap);
      if (this._history.length > 20) this._history.shift();
      this._future = []; // toute nouvelle action invalide le redo
    } catch (e) {}
  },
  undo() {
    if (this._history.length < 2) return false;
    const current = this._history.pop();
    this._future.push(current);
    const prev = this._history[this._history.length - 1];
    this.state = JSON.parse(prev);
    this._skipHistory = true;
    localStorage.setItem(STORAGE_KEY, prev);
    return true;
  },
  redo() {
    if (!this._future.length) return false;
    const snap = this._future.pop();
    this._history.push(snap);
    this.state = JSON.parse(snap);
    this._skipHistory = true;
    localStorage.setItem(STORAGE_KEY, snap);
    return true;
  },
  reset() { this.state = seed(); this.migrate(); this.save(); },
  importJSON(obj) { this.state = obj; this.save(); },
  exportJSON() { return JSON.stringify(this.state, null, 2); },

  // Helpers
  uid(prefix='id') { return prefix + '_' + Math.random().toString(36).slice(2, 9); },

  personne(id) { return this.state.personnes.find(p => p.id === id); },
  lieu(id)     { return this.state.lieux.find(l => l.id === id); },
  machine(id)  { return this.state.machines.find(m => m.id === id); },
  projet(id)   { return this.state.projets.find(p => p.id === id); },
  tache(id)    { return this.state.taches.find(t => t.id === id); },
  stock(id)    { return this.state.stock.find(s => s.id === id); },

  tachesDuProjet(pid) { return this.state.taches.filter(t => t.projetId === pid); },
  tachesDePersonne(pid) { return this.state.taches.filter(t => (t.assignes||[]).includes(pid)); },
  tachesDeMachine(mid) { return this.state.taches.filter(t => t.machineId === mid); },
};

// Utilitaires date (YYYY-MM-DD) — tout en UTC pour éviter les décalages de fuseau
const D = {
  today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  },
  iso(d) {
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + String(d.getUTCDate()).padStart(2,'0');
  },
  parse(s) {
    const [y,m,day] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m-1, day));
  },
  addDays(s, n) { const d = D.parse(s); d.setUTCDate(d.getUTCDate()+n); return D.iso(d); },
  diffDays(a, b) { return Math.round((D.parse(b)-D.parse(a))/86400000); },
  isWeekend(s) { const d = D.parse(s).getUTCDay(); return d===0 || d===6; },
  isWorkday(s) { return !D.isWeekend(s); },
  // Ajuste au premier jour ouvré >= s
  nextWorkday(s) { let cur = s; while (D.isWeekend(cur)) cur = D.addDays(cur, 1); return cur; },
  // Renvoie la date située n jours ouvrés après s (s compte comme jour 0).
  // Ex: addWorkdays(lundi, 6) = mardi suivant (donc durée 7 jours ouvrés du lundi au mardi).
  addWorkdays(s, n) {
    let cur = D.nextWorkday(s);
    let added = 0;
    while (added < n) {
      cur = D.addDays(cur, 1);
      if (!D.isWeekend(cur)) added++;
    }
    return cur;
  },
  // Nombre de jours ouvrés entre a et b (inclusif)
  weekdaysBetween(a,b) {
    if (a > b) return 0;
    let n=0, cur=a;
    while (cur <= b) { if (!D.isWeekend(cur)) n++; cur = D.addDays(cur,1); }
    return n;
  },
  workdaysBetween(a,b) { return D.weekdaysBetween(a,b); },
  fmt(s) {
    const d = D.parse(s);
    return d.toLocaleDateString('fr-CH', { day:'2-digit', month:'short', timeZone:'UTC' });
  }
};

// Calculs TVA
const Money = {
  tva(ht, taux) { return Math.round(ht * taux) / 100; },
  ttc(ht, taux) { return Math.round(ht * (100 + taux)) / 100; },
  chf(n)  { return (n||0).toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' CHF'; },
};

// Export CSV (ouvrable dans Excel) — BOM UTF-8 pour accents corrects
const CSV = {
  escape(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(';') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  },
  build(rows) {
    // rows = [[...],[...]] — premier = entêtes
    return '﻿' + rows.map(r => r.map(CSV.escape).join(';')).join('\r\n');
  },
  download(filename, rows) {
    const blob = new Blob([CSV.build(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  },
};

// Export iCalendar (.ics) — compatible Outlook / Google / Apple Calendar
const ICS = {
  esc(v) { return String(v||'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;'); },
  dateOnly(d) { return d.replace(/-/g,''); }, // YYYYMMDD
  uid(prefix, id) { return `${prefix}-${id}@gantt-davie`; },
  build(events) {
    // events = [{ uid, summary, description, dtstart (YYYY-MM-DD), dtend (YYYY-MM-DD exclusive), location }]
    const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g,'').slice(0,15) + 'Z';
    const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Gantt Davie//FR','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
    events.forEach(e => {
      lines.push('BEGIN:VEVENT',
        `UID:${e.uid}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ICS.dateOnly(e.dtstart)}`,
        `DTEND;VALUE=DATE:${ICS.dateOnly(e.dtend)}`,
        `SUMMARY:${ICS.esc(e.summary)}`,
      );
      if (e.description) lines.push(`DESCRIPTION:${ICS.esc(e.description)}`);
      if (e.location) lines.push(`LOCATION:${ICS.esc(e.location)}`);
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  },
  download(filename, events) {
    const blob = new Blob([ICS.build(events)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  },
};

// Utilisateurs + groupes d'accès (multi-utilisateur léger, sans backend)
// Groupes : utilisateur (lecture), MSP (édition + signature selon axes), admin (tout)
function defaultUsers() {
  return [
    { id:'U_CP',   nom:'Alice Chef-Projet',  role:'Chef de projet',     groupe:'MSP',         axes:['A1'] },
    { id:'U_LOG',  nom:'Bruno Logistique',    role:'Logistique',         groupe:'MSP',         axes:['A2'] },
    { id:'U_TECH', nom:'Carla Tech',          role:'Direction technique',groupe:'MSP',         axes:['A3'] },
    { id:'U_BUD',  nom:'David Budget',        role:'Contrôle budget',    groupe:'MSP',         axes:['A4'] },
    { id:'U_DIR',  nom:'Elena Direction',     role:'Direction',          groupe:'admin',       axes:['A1','A2','A3','A4'] },
    { id:'U_OBS',  nom:'Frank Observateur',   role:'Consultation',       groupe:'utilisateur', axes:[] },
  ];
}

// Permissions par groupe (paramétrables via la vue Admin)
const MODULES_ACCESS = [
  { id:'dashboard',      label:'Tableau de bord', cat:'Navigation' },
  { id:'gantt',          label:'Gantt',            cat:'Navigation' },
  { id:'kanban',         label:'Kanban',           cat:'Navigation' },
  { id:'calendrier',     label:'Calendrier',       cat:'Navigation' },
  { id:'timeline',       label:'Timeline',         cat:'Navigation' },
  { id:'majourney',      label:'Ma journée',       cat:'Navigation' },
  { id:'personnes',      label:'Personnes',        cat:'Organisation' },
  { id:'lieux',          label:'Lieux',            cat:'Organisation' },
  { id:'machines',       label:'Machines',         cat:'Organisation' },
  { id:'flux',           label:'Flux atelier',     cat:'Organisation' },
  { id:'projets',        label:'Projets',          cat:'Organisation' },
  { id:'equipes',        label:'Équipes',          cat:'Organisation' },
  { id:'stock',          label:'Stock',            cat:'Production' },
  { id:'bom',            label:'BOM',              cat:'Production' },
  { id:'commandes',      label:'Commandes',        cat:'Production' },
  { id:'capacite',       label:'Capacité',         cat:'Production' },
  { id:'ressources',     label:'Ressources',       cat:'Production' },
  { id:'plan',           label:'Plan atelier',     cat:'Production' },
  { id:'deplacements',   label:'Déplacements',     cat:'Suivi' },
  { id:'absences',       label:'Absences',         cat:'Suivi' },
  { id:'audit',          label:'Historique',       cat:'Suivi' },
  { id:'whatif',         label:'What-if',          cat:'Suivi' },
  { id:'modeles',        label:'Modèles',          cat:'Suivi' },
  { id:'modelesprojets', label:'Modèles projet',   cat:'Suivi' },
  { id:'aide',           label:'Guide',            cat:'Suivi' },
];

function defaultModuleAccess(groupe) {
  const all = Object.fromEntries(MODULES_ACCESS.map(m => [m.id, true]));
  if (groupe === 'utilisateur') {
    return { ...all, lieux:false, machines:false, flux:false, stock:false, bom:false,
      commandes:false, capacite:false, ressources:false, plan:false,
      audit:false, whatif:false, modeles:false, modelesprojets:false };
  }
  return all;
}

function defaultGroupes() {
  return {
    utilisateur: { libelle:'Utilisateur', description:'Consultation seule',                    perms:{ read:true, edit:false, sign:false, engage:false, admin:false, whatif:false, reset:false }, moduleAccess: defaultModuleAccess('utilisateur') },
    MSP:         { libelle:'MSP',         description:'Édition + signature des axes autorisés', perms:{ read:true, edit:true,  sign:true,  engage:true,  admin:false, whatif:true,  reset:false }, moduleAccess: defaultModuleAccess('MSP') },
    admin:       { libelle:'Admin',       description:'Tous droits + gestion utilisateurs',     perms:{ read:true, edit:true,  sign:true,  engage:true,  admin:true,  whatif:true,  reset:true  }, moduleAccess: defaultModuleAccess('admin') },
  };
}

// Ordre par défaut des cartes du tableau de bord (personnalisable par drag & drop admin)
function defaultDashboardOrder() {
  return ['conflits','alertes','predictions','commandes-4a','next-tasks','next-moves','charge-lieux'];
}

// Horaires hebdomadaires par défaut (lundi→vendredi plein temps, weekend off)
const JOURS_SEMAINE = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
const JOURS_COURT   = ['L','M','M','J','V','S','D'];
function defaultHoraires() {
  const h = {};
  JOURS_SEMAINE.forEach((j, i) => {
    const ouvre = i < 5;
    h[j] = { matin: ouvre, aprem: ouvre };
  });
  return h;
}
// Totalise les demi-journées travaillées par semaine (0 à 14)
function horairesDemiJournees(h) {
  if (!h) return 10;
  return JOURS_SEMAINE.reduce((n,j) => n + (h[j]?.matin?1:0) + (h[j]?.aprem?1:0), 0);
}

// Positionnement auto sur le plan 2D : grille par étage
// Ordre des étages (top → bottom) : 2e, 1er, Rez, S-sol
const ETAGES_ORDER = ['2e','1er','Rez','S-sol'];
function autoPosition(lieu, allLieux) {
  const ETAGE_H = 260;      // hauteur d'un étage sur le plan
  const LIEU_W = 180;
  const LIEU_H = 110;
  const PAD_X = 20;
  const PAD_Y = 30;
  const etageIdx = Math.max(0, ETAGES_ORDER.indexOf(lieu.etage));
  // Index de ce lieu parmi ceux du même étage, typé prod puis stockage
  const sameEtage = allLieux.filter(l => l.etage === lieu.etage);
  sameEtage.sort((a,b) => (a.type === 'production' ? -1 : 1) - (b.type === 'production' ? -1 : 1));
  const idx = sameEtage.indexOf(lieu);
  const col = idx; // une seule rangée par étage
  return {
    x: PAD_X + col * (LIEU_W + 12),
    y: PAD_Y + etageIdx * ETAGE_H,
    w: LIEU_W,
    h: LIEU_H,
  };
}

// Équipes par défaut — cartographie des ressources par activité
function defaultEquipes() {
  return [
    { id:'EQ_L1',   nom:'Ligne 1',      couleur:'#2c5fb3', slots:[ { competence:'Contrôle', n:1 }, { competence:'Montage',  n:7 } ] },
    { id:'EQ_L2',   nom:'Ligne 2',      couleur:'#7c3aed', slots:[ { competence:'Contrôle', n:1 }, { competence:'Montage',  n:6 } ] },
    { id:'EQ_VAL',  nom:'Valmont',      couleur:'#c47800', slots:[ { competence:'CNC', n:2 }, { competence:'Soudure', n:3 } ] },
    { id:'EQ_LOG1', nom:'Logistique 1', couleur:'#1f8a4c', slots:[ { competence:'Logistique', n:3 } ] },
    { id:'EQ_LOG2', nom:'Logistique 2', couleur:'#1f8a4c', slots:[ { competence:'Logistique', n:2 } ] },
    { id:'EQ_LOG3', nom:'Logistique 3', couleur:'#1f8a4c', slots:[ { competence:'Logistique', n:2 } ] },
    { id:'EQ_ASM',  nom:'Assemblage',   couleur:'#0ea5b7', slots:[ { competence:'Montage', n:4 }, { competence:'Contrôle', n:1 } ] },
  ];
}

function seed() {
  const today = D.today();
  const start = D.addDays(today, -7);

  // Lieux d'emballage/logistique/conditionnement
  const lieux = [
    { id: 'L_ENTREE',      nom: 'Réception entrée',       etage: 'Rez', type: 'production', capacite: 6 },
    { id: 'L_DECONDI',     nom: 'Zone déconditionnement', etage: 'Rez', type: 'production', capacite: 8 },
    { id: 'L_ASSEMB',      nom: 'Poste assemblage',       etage: 'Rez', type: 'production', capacite: 10 },
    { id: 'L_CALLAGE',     nom: 'Callage & protection',   etage: 'Rez', type: 'production', capacite: 6 },
    { id: 'L_RECONDI',     nom: 'Reconditionnement',      etage: 'Rez', type: 'production', capacite: 12 },
    { id: 'L_VALMONT',     nom: 'Salle Valmont',          etage: 'Rez', type: 'production', capacite: 8 },
    { id: 'L_BANDERO',     nom: 'Banderollage',           etage: 'Rez', type: 'production', capacite: 4 },
    { id: 'L_FILM',        nom: 'Filmage palette',        etage: 'Rez', type: 'production', capacite: 4 },
    { id: 'L_CONTROLE',    nom: 'Contrôle qualité',       etage: 'Rez', type: 'production', capacite: 3 },
    { id: 'L_EXPEDITION',  nom: 'Quai expédition',        etage: 'Rez', type: 'production', capacite: 4 },
    // Stockages
    { id: 'S_ARRIVAGE',    nom: 'Stock · Arrivages',      etage: 'Rez', type: 'stockage', capacite: 150 },
    { id: 'S_DECOND',      nom: 'Stock · Pièces déconditionnées', etage: 'Rez', type: 'stockage', capacite: 120 },
    { id: 'S_EN_COURS',    nom: 'Stock · En cours',       etage: 'Rez', type: 'stockage', capacite: 200 },
    { id: 'S_EMBALLAGE',   nom: 'Stock · Matériaux emballage', etage: 'Rez', type: 'stockage', capacite: 100 },
    { id: 'S_CONSOMMABLES',nom: 'Stock · Consommables',   etage: 'Rez', type: 'stockage', capacite: 80 },
    { id: 'S_PALETTES',    nom: 'Stock · Palettes',       etage: 'Rez', type: 'stockage', capacite: 300 },
    { id: 'S_OUTILLAGE',   nom: 'Stock · Outillage',      etage: 'Rez', type: 'stockage', capacite: 60 },
    { id: 'S_FINAL',       nom: 'Stock · Produits finis', etage: 'Rez', type: 'stockage', capacite: 200 },
  ];

  // Machines d'emballage/logistique
  const machines = [
    { id:'M_BANDEROLE', nom:'Banderoleuse automatique', lieuId:'L_BANDERO', type:'Emballage', capaciteJour:12 },
    { id:'M_FILM1', nom:'Filmeuse palette 1',     lieuId:'L_FILM', type:'Emballage', capaciteJour:8 },
    { id:'M_FILM2', nom:'Filmeuse palette 2',     lieuId:'L_FILM', type:'Emballage', capaciteJour:8 },
    { id:'M_ETIQUETTE', nom:'Étiqueteuse',        lieuId:'L_RECONDI', type:'Conditionnement', capaciteJour:10 },
    { id:'M_BALANCE', nom:'Balance de pesée',     lieuId:'L_FILM', type:'Pesée', capaciteJour:16 },
    { id:'M_SCANNER', nom:'Lecteur code-barres',  lieuId:'L_CONTROLE', type:'Contrôle', capaciteJour:20 },
  ];

  // 70 personnes
  const prenoms = ['Marie','Pierre','Sophie','Luc','Claire','Thomas','Elise','Nicolas','Julie','Marc',
    'Camille','Antoine','Laura','Hugo','Emma','Paul','Léa','Maxime','Chloé','Julien',
    'Sarah','David','Anna','Fabien','Manon','Yann','Alice','Olivier','Inès','Bruno',
    'Mathilde','Rémi','Elodie','Florent','Céline','Xavier','Nadia','Benoît','Lucie','Éric',
    'Valérie','Raphaël','Amélie','Sébastien','Hélène','Vincent','Clara','Damien','Océane','Arnaud',
    'Gaëlle','Mickaël','Aurélie','Cédric','Pauline','Franck','Delphine','Grégoire','Audrey','Stéphane',
    'Morgane','Philippe','Virginie','Jérôme','Sandrine','Romain','Caroline','Simon','Corinne','Tristan'];
  const noms = ['Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau',
    'Simon','Laurent','Lefebvre','Michel','Garcia','David','Bertrand','Roux','Vincent','Fournier',
    'Morel','Girard','André','Lefèvre','Mercier','Dupont','Lambert','Bonnet','François','Martinez',
    'Legrand','Garnier','Faure','Rousseau','Blanc','Guérin','Muller','Henry','Roussel','Nicolas',
    'Perrin','Morin','Mathieu','Clément','Gauthier','Dumont','Lopez','Fontaine','Chevalier','Robin',
    'Masson','Sanchez','Gérard','Nguyen','Boyer','Denis','Lemoine','Dufour','Meyer','Blanchard',
    'Marchand','Guillaume','Peltier','Perrot','Lucas','Royer','Hubert','Weber','Fernandez','Schneider'];

  const roles = ['Chef·fe de projet','Opérateur·rice emballage','Logisticien·ne','Contrôleur·se qualité',
                 'Responsable entrepôt','Coordinateur·rice','Manutentionnaire','Chef d\'équipe'];
  const competences = ['Emballage','Logistique','Conditionnement','Contrôle','Étiquetage',
                       'Manutention','Filmage','Banderollage','Callage','Management'];

  const personnes = [];
  for (let i=0; i<70; i++) {
    const r = roles[i % roles.length];
    const comps = [];
    const n = 2 + (i%3);
    for (let k=0; k<n; k++) comps.push(competences[(i*3+k*7) % competences.length]);
    personnes.push({
      id: 'P' + String(i+1).padStart(3,'0'),
      nom: noms[i % noms.length],
      prenom: prenoms[i % prenoms.length],
      role: r,
      lieuPrincipalId: lieux[i % 7].id,
      competences: Array.from(new Set(comps)),
      capaciteHebdo: 35,  // heures
      couleur: '#' + ((i*2654435761) & 0xffffff).toString(16).padStart(6,'0').slice(0,6),
    });
  }

  // Projets emballage/logistique
  const startWD = D.nextWorkday(start);
  const projets = [
    { id:'PRJ_A', code:'PRJ-LOG-001', nom:'Commande Migros — Emballage cartons', client:'Migros Distribution', couleur:'#2c5fb3', debut: startWD, fin: D.addWorkdays(startWD, 5), etage:'Rez', groupe:'Logistique', priorite:'haute', statut:'en-cours'},
    { id:'PRJ_B', code:'PRJ-EMB-001', nom:'Reconditionnement produits COOP', client:'COOP Suisse', couleur:'#7c3aed', debut: D.addWorkdays(startWD, 1), fin: D.addWorkdays(startWD, 8), etage:'Rez', groupe:'Emballage', priorite:'haute', statut:'en-cours'},
    { id:'PRJ_C', code:'PRJ-COND-001', nom:'Conditionnement kits montage', client:'Interne', couleur:'#1f8a4c', debut: D.nextWorkday(D.addDays(startWD,-3)), fin: D.addWorkdays(startWD, 10), etage:'Rez', groupe:'Conditionnement', priorite:'moyenne', statut:'en-cours'},
    { id:'PRJ_D', code:'PRJ-LOG-002', nom:'Tri & réexpédition retours', client:'Nestlé CH', couleur:'#c47800', debut: D.addWorkdays(startWD, 3), fin: D.addWorkdays(startWD, 12), etage:'Rez', groupe:'Logistique', priorite:'moyenne', statut:'planifié'},
    { id:'PRJ_E', code:'PRJ-EMB-002', nom:'Packaging premium Lindt', client:'Lindt & Sprüngli', couleur:'#c43b3b', debut: D.addWorkdays(startWD, 5), fin: D.addWorkdays(startWD, 15), etage:'Rez', groupe:'Emballage', priorite:'haute', statut:'planifié'},
    { id:'PRJ_F', code:'PRJ-COND-002', nom:'Assemblage et callage mécanique', client:'Interne', couleur:'#0ea5b7', debut: D.addWorkdays(startWD, 7), fin: D.addWorkdays(startWD, 20), etage:'Rez', groupe:'Conditionnement', priorite:'basse', statut:'planifié'},
  ];

  // Tâches pour chaque projet (flux emballage/logistique)
  const taches = [];
  let tCount = 0;
  const tpl = [
    { nom:'Réception marchandise',    duree:1,  comp:'Logistique', machine:null,          lieu:'L_ENTREE',    type:'appro' },
    { nom:'Contrôle entrée',          duree:1,  comp:'Contrôle',   machine:'M_SCANNER',   lieu:'L_CONTROLE',  type:'etude' },
    { nom:'Déconditionnement',        duree:2,  comp:'Conditionnement', machine:null,    lieu:'L_DECONDI',   type:'prod' },
    { nom:'Assemblage/kits',          duree:2,  comp:'Conditionnement', machine:null,    lieu:'L_ASSEMB',    type:'prod' },
    { nom:'Callage & protection',     duree:1,  comp:'Logistique', machine:null,         lieu:'L_CALLAGE',   type:'prod' },
    { nom:'Reconditionnement',        duree:2,  comp:'Conditionnement', machine:'M_ETIQUETTE', lieu:'L_RECONDI', type:'prod' },
    { nom:'Banderollage',             duree:1,  comp:'Emballage',  machine:'M_BANDEROLE', lieu:'L_BANDERO',   type:'prod' },
    { nom:'Filmage & pesée',          duree:1,  comp:'Emballage',  machine:'M_FILM1',     lieu:'L_FILM',      type:'prod' },
    { nom:'Contrôle final',           duree:1,  comp:'Contrôle',   machine:'M_SCANNER',   lieu:'L_CONTROLE',  type:'etude' },
    { nom:'Expédition',               duree:1,  comp:'Logistique', machine:null,          lieu:'L_EXPEDITION',type:'livraison' },
  ];

  projets.forEach((prj, pi) => {
    let cur = D.nextWorkday(prj.debut);
    tpl.forEach((t, ti) => {
      if (D.parse(cur) > D.parse(prj.fin)) return;
      // Durée en jours ouvrés : t.duree inclut le jour de début → fin = debut + (duree-1)
      const fin = D.addWorkdays(cur, Math.max(0, t.duree - 1));
      // Choisit 1-3 personnes avec la compétence si possible
      const cand = personnes.filter(p => p.competences.includes(t.comp));
      const team = [];
      const nbTeam = 1 + (ti+pi) % 3;
      for (let k=0; k<nbTeam && k<cand.length; k++) team.push(cand[(pi*3+ti+k) % cand.length].id);
      if (team.length === 0) team.push(personnes[(pi*5+ti) % personnes.length].id);

      taches.push({
        id: 'T' + String(++tCount).padStart(4,'0'),
        projetId: prj.id,
        nom: t.nom,
        debut: cur,
        fin: fin,
        assignes: team,
        machineId: t.machine,
        lieuId: t.lieu,
        type: t.type,
        avancement: (D.parse(fin) < D.parse(today)) ? 100 : (D.parse(cur) < D.parse(today)) ? 40 : 0,
        jalon: false,
        dependances: ti > 0 ? ['T' + String(tCount-1).padStart(4,'0')] : [],
      });
      // Prochain jour ouvré après fin
      cur = D.addWorkdays(fin, 1);
    });
    // jalon final
    taches.push({
      id: 'T' + String(++tCount).padStart(4,'0'),
      projetId: prj.id,
      nom: 'Livraison client',
      debut: prj.fin, fin: prj.fin,
      assignes: [], machineId: null, lieuId: 'L_LIVR',
      type: 'jalon', avancement: 0, jalon: true, dependances: [],
    });
  });

  // Stock (articles d'emballage/logistique)
  const stock = [
    { id:'ART001', ref:'CARTON-L',     nom:'Cartons ondulés L',        unite:'pce', quantite:250, seuilAlerte:100, lieuId:'S_EMBALLAGE', projetsLies:['PRJ_A']},
    { id:'ART002', ref:'CARTON-M',     nom:'Cartons ondulés M',        unite:'pce', quantite:180, seuilAlerte:80,  lieuId:'S_EMBALLAGE', projetsLies:['PRJ_B']},
    { id:'ART003', ref:'CARTON-S',     nom:'Cartons ondulés S',        unite:'pce', quantite:320, seuilAlerte:150, lieuId:'S_EMBALLAGE', projetsLies:['PRJ_C']},
    { id:'ART004', ref:'FILM-BULLE',   nom:'Film à bulles 50cm',       unite:'rouleau', quantite:12, seuilAlerte:5, lieuId:'S_EMBALLAGE', projetsLies:['PRJ_A','PRJ_D']},
    { id:'ART005', ref:'FILM-ETIRE',   nom:'Film étirable 500mm',      unite:'rouleau', quantite:8, seuilAlerte:4,  lieuId:'S_EMBALLAGE', projetsLies:['PRJ_B','PRJ_E']},
    { id:'ART006', ref:'BANDEAU-ADHESIF', nom:'Bandeaux adhésif 50mm',  unite:'rouleau', quantite:15, seuilAlerte:8, lieuId:'S_EMBALLAGE', projetsLies:['PRJ_A','PRJ_B']},
    { id:'ART007', ref:'ETIQUETTE-STANDARD', nom:'Étiquettes standard',  unite:'pack', quantite:50, seuilAlerte:20, lieuId:'S_CONSOMMABLES',projetsLies:['PRJ_A','PRJ_B','PRJ_C']},
    { id:'ART008', ref:'PALETTE-EUR',  nom:'Palettes EUR 1200x800',    unite:'pce', quantite:45, seuilAlerte:20, lieuId:'S_PALETTES', projetsLies:['PRJ_D']},
    { id:'ART009', ref:'CALAGE-MOUSSE',nom:'Mousse de calage',         unite:'m3', quantite:12, seuilAlerte:5,   lieuId:'S_CONSOMMABLES', projetsLies:['PRJ_C','PRJ_F']},
    { id:'ART010', ref:'PAPIER-PROTECTION', nom:'Papier protection blanc', unite:'rouleau', quantite:20, seuilAlerte:8, lieuId:'S_CONSOMMABLES', projetsLies:['PRJ_A','PRJ_D']},
    { id:'ART011', ref:'ADHÉSIF-KRAFT', nom:'Adhésif kraft 50mm',      unite:'rouleau', quantite:10, seuilAlerte:5, lieuId:'S_CONSOMMABLES', projetsLies:['PRJ_B','PRJ_C']},
    { id:'ART012', ref:'SUPPORT-VERRE', nom:'Support en verre',        unite:'pce', quantite:60, seuilAlerte:25, lieuId:'S_CONSOMMABLES', projetsLies:['PRJ_F']},
  ];

  // Déplacements prévus (dates sur jours ouvrés)
  const deplacements = [
    { id:'DEP001', date: D.addWorkdays(today, 1), personneId:'P001', origineId:'L_ENTREE', destinationId:'L_DECONDI', motif:'Réception Migros', projetId:'PRJ_A', duree:'1h'},
    { id:'DEP002', date: D.addWorkdays(today, 2), personneId:'P010', origineId:'L_RECONDI', destinationId:'L_BANDERO', motif:'Préparation banderollage', projetId:'PRJ_B', duree:'30min'},
    { id:'DEP003', date: D.addWorkdays(today, 3), personneId:'P020', origineId:'S_PALETTES', destinationId:'L_FILM', motif:'Préparation palettes', projetId:null, duree:'1h'},
    { id:'DEP004', date: D.addWorkdays(today, 4), personneId:'P003', origineId:'L_FILM', destinationId:'L_EXPEDITION', motif:'Livraison quai', projetId:'PRJ_C', duree:'30min'},
  ];

  // Commandes (avec workflow "4A") — montants en CHF, TVA suisse 8,1 %
  // Règle: une commande doit être validée par 4 axes/rôles avant engagement:
  // A1 Chef de projet, A2 Logistique, A3 Responsable entrepôt, A4 Contrôle budget.
  const TVA = 8.1;
  const commandes = [
    { id:'CMD001', ref:'CMD-2026-001', fournisseur:'Emballages Suisse SA', projetId:'PRJ_A', montantHT:  2400, tauxTVA: TVA, dateDemande: D.addWorkdays(today,-5), validations:{A1:true,A2:true,A3:true,A4:true},  statut:'engagée',   lignes:[{articleId:'ART001',qte:100}]},
    { id:'CMD002', ref:'CMD-2026-002', fournisseur:'Films Plastiques Romand', projetId:'PRJ_B', montantHT:  850, tauxTVA: TVA, dateDemande: D.addWorkdays(today,-3), validations:{A1:true,A2:true,A3:false,A4:false},statut:'en-attente',lignes:[{articleId:'ART004',qte:5}]},
    { id:'CMD003', ref:'CMD-2026-003', fournisseur:'Cartonages Vaud',   projetId:'PRJ_C', montantHT:  1200, tauxTVA: TVA, dateDemande: D.addWorkdays(today,-2), validations:{A1:true,A2:false,A3:false,A4:false},statut:'en-attente',lignes:[{articleId:'ART003',qte:150}]},
    { id:'CMD004', ref:'CMD-2026-004', fournisseur:'Palettes Helvetia', projetId:'PRJ_D', montantHT:   950, tauxTVA: TVA, dateDemande: D.addWorkdays(today,-1), validations:{A1:false,A2:false,A3:false,A4:false},statut:'brouillon', lignes:[{articleId:'ART008',qte:20}]},
  ];

  return {
    meta: { version: 1, nom: 'Planification atelier', cree: new Date().toISOString() },
    personnes, lieux, machines, projets, taches, stock, deplacements, commandes,
    // Config règle 4A
    regle4A: {
      libelle: "4A n'engage pas la commande",
      axes: [
        { code:'A1', nom:'Chef de projet',       obligatoire:true },
        { code:'A2', nom:'Logistique',           obligatoire:true },
        { code:'A3', nom:'Direction technique',  obligatoire:true },
        { code:'A4', nom:'Contrôle budget',      obligatoire:true },
      ],
    },
  };
}

// ── Catalogue des gestes (depuis l'outil de chiffrage atelier) ────────────────
// Temps en secondes (valeur finale = temps × coef)
DB.CATALOGUE_GESTES = [
  // Réception
  { code:'REC-01', categorie:'Réception',    description:'Décharger palette',              temps:180, coef:1.2, notes:'Avec transpalette électrique' },
  { code:'REC-02', categorie:'Réception',    description:'Contrôle visuel palette',        temps: 60, coef:1.0, notes:'État général palette et emballages' },
  { code:'REC-03', categorie:'Réception',    description:'Déballage d\'un élément',        temps:  5, coef:1.0, notes:'Niveau 1' },
  { code:'REC-04', categorie:'Réception',    description:'Ouvrir carton',                  temps: 20, coef:1.0, notes:'Avec cutter sécurisé' },
  { code:'REC-05', categorie:'Réception',    description:'Compter articles (par 10)',      temps: 30, coef:1.1, notes:'Par tranche de 10 unités' },
  // Contrôle
  { code:'CTR-01', categorie:'Contrôle',     description:'Contrôle visuel unitaire',       temps: 10, coef:1.0, notes:'Vérification état produit' },
  { code:'CTR-02', categorie:'Contrôle',     description:'Contrôle élément fini',          temps:  1.5, coef:1.2, notes:'Niveau 2' },
  { code:'CTR-03', categorie:'Contrôle',     description:'Mise en conformité caisse/carton',temps:10, coef:1.5, notes:'Contrôle fin - Niveau 3' },
  { code:'CTR-04', categorie:'Contrôle',     description:'Mise en conformité palette',     temps: 60, coef:1.5, notes:'Contrôle fin - Niveau 3' },
  // Étiquetage
  { code:'ETI-01', categorie:'Étiquetage',   description:'Imprimer étiquette',             temps: 10, coef:1.0, notes:'Imprimante thermique' },
  { code:'ETI-02', categorie:'Étiquetage',   description:'Coller étiquette',               temps: 12, coef:1.0, notes:'Position selon consignes client' },
  { code:'ETI-03', categorie:'Étiquetage',   description:'Retirer étiquette',              temps: 25, coef:1.2, notes:'Avec décapeur thermique si nécessaire' },
  { code:'ETI-04', categorie:'Étiquetage',   description:'Collage étiquette orientée (complexe)', temps:5, coef:1.2, notes:'Niveau 2' },
  { code:'ETI-05', categorie:'Étiquetage',   description:'Collage étiquette orientée (simple)',   temps:3, coef:1.0, notes:'Niveau 1' },
  { code:'ETI-06', categorie:'Étiquetage',   description:'Impression Inkjet / manuscrit',  temps:  3, coef:1.2, notes:'Niveau 2' },
  // Assemblage
  { code:'ASS-01', categorie:'Assemblage',   description:'Kit 2 pièces',                  temps: 40, coef:1.2, notes:'Assemblage simple, contrôle visuel final' },
  { code:'ASS-02', categorie:'Assemblage',   description:'Kit 3-5 pièces',               temps: 90, coef:1.3, notes:'Assemblage complexe selon fiche technique' },
  { code:'ASS-03', categorie:'Assemblage',   description:'Emballer film bulles',          temps: 30, coef:1.1, notes:'Protection renforcée produits fragiles' },
  { code:'ASS-04', categorie:'Assemblage',   description:'Calage (carton / caisse)',      temps:  3, coef:1.2, notes:'Niveau 2' },
  { code:'ASS-05', categorie:'Assemblage',   description:'Fermeture sachet mini-grip',    temps:  3, coef:1.2, notes:'Niveau 2' },
  { code:'ASS-06', categorie:'Assemblage',   description:'Filmage élément unitaire',      temps: 12, coef:1.2, notes:'Niveau 2' },
  { code:'ASS-07', categorie:'Assemblage',   description:'Banderolage produit',           temps: 12, coef:1.2, notes:'Niveau 2' },
  { code:'ASS-08', categorie:'Assemblage',   description:'Formage + fermeture étui complexe', temps:10, coef:1.2, notes:'Niveau 2' },
  { code:'ASS-09', categorie:'Assemblage',   description:'Formage + fermeture étui simple',   temps: 5, coef:1.0, notes:'Niveau 1' },
  { code:'ASS-10', categorie:'Assemblage',   description:'Fourreau orienté',              temps: 10, coef:1.2, notes:'Niveau 2' },
  { code:'ASS-11', categorie:'Assemblage',   description:'Groupage avec élastique',       temps: 10, coef:1.2, notes:'Niveau 2' },
  { code:'ASS-12', categorie:'Assemblage',   description:'Insertion complexe (orienté)',  temps:  5, coef:1.2, notes:'Niveau 2' },
  { code:'ASS-13', categorie:'Assemblage',   description:'Insertion par balance',         temps:  0.5, coef:1.2, notes:'Niveau 2' },
  { code:'ASS-14', categorie:'Assemblage',   description:'Insertion simple orientée',     temps:  2, coef:1.0, notes:'Niveau 1' },
  { code:'ASS-15', categorie:'Assemblage',   description:'Pliage complexe',               temps:  6, coef:1.2, notes:'Niveau 2' },
  { code:'ASS-16', categorie:'Assemblage',   description:'Pliage simple (par rainure)',   temps:  3, coef:1.0, notes:'Niveau 1' },
  // Stockage
  { code:'STO-01', categorie:'Stockage',     description:'Déplacer palette',              temps:120, coef:1.2, notes:'Vers zone stockage désignée' },
  { code:'STO-02', categorie:'Stockage',     description:'Ranger rayonnage',              temps: 25, coef:1.1, notes:'Respecter plan FIFO' },
  { code:'STO-03', categorie:'Stockage',     description:'Prélever stock',                temps: 30, coef:1.1, notes:'Vérifier référence et quantité' },
  { code:'STO-04', categorie:'Stockage',     description:'Inventaire',                    temps:180, coef:1.2, notes:'Comptage physique et saisie informatique' },
  // Préparation
  { code:'PRE-01', categorie:'Préparation',  description:'Imprimer bon de préparation',   temps: 30, coef:1.0, notes:'Bon de préparation commande' },
  { code:'PRE-02', categorie:'Préparation',  description:'Picking',                       temps: 20, coef:1.1, notes:'Prélèvement article selon bon' },
  { code:'PRE-03', categorie:'Préparation',  description:'Reconditionnement (comptage/orientation)', temps:3, coef:1.2, notes:'Niveau 2' },
  // Expédition
  { code:'EXP-01', categorie:'Expédition',   description:'Peser colis',                   temps: 15, coef:1.0, notes:'Balance de précision' },
  { code:'EXP-02', categorie:'Expédition',   description:'Filmer palette',                temps:180, coef:1.2, notes:'Film étirable machine ou manuel' },
  { code:'EXP-03', categorie:'Expédition',   description:'Livraison par la Poste',        temps: 15, coef:1.0, notes:'Dépôt en bureau de poste' },
  { code:'EXP-04', categorie:'Expédition',   description:'Mise à disposition EPI',        temps: 10, coef:1.0, notes:'Préparation et remise au transporteur EPI' },
];

// Retourne le temps final d'un geste (temps × coef), en secondes
DB.tempsGeste = code => {
  const g = DB.CATALOGUE_GESTES.find(x => x.code === code);
  return g ? Math.round(g.temps * g.coef) : 0;
};

// ── Modèles de projet par défaut ──────────────────────────────────────────────
function defaultModelesProjets() {
  return [
    // ── GROUPE : LOGISTIQUE ──────────────────────────────────────────────────
    {
      id: 'MPRJ-001',
      nom: 'Réception complète & rangement',
      couleur: '#2c5fb3',
      groupe: 'Logistique',
      description: 'Décharge → Contrôle → Déconditionnement → Rangement FIFO',
      etapes: [
        { id:'e1', nom:'Décharge palette',                type:'appro',     duree:1, lieuId:'L_ENTREE', machineId:null, notes:'Décharge palette, comptage articles' },
        { id:'e2', nom:'Contrôle réception (scan)',       type:'etude',     duree:1, lieuId:'L_CONTROLE', machineId:'M_SCANNER', notes:'Scan codes-barres, vérification conformité' },
        { id:'e3', nom:'Déconditionnement si nécessaire', type:'prod',      duree:1, lieuId:'L_DECONDI', machineId:null, notes:'Ouverture cartons, tri par référence' },
        { id:'e4', nom:'Rangement stock (FIFO)',          type:'prod',      duree:1, lieuId:'S_EN_COURS', machineId:null, notes:'Mise en place selon règle FIFO' },
        { id:'e5', nom:'Stock rangé et disponible',       type:'jalon',     duree:0, lieuId:'S_FINAL', machineId:null, notes:'Jalon : articles prêts pour préparation', jalon:true },
      ],
    },
    {
      id: 'MPRJ-002',
      nom: 'Réception courte & rangement direct',
      couleur: '#0284c7',
      groupe: 'Logistique',
      description: 'Flux rapide : réception → scan → rangement direct',
      etapes: [
        { id:'e1', nom:'Réception et comptage',          type:'appro',  duree:1, lieuId:'L_ENTREE', machineId:null, notes:'Vérification palette, comptage rapide' },
        { id:'e2', nom:'Identification étiquette',       type:'etude',  duree:0.5, lieuId:'L_CONTROLE', machineId:'M_SCANNER', notes:'Lecture code-barres de la palette' },
        { id:'e3', nom:'Rangement direct en stock',      type:'prod',   duree:1, lieuId:'S_ARRIVAGE', machineId:null, notes:'Rangement direct sans décondi' },
        { id:'e4', nom:'Stock prêt à prélever',          type:'jalon',  duree:0, lieuId:'S_ARRIVAGE', machineId:null, notes:'Jalon : articles en stock', jalon:true },
      ],
    },
    {
      id: 'MPRJ-003',
      nom: 'Préparation commande & expédition',
      couleur: '#059669',
      groupe: 'Logistique',
      description: 'Picking → Filmage palette → Contrôle → Expédition',
      etapes: [
        { id:'e1', nom:'Picking commande',                type:'prod', duree:1, lieuId:'S_ARRIVAGE', machineId:null, notes:'Sélection articles selon bon de commande' },
        { id:'e2', nom:'Contrôle commande préparée',     type:'etude', duree:1, lieuId:'L_CONTROLE', machineId:'M_SCANNER', notes:'Vérification quantités et références' },
        { id:'e3', nom:'Palettisation & filmage',        type:'prod',   duree:1, lieuId:'L_FILM', machineId:'M_FILM1', notes:'Mise en palette, filmage et pesée' },
        { id:'e4', nom:'Expédition quai',                type:'livraison', duree:1, lieuId:'L_EXPEDITION', machineId:null, notes:'Préparation enlèvement transporteur' },
        { id:'e5', nom:'Commande expédiée',              type:'jalon',  duree:0, lieuId:'L_EXPEDITION', machineId:null, notes:'Jalon : marchandise remise', jalon:true },
      ],
    },
    {
      id: 'MPRJ-004',
      nom: 'Tri & réexpédition retours',
      couleur: '#7c3aed',
      groupe: 'Logistique',
      description: 'Réception retours → Tri/Diagnostic → Reconditionnement → Réexpédition',
      etapes: [
        { id:'e1', nom:'Réception articles retour',      type:'appro',    duree:1, lieuId:'L_ENTREE', machineId:null, notes:'Décharge palette retours, vérification bon' },
        { id:'e2', nom:'Contrôle & diagnostic',          type:'etude',    duree:1, lieuId:'L_CONTROLE', machineId:'M_SCANNER', notes:'Contrôle état produit, identification cause' },
        { id:'e3', nom:'Tri physique (bon/rebut)',        type:'etude',    duree:1, lieuId:'L_DECONDI', machineId:null, notes:'Séparation lots conformes / non-conformes' },
        { id:'e4', nom:'Reconditionnement si nécessaire', type:'prod',   duree:2, lieuId:'L_RECONDI', machineId:'M_ETIQUETTE', notes:'Retrait anciennes étiquettes, ré-étiquetage' },
        { id:'e5', nom:'Filmage & mise à disposition',   type:'prod',   duree:1, lieuId:'L_FILM', machineId:'M_FILM2', notes:'Filmage palette, préparation enlèvement' },
        { id:'e6', nom:'Retours traités',                type:'jalon',   duree:0, lieuId:'L_EXPEDITION', machineId:null, notes:'Jalon : dossier retour clôturé', jalon:true },
      ],
    },
    {
      id: 'MPRJ-005',
      nom: 'Inventaire physique & réorganisation',
      couleur: '#f59e0b',
      groupe: 'Logistique',
      description: 'Préparation → Comptage zones → Rapprochement → Réorganisation FIFO',
      etapes: [
        { id:'e1', nom:'Préparation inventaire',         type:'etude',    duree:1, lieuId:'S_ARRIVAGE', machineId:null, notes:'Impression listes comptage, balisage zones' },
        { id:'e2', nom:'Comptage physique détaillé',     type:'prod',     duree:2, lieuId:'S_EN_COURS', machineId:'M_SCANNER', notes:'Comptage par zone, double vérification si écart' },
        { id:'e3', nom:'Rapprochement théorique/physique', type:'etude',  duree:1, lieuId:'L_CONTROLE', machineId:null, notes:'Comparaison et corrections stock informatisé' },
        { id:'e4', nom:'Réorganisation FIFO',            type:'prod',     duree:1, lieuId:'S_EN_COURS', machineId:null, notes:'Remise en ordre, dégagement zones mortes' },
        { id:'e5', nom:'Inventaire validé & stock à jour', type:'jalon', duree:0, lieuId:'S_FINAL', machineId:null, notes:'Jalon : stock certifié exact', jalon:true },
      ],
    },
    {
      id: 'MPRJ-006',
      nom: 'Transfert inter-sites & palettisation',
      couleur: '#e11d48',
      groupe: 'Logistique',
      description: 'Picking transfert → Palettisation → Filmage & étiquetage → Transport',
      etapes: [
        { id:'e1', nom:'Préparation transfert',          type:'prod',     duree:1, lieuId:'S_ARRIVAGE', machineId:null, notes:'Picking articles à transférer selon bon' },
        { id:'e2', nom:'Palettisation & équilibrage',    type:'prod',     duree:1, lieuId:'S_PALETTES', machineId:null, notes:'Construction palette stable, répartition masses' },
        { id:'e3', nom:'Filmage palette & étiquetage',   type:'prod',     duree:1, lieuId:'L_FILM', machineId:'M_FILM1', notes:'Filmage renforcé, étiquette transporteur apposée' },
        { id:'e4', nom:'Pesée & documentation transport', type:'prod',    duree:1, lieuId:'L_EXPEDITION', machineId:'M_BALANCE', notes:'Pesée, édition lettre de transport' },
        { id:'e5', nom:'Transfert complété',             type:'jalon',    duree:0, lieuId:'L_EXPEDITION', machineId:null, notes:'Jalon : palette prête enlèvement', jalon:true },
      ],
    },

    // ── GROUPE : EMBALLAGE ───────────────────────────────────────────────────
    {
      id: 'MPRJ-007',
      nom: 'Étiquetage en série cartons',
      couleur: '#0d9488',
      groupe: 'Emballage',
      description: 'Réception cartons → Impression étiquettes → Pose en série → Contrôle',
      etapes: [
        { id:'e1', nom:'Réception cartons à étiqueter',   type:'appro', duree:1, lieuId:'L_ENTREE', machineId:null, notes:'Décharge palette, tri par référence' },
        { id:'e2', nom:'Configuration & impression étiquettes', type:'etude', duree:1, lieuId:'L_VALMONT', machineId:null, notes:'Test impression, validation maquette' },
        { id:'e3', nom:'Étiquetage automatique en série', type:'prod',   duree:2, lieuId:'L_RECONDI', machineId:'M_ETIQUETTE', notes:'Passage à l\'étiqueteuse, contrôle positionnement' },
        { id:'e4', nom:'Contrôle conformité étiquettes',  type:'etude',  duree:1, lieuId:'L_CONTROLE', machineId:'M_SCANNER', notes:'Scan codes-barres, vérification lisibilité' },
        { id:'e5', nom:'Palettisation & film',           type:'prod',   duree:1, lieuId:'L_FILM', machineId:'M_FILM1', notes:'Remise en palette, filmage, pesée' },
        { id:'e6', nom:'Lot étiqueté prêt',              type:'jalon',  duree:0, lieuId:'S_FINAL', machineId:null, notes:'Jalon : lot prêt expédition', jalon:true },
      ],
    },
    {
      id: 'MPRJ-008',
      nom: 'Emballage premium & reconditionnement',
      couleur: '#dc2626',
      groupe: 'Emballage',
      description: 'Déconditionnement → Reconditionnement premium → Étiquetage → Palettisation',
      etapes: [
        { id:'e1', nom:'Réception marchandise à reconditionner', type:'appro', duree:1, lieuId:'L_ENTREE', machineId:null, notes:'Décharge, tri par type d\'article' },
        { id:'e2', nom:'Déconditionnement & tri',               type:'prod',  duree:1, lieuId:'L_DECONDI', machineId:null, notes:'Ouverture cartons, retrait protections' },
        { id:'e3', nom:'Reconditionnement premium',            type:'prod',  duree:2, lieuId:'L_RECONDI', machineId:null, notes:'Mise en étui premium, film bulles, calage' },
        { id:'e4', nom:'Étiquetage articles',                  type:'prod',  duree:1, lieuId:'L_VALMONT', machineId:'M_ETIQUETTE', notes:'Application étiquettes client spécifiques' },
        { id:'e5', nom:'Filmage & pesée palette',             type:'prod',  duree:1, lieuId:'L_FILM', machineId:'M_FILM1', notes:'Mise palette, filmage renforcé, pesée' },
        { id:'e6', nom:'Packaging premium validé',            type:'jalon', duree:0, lieuId:'S_FINAL', machineId:null, notes:'Jalon : produit prêt client premium', jalon:true },
      ],
    },
    {
      id: 'MPRJ-009',
      nom: 'Banderollage & emballage palettes',
      couleur: '#fb7185',
      groupe: 'Emballage',
      description: 'Préparation palette → Banderollage → Contrôle → Étiquetage transport',
      etapes: [
        { id:'e1', nom:'Préparation articles pour banderollage', type:'prod', duree:1, lieuId:'L_ASSEMB', machineId:null, notes:'Regroupement articles, disposition optimale' },
        { id:'e2', nom:'Banderollage automatique',              type:'prod',  duree:1, lieuId:'L_BANDERO', machineId:'M_BANDEROLE', notes:'Passage à la banderoleuse, vérif serrage' },
        { id:'e3', nom:'Contrôle serrage & aspect',            type:'etude', duree:1, lieuId:'L_CONTROLE', machineId:null, notes:'Vérification bandeau, absence traces' },
        { id:'e4', nom:'Filmage palette complète',             type:'prod',  duree:1, lieuId:'L_FILM', machineId:'M_FILM1', notes:'Filmage pour protection transport' },
        { id:'e5', nom:'Étiquetage & pesée finale',            type:'prod',  duree:1, lieuId:'L_FILM', machineId:'M_BALANCE', notes:'Poids total, étiquette code-barres palette' },
        { id:'e6', nom:'Palette banderollée prête',            type:'jalon', duree:0, lieuId:'L_EXPEDITION', machineId:null, notes:'Jalon : palette prête enlèvement', jalon:true },
      ],
    },

    // ── GROUPE : CONDITIONNEMENT ─────────────────────────────────────────────
    {
      id: 'MPRJ-010',
      nom: 'Assemblage simple (2 pièces)',
      couleur: '#2563eb',
      groupe: 'Conditionnement',
      description: 'Appro composants → Assemblage simple → Contrôle → Etiquetage → Stock',
      etapes: [
        { id:'e1', nom:'Prélèvement composants (BOM)',    type:'appro', duree:1, lieuId:'S_ARRIVAGE', machineId:null, notes:'Picking selon bon de travail, tri références' },
        { id:'e2', nom:'Assemblage 2 pièces',             type:'prod',  duree:1, lieuId:'L_ASSEMB', machineId:null, notes:'Montage selon fiche technique, contrôle visuel' },
        { id:'e3', nom:'Contrôle assemblage',             type:'etude', duree:1, lieuId:'L_CONTROLE', machineId:'M_SCANNER', notes:'Vérification fonctionnelle et esthétique' },
        { id:'e4', nom:'Étiquetage & conditionnement',   type:'prod',  duree:1, lieuId:'L_RECONDI', machineId:'M_ETIQUETTE', notes:'Mise en étui, étiquette code-barres' },
        { id:'e5', nom:'Produit fini en stock',           type:'jalon', duree:0, lieuId:'S_FINAL', machineId:null, notes:'Jalon : articles disponibles', jalon:true },
      ],
    },
    {
      id: 'MPRJ-011',
      nom: 'Assemblage complexe multi-pièces',
      couleur: '#6366f1',
      groupe: 'Conditionnement',
      description: 'Appro → Contrôle composants → Assemblage 5+ pièces → QC → Emballage premium',
      etapes: [
        { id:'e1', nom:'Réception & déstockage composants', type:'appro', duree:1, lieuId:'L_ENTREE', machineId:null, notes:'Prise en charge du kit de composants' },
        { id:'e2', nom:'Contrôle qualité composants',      type:'etude', duree:1, lieuId:'L_CONTROLE', machineId:'M_SCANNER', notes:'Vérification conforme tous composants' },
        { id:'e3', nom:'Préparation poste de travail',     type:'prod',  duree:1, lieuId:'L_ASSEMB', machineId:null, notes:'Mise en place outillage, fiches assemblage' },
        { id:'e4', nom:'Assemblage complexe 5+ pièces',    type:'prod',  duree:3, lieuId:'L_ASSEMB', machineId:null, notes:'Montage séquentiel, contrôle intermédiaire' },
        { id:'e5', nom:'Contrôle qualité final',          type:'etude', duree:1, lieuId:'L_CONTROLE', machineId:null, notes:'Contrôle fonctionnel complet avant emballage' },
        { id:'e6', nom:'Emballage & calage premium',      type:'prod',  duree:1, lieuId:'L_RECONDI', machineId:null, notes:'Film bulles, calage carton, étui renforcé' },
        { id:'e7', nom:'Étiquetage & identification',     type:'prod',  duree:1, lieuId:'L_VALMONT', machineId:'M_ETIQUETTE', notes:'Étiquette produit et étiquette carton' },
        { id:'e8', nom:'Kit assemblé validé',             type:'jalon', duree:0, lieuId:'S_FINAL', machineId:null, notes:'Jalon : assemblage terminé et validé', jalon:true },
      ],
    },
    {
      id: 'MPRJ-012',
      nom: 'Assemblage avec callage renforcé',
      couleur: '#3b82f6',
      groupe: 'Conditionnement',
      description: 'Appro → Assemblage → Callage mousse → Protection multicouche → Banderollage → Expédition',
      etapes: [
        { id:'e1', nom:'Appro matières & composants',     type:'appro', duree:1, lieuId:'L_ENTREE', machineId:null, notes:'Décharge palette, tri par type' },
        { id:'e2', nom:'Assemblage avec contrôle',        type:'prod',  duree:2, lieuId:'L_ASSEMB', machineId:null, notes:'Montage mécanique, contrôles intermédiaires' },
        { id:'e3', nom:'Callage mousse & support',        type:'prod',  duree:1, lieuId:'L_CALLAGE', machineId:null, notes:'Mise en place mousse, supports, protection' },
        { id:'e4', nom:'Emballage film bulles',           type:'prod',  duree:1, lieuId:'L_RECONDI', machineId:null, notes:'Enroulage film protection renforcée' },
        { id:'e5', nom:'Mise en carton & fermeture',      type:'prod',  duree:1, lieuId:'L_RECONDI', machineId:null, notes:'Carton fermé, scotch, renforts' },
        { id:'e6', nom:'Banderollage & sécurisation',     type:'prod',  duree:1, lieuId:'L_BANDERO', machineId:'M_BANDEROLE', notes:'Bandeaux renforcés, vérification serrage' },
        { id:'e7', nom:'Étiquetage transport & pesée',    type:'prod',  duree:1, lieuId:'L_FILM', machineId:'M_BALANCE', notes:'Étiquettes code-barres transport, pesée' },
        { id:'e8', nom:'Prêt expédition sécurisé',        type:'jalon', duree:0, lieuId:'L_EXPEDITION', machineId:null, notes:'Jalon : produit robuste et assuré', jalon:true },
      ],
    },
  ];
}
