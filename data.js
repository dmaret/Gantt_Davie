// Données + persistance localStorage + seed réaliste
const STORAGE_KEY = 'atelier_plan_v3';

const DB = {
  state: null,
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { this.state = JSON.parse(raw); this.migrate(); this._pushHistory(); return; }
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

  // 7 lieux de production
  const lieux = [
    { id: 'L_ATEL_2A', nom: 'Atelier 2A', etage: '2e', type: 'production', capacite: 8 },
    { id: 'L_ATEL_2B', nom: 'Atelier 2B', etage: '2e', type: 'production', capacite: 6 },
    { id: 'L_ATEL_1A', nom: 'Atelier 1A', etage: '1er', type: 'production', capacite: 10 },
    { id: 'L_ATEL_1B', nom: 'Atelier 1B', etage: '1er', type: 'production', capacite: 8 },
    { id: 'L_MONT_1',  nom: 'Montage 1',  etage: '1er', type: 'production', capacite: 12 },
    { id: 'L_FINI',    nom: 'Finition',   etage: 'Rez', type: 'production', capacite: 6 },
    { id: 'L_LIVR',    nom: 'Expédition', etage: 'Rez', type: 'production', capacite: 4 },
    // 12 stockages
    { id: 'S_REZ_ARR', nom: 'Rez · Arrivages',     etage: 'Rez', type: 'stockage', capacite: 100 },
    { id: 'S_REZ_EXP', nom: 'Rez · Quai expé',     etage: 'Rez', type: 'stockage', capacite: 60  },
    { id: 'S_SS_T1',   nom: 'SS · Tampon 1',       etage: 'S-sol', type: 'stockage', capacite: 200 },
    { id: 'S_SS_T2',   nom: 'SS · Tampon 2',       etage: 'S-sol', type: 'stockage', capacite: 200 },
    { id: 'S_SS_ARCH', nom: 'SS · Archives',       etage: 'S-sol', type: 'stockage', capacite: 80  },
    { id: 'S_1_MAT',   nom: '1er · Matières',      etage: '1er', type: 'stockage', capacite: 120 },
    { id: 'S_1_CONS',  nom: '1er · Consommables',  etage: '1er', type: 'stockage', capacite: 80  },
    { id: 'S_1_OUT',   nom: '1er · Outillage',     etage: '1er', type: 'stockage', capacite: 60  },
    { id: 'S_2_MAT',   nom: '2e · Matières',       etage: '2e', type: 'stockage', capacite: 80  },
    { id: 'S_2_CONS',  nom: '2e · Consommables',   etage: '2e', type: 'stockage', capacite: 60  },
    { id: 'S_2_PROTO', nom: '2e · Prototypes',     etage: '2e', type: 'stockage', capacite: 40  },
    { id: 'S_REZ_CHIM',nom: 'Rez · Produits chim.',etage: 'Rez', type: 'stockage', capacite: 30  },
  ];

  // Machines par lieu de production
  const machines = [
    { id:'M_CNC1', nom:'CNC 1',         lieuId:'L_ATEL_2A', type:'CNC', capaciteJour:8 },
    { id:'M_CNC2', nom:'CNC 2',         lieuId:'L_ATEL_2A', type:'CNC', capaciteJour:8 },
    { id:'M_LASER',nom:'Découpe laser', lieuId:'L_ATEL_2B', type:'Laser', capaciteJour:8 },
    { id:'M_PLI1', nom:'Plieuse 1',     lieuId:'L_ATEL_1A', type:'Pliage', capaciteJour:8 },
    { id:'M_PLI2', nom:'Plieuse 2',     lieuId:'L_ATEL_1A', type:'Pliage', capaciteJour:8 },
    { id:'M_SOUD1',nom:'Poste soudure 1',lieuId:'L_ATEL_1B',type:'Soudure',capaciteJour:8 },
    { id:'M_SOUD2',nom:'Poste soudure 2',lieuId:'L_ATEL_1B',type:'Soudure',capaciteJour:8 },
    { id:'M_PEINT',nom:'Cabine peinture',lieuId:'L_FINI',  type:'Peinture',capaciteJour:8 },
    { id:'M_MONT', nom:'Ligne montage', lieuId:'L_MONT_1', type:'Montage', capaciteJour:16 },
    { id:'M_TEST', nom:'Banc test',     lieuId:'L_MONT_1', type:'Contrôle',capaciteJour:8 },
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

  const roles = ['Chef·fe de projet','Technicien·ne','Opérateur·rice','Soudeur·se','Monteur·se',
                 'Peintre','Contrôleur·se','Logisticien·ne','Designer','Ingénieur·e'];
  const competences = ['CNC','Laser','Pliage','Soudure','Peinture','Montage','Contrôle',
                       'Élec','CAO','Logistique','Management','Qualité'];

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

  // 6 projets actifs — clients suisses, durées en jours ouvrés
  const startWD = D.nextWorkday(start);
  const projets = [
    { id:'PRJ_A', code:'PRJ-A', nom:'Châssis série A',      client:'Migros Industrie SA', couleur:'#2c5fb3', debut: startWD,                      fin: D.addWorkdays(startWD, 39), etage:'1er', priorite:'haute', statut:'en-cours'},
    { id:'PRJ_B', code:'PRJ-B', nom:'Prototype B-Quantum',  client:'CERN',                couleur:'#7c3aed', debut: D.addWorkdays(startWD, 4),    fin: D.addWorkdays(startWD, 27), etage:'2e',  priorite:'haute', statut:'en-cours'},
    { id:'PRJ_C', code:'PRJ-C', nom:'Refonte ligne C',      client:'Interne',             couleur:'#1f8a4c', debut: D.nextWorkday(D.addDays(startWD,-3)), fin: D.addWorkdays(startWD, 32), etage:'1er', priorite:'moyenne', statut:'en-cours'},
    { id:'PRJ_D', code:'PRJ-D', nom:'Série D — Export',     client:'CFF SA',              couleur:'#c47800', debut: D.addWorkdays(startWD, 7),    fin: D.addWorkdays(startWD, 43), etage:'2e',  priorite:'haute', statut:'planifié'},
    { id:'PRJ_E', code:'PRJ-E', nom:'Maintenance E',        client:'Interne',             couleur:'#c43b3b', debut: D.addWorkdays(startWD, 14),   fin: D.addWorkdays(startWD, 24), etage:'1er', priorite:'basse', statut:'planifié'},
    { id:'PRJ_F', code:'PRJ-F', nom:'Étude F — Nouveau',    client:'Nestlé R&D',          couleur:'#0ea5b7', debut: D.addWorkdays(startWD, 18),   fin: D.addWorkdays(startWD, 50), etage:'2e',  priorite:'moyenne', statut:'planifié'},
  ];

  // Tâches pour chaque projet, affectations et machines/lieux
  const taches = [];
  let tCount = 0;
  const tpl = [
    { nom:'Études & plans',    duree:5,  comp:'CAO',     machine:null,      lieu:null,        type:'etude' },
    { nom:'Approvisionnement', duree:4,  comp:'Logistique', machine:null,   lieu:'S_REZ_ARR', type:'appro' },
    { nom:'Découpe',           duree:6,  comp:'Laser',   machine:'M_LASER', lieu:'L_ATEL_2B', type:'prod' },
    { nom:'Usinage CNC',       duree:7,  comp:'CNC',     machine:'M_CNC1',  lieu:'L_ATEL_2A', type:'prod' },
    { nom:'Pliage',            duree:4,  comp:'Pliage',  machine:'M_PLI1',  lieu:'L_ATEL_1A', type:'prod' },
    { nom:'Soudure',           duree:6,  comp:'Soudure', machine:'M_SOUD1', lieu:'L_ATEL_1B', type:'prod' },
    { nom:'Peinture',          duree:3,  comp:'Peinture',machine:'M_PEINT', lieu:'L_FINI',    type:'prod' },
    { nom:'Montage',           duree:7,  comp:'Montage', machine:'M_MONT',  lieu:'L_MONT_1',  type:'prod' },
    { nom:'Contrôle qualité',  duree:2,  comp:'Contrôle',machine:'M_TEST',  lieu:'L_MONT_1',  type:'prod' },
    { nom:'Expédition',        duree:1,  comp:'Logistique',machine:null,    lieu:'L_LIVR',    type:'livraison' },
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

  // Stock (articles)
  const stock = [
    { id:'ART001', ref:'ACI-3mm-1250', nom:'Tôle acier 3mm 1250x2500', unite:'pl', quantite:42, seuilAlerte:20, lieuId:'S_1_MAT', projetsLies:['PRJ_A','PRJ_D']},
    { id:'ART002', ref:'ACI-5mm-1250', nom:'Tôle acier 5mm 1250x2500', unite:'pl', quantite:8,  seuilAlerte:15, lieuId:'S_1_MAT', projetsLies:['PRJ_A']},
    { id:'ART003', ref:'INOX-2mm',     nom:'Tôle inox 2mm',            unite:'pl', quantite:30, seuilAlerte:10, lieuId:'S_1_MAT', projetsLies:['PRJ_B']},
    { id:'ART004', ref:'ALU-PROFIL-40',nom:'Profilé alu 40x40',        unite:'m',  quantite:120,seuilAlerte:50, lieuId:'S_2_MAT', projetsLies:['PRJ_B','PRJ_F']},
    { id:'ART005', ref:'ELEC-V2',      nom:'Électrode soudure V2',     unite:'kg', quantite:14, seuilAlerte:8,  lieuId:'S_1_CONS',projetsLies:['PRJ_A','PRJ_C']},
    { id:'ART006', ref:'PEINT-RAL-9005',nom:'Peinture RAL 9005',       unite:'L',  quantite:22, seuilAlerte:10, lieuId:'S_REZ_CHIM',projetsLies:['PRJ_A','PRJ_D','PRJ_C']},
    { id:'ART007', ref:'VIS-M8',       nom:'Visserie M8 (boîte 500)',  unite:'bo', quantite:18, seuilAlerte:6,  lieuId:'S_1_CONS',projetsLies:['PRJ_A','PRJ_B','PRJ_C','PRJ_D']},
    { id:'ART008', ref:'JOINT-EPDM',   nom:'Joint EPDM 10mm',          unite:'m',  quantite:4,  seuilAlerte:20, lieuId:'S_SS_T1', projetsLies:['PRJ_C']},
    { id:'ART009', ref:'ROUL-6204',    nom:'Roulement 6204',           unite:'p',  quantite:60, seuilAlerte:20, lieuId:'S_1_OUT', projetsLies:['PRJ_A','PRJ_D']},
    { id:'ART010', ref:'PROTO-CARTE',  nom:'Carte proto révision 4',   unite:'p',  quantite:3,  seuilAlerte:5,  lieuId:'S_2_PROTO',projetsLies:['PRJ_B','PRJ_F']},
    { id:'ART011', ref:'EMB-CAISSE-L', nom:'Caisse bois L',            unite:'p',  quantite:15, seuilAlerte:8,  lieuId:'S_REZ_EXP',projetsLies:['PRJ_A','PRJ_D']},
    { id:'ART012', ref:'PRODUIT-NETT', nom:'Solvant nettoyage',        unite:'L',  quantite:38, seuilAlerte:15, lieuId:'S_REZ_CHIM',projetsLies:[]},
  ];

  // Déplacements prévus (dates sur jours ouvrés)
  const deplacements = [
    { id:'DEP001', date: D.addWorkdays(today, 2), personneId:'P001', origineId:'L_ATEL_2A', destinationId:'L_ATEL_1A', motif:'Installation machine', projetId:'PRJ_A', duree:'2h'},
    { id:'DEP002', date: D.addWorkdays(today, 3), personneId:'P010', origineId:'L_MONT_1',  destinationId:'L_FINI',    motif:'Transfert pièces',     projetId:'PRJ_C', duree:'1h'},
    { id:'DEP003', date: D.addWorkdays(today, 5), personneId:'P020', origineId:'L_ATEL_2B', destinationId:'L_ATEL_1B', motif:'Entretien',            projetId:null,    duree:'3h'},
    { id:'DEP004', date: D.addWorkdays(today, 7), personneId:'P003', origineId:'L_FINI',    destinationId:'L_LIVR',    motif:'Livraison interne',    projetId:'PRJ_A', duree:'30min'},
  ];

  // Commandes (avec workflow "4A") — montants en CHF, TVA suisse 8,1 %
  // Règle: une commande doit être validée par 4 axes/rôles avant engagement:
  // A1 Chef de projet, A2 Logistique, A3 Direction technique, A4 Contrôle budget.
  const TVA = 8.1;
  const commandes = [
    { id:'CMD001', ref:'CMD-2026-001', fournisseur:'Acier Romand SA', projetId:'PRJ_A', montantHT:  8400, tauxTVA: TVA, dateDemande: D.addWorkdays(today,-5), validations:{A1:true,A2:true,A3:true,A4:true},  statut:'engagée',   lignes:[{articleId:'ART001',qte:20}]},
    { id:'CMD002', ref:'CMD-2026-002', fournisseur:'SoudElec SA',     projetId:'PRJ_C', montantHT:  1200, tauxTVA: TVA, dateDemande: D.addWorkdays(today,-3), validations:{A1:true,A2:true,A3:false,A4:false},statut:'en-attente',lignes:[{articleId:'ART005',qte:10}]},
    { id:'CMD003', ref:'CMD-2026-003', fournisseur:'Peinture Vaud',   projetId:'PRJ_D', montantHT:  3600, tauxTVA: TVA, dateDemande: D.addWorkdays(today,-2), validations:{A1:true,A2:false,A3:false,A4:false},statut:'en-attente',lignes:[{articleId:'ART006',qte:30}]},
    { id:'CMD004', ref:'CMD-2026-004', fournisseur:'Joints Helvetia', projetId:'PRJ_C', montantHT:   640, tauxTVA: TVA, dateDemande: D.addWorkdays(today,-1), validations:{A1:false,A2:false,A3:false,A4:false},statut:'brouillon', lignes:[{articleId:'ART008',qte:40}]},
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
      nom: 'Logistique entrée-sortie complète',
      couleur: '#2c5fb3',
      groupe: 'Logistique',
      description: 'Réception → Contrôle → Étiquetage → Assemblage/Reconditionnement → Emballage → Expédition → Facturation',
      etapes: [
        { id:'e1', nom:'Réception marchandise',       type:'appro',     duree:1, gestes:['REC-01','REC-02','REC-03','REC-04','REC-05'], dependsDe:[], notes:'Décharge, contrôle visuel palette et déballage' },
        { id:'e2', nom:'Contrôle qualité entrée',     type:'etude',     duree:1, gestes:['CTR-01','CTR-02'], dependsDe:['e1'], notes:'Contrôle visuel unitaire et conformité' },
        { id:'e3', nom:'Identification & étiquetage', type:'prod',      duree:1, gestes:['ETI-01','ETI-05','ETI-06'], dependsDe:['e2'], notes:'Impression et collage des étiquettes' },
        { id:'e4', nom:'Assemblage & reconditionnement', type:'prod',   duree:2, gestes:['PRE-01','PRE-02','PRE-03','ASS-01','ASS-06'], dependsDe:['e3'], notes:'Picking, reconditionnement, assemblage kits' },
        { id:'e5', nom:'Contrôle final avant expédition', type:'etude', duree:1, gestes:['CTR-03'], dependsDe:['e4'], notes:'Mise en conformité caisse/carton' },
        { id:'e6', nom:'Emballage & filmage',         type:'prod',      duree:1, gestes:['ASS-03','ASS-06','EXP-01','EXP-02'], dependsDe:['e5'], notes:'Film bulles, filmage palette, pesée' },
        { id:'e7', nom:'Mise à disposition / Expédition', type:'livraison', duree:1, gestes:['EXP-03','EXP-04'], dependsDe:['e6'], notes:'Remise au transporteur ou dépôt Poste' },
        { id:'e8', nom:'Facturation & clôture projet',type:'jalon',     duree:0, gestes:[], dependsDe:['e7'], notes:'Jalon de fin — édition de la facture', jalon:true },
      ],
    },
    {
      id: 'MPRJ-002',
      nom: 'Réception & mise en stock',
      couleur: '#059669',
      groupe: 'Logistique',
      description: 'Flux court : réception → contrôle → rangement stock',
      etapes: [
        { id:'e1', nom:'Réception palette',           type:'appro',  duree:1, gestes:['REC-01','REC-02','REC-04','REC-05'], dependsDe:[], notes:'' },
        { id:'e2', nom:'Contrôle & identification',   type:'etude',  duree:1, gestes:['CTR-01','ETI-01','ETI-05'], dependsDe:['e1'], notes:'' },
        { id:'e3', nom:'Rangement stock',             type:'prod',   duree:1, gestes:['STO-01','STO-02'], dependsDe:['e2'], notes:'FIFO respecté' },
        { id:'e4', nom:'Stock disponible',            type:'jalon',  duree:0, gestes:[], dependsDe:['e3'], notes:'Jalon : articles disponibles à la préparation', jalon:true },
      ],
    },
    {
      id: 'MPRJ-003',
      nom: 'Préparation & expédition commande',
      couleur: '#f59e0b',
      groupe: 'Logistique',
      description: 'Picking → conditionnement → contrôle → expédition',
      etapes: [
        { id:'e1', nom:'Préparation commande (picking)', type:'prod', duree:1, gestes:['PRE-01','PRE-02','STO-03'], dependsDe:[], notes:'Bon de préparation imprimé' },
        { id:'e2', nom:'Conditionnement & filmage',   type:'prod',   duree:1, gestes:['ASS-09','ASS-06','EXP-01'], dependsDe:['e1'], notes:'' },
        { id:'e3', nom:'Contrôle expédition',         type:'etude',  duree:1, gestes:['CTR-03','ETI-02'], dependsDe:['e2'], notes:'' },
        { id:'e4', nom:'Expédition',                  type:'livraison', duree:1, gestes:['EXP-02','EXP-03','EXP-04'], dependsDe:['e3'], notes:'Filmer palette, remettre au transporteur' },
        { id:'e5', nom:'Expédié',                     type:'jalon',  duree:0, gestes:[], dependsDe:['e4'], notes:'Jalon : colis remis au transporteur', jalon:true },
      ],
    },
    {
      id: 'MPRJ-004',
      nom: 'Inventaire & réorganisation stock',
      couleur: '#0891b2',
      groupe: 'Logistique',
      description: 'Comptage physique → mise à jour stock → réorganisation FIFO',
      etapes: [
        { id:'e1', nom:'Préparation inventaire',      type:'etude',    duree:1, gestes:['PRE-01'], dependsDe:[], notes:'Impression listes de comptage par zone' },
        { id:'e2', nom:'Comptage physique',           type:'prod',     duree:2, gestes:['STO-04','CTR-01'], dependsDe:['e1'], notes:'Comptage par zone, double comptage si écart' },
        { id:'e3', nom:'Rapprochement & ajustements', type:'etude',    duree:1, gestes:[], dependsDe:['e2'], notes:'Comparaison stock théorique / physique, corrections' },
        { id:'e4', nom:'Réorganisation stock',        type:'prod',     duree:1, gestes:['STO-01','STO-02'], dependsDe:['e3'], notes:'Remise en ordre FIFO, dégagement zones mortes' },
        { id:'e5', nom:'Inventaire validé',           type:'jalon',    duree:0, gestes:[], dependsDe:['e4'], notes:'Jalon : stock certifié et à jour', jalon:true },
      ],
    },
    {
      id: 'MPRJ-005',
      nom: 'Transfert inter-dépôts',
      couleur: '#7c3aed',
      groupe: 'Logistique',
      description: 'Prélèvement → filmage → expédition → réception & rangement site destinataire',
      etapes: [
        { id:'e1', nom:'Préparation envoi',           type:'prod',     duree:1, gestes:['PRE-01','PRE-02','STO-03'], dependsDe:[], notes:'Bon de transfert, picking articles à transférer' },
        { id:'e2', nom:'Filmage & étiquetage transport', type:'prod',  duree:1, gestes:['EXP-02','ETI-01','ETI-02'], dependsDe:['e1'], notes:'Palette filmée, étiquette transporteur apposée' },
        { id:'e3', nom:'Chargement & départ',         type:'livraison',duree:1, gestes:['EXP-04'], dependsDe:['e2'], notes:'Remise au transporteur, émargement CMR' },
        { id:'e4', nom:'Réception site destinataire', type:'appro',    duree:1, gestes:['REC-01','REC-02'], dependsDe:['e3'], notes:'Contrôle intégrité palette à réception' },
        { id:'e5', nom:'Rangement stock destinataire',type:'prod',     duree:1, gestes:['STO-01','STO-02'], dependsDe:['e4'], notes:'FIFO, mise à jour stock' },
        { id:'e6', nom:'Transfert complété',          type:'jalon',    duree:0, gestes:[], dependsDe:['e5'], notes:'Jalon : stock transféré et réceptionné', jalon:true },
      ],
    },
    {
      id: 'MPRJ-006',
      nom: 'Retours & traitement SAV',
      couleur: '#dc2626',
      groupe: 'Logistique',
      description: 'Réception retour → diagnostic → tri → reconditionnement ou élimination',
      etapes: [
        { id:'e1', nom:'Réception retour client',     type:'appro',    duree:1, gestes:['REC-01','REC-02','REC-03'], dependsDe:[], notes:'Vérifier bon de retour, état palette/colis' },
        { id:'e2', nom:'Contrôle & diagnostic',       type:'etude',    duree:1, gestes:['CTR-01','CTR-02'], dependsDe:['e1'], notes:'Contrôle état produit, identification cause retour' },
        { id:'e3', nom:'Tri (restock / rebut / répa)',type:'etude',    duree:1, gestes:['STO-02'], dependsDe:['e2'], notes:'Séparation physique des lots selon décision' },
        { id:'e4', nom:'Reconditionnement réutilisable',type:'prod',   duree:2, gestes:['ETI-03','ASS-03','ASS-06','ETI-01'], dependsDe:['e3'], notes:'Retrait étiquettes, reconditionnement, ré-étiquetage' },
        { id:'e5', nom:'Remise en stock ou élimination',type:'prod',   duree:1, gestes:['STO-02'], dependsDe:['e4'], notes:'Retour en stock conforme ou évacuation rebut' },
        { id:'e6', nom:'Dossier SAV clôturé',         type:'jalon',    duree:0, gestes:[], dependsDe:['e5'], notes:'Jalon : dossier retour traité et clôturé', jalon:true },
      ],
    },

    // ── GROUPE : EMBALLAGE ───────────────────────────────────────────────────
    {
      id: 'MPRJ-007',
      nom: 'Étiquetage en série',
      couleur: '#0d9488',
      groupe: 'Emballage',
      description: 'Réception articles → impression étiquettes → pose en série → contrôle → remise en stock',
      etapes: [
        { id:'e1', nom:'Réception articles à étiqueter', type:'appro', duree:1, gestes:['REC-03','REC-05'], dependsDe:[], notes:'Comptage et vérification des articles à traiter' },
        { id:'e2', nom:'Préparation & impression étiquettes', type:'etude', duree:1, gestes:['ETI-01'], dependsDe:['e1'], notes:'Configuration imprimante, maquette validée' },
        { id:'e3', nom:'Étiquetage en série',           type:'prod',   duree:2, gestes:['ETI-02','ETI-04','ETI-05'], dependsDe:['e2'], notes:'Collage étiquettes, orientation selon consignes' },
        { id:'e4', nom:'Contrôle conformité',           type:'etude',  duree:1, gestes:['CTR-01'], dependsDe:['e3'], notes:'Vérification lisibilité code-barres, positionnement' },
        { id:'e5', nom:'Reconditionnement & stock',     type:'prod',   duree:1, gestes:['STO-02'], dependsDe:['e4'], notes:'Remise en carton, rangement stock' },
        { id:'e6', nom:'Lot étiqueté disponible',       type:'jalon',  duree:0, gestes:[], dependsDe:['e5'], notes:'Jalon : lot prêt à expédier', jalon:true },
      ],
    },
    {
      id: 'MPRJ-008',
      nom: 'Kit promotionnel & display',
      couleur: '#e11d48',
      groupe: 'Emballage',
      description: 'Réception composants → formage → kitting → étiquetage → mise en carton maître',
      etapes: [
        { id:'e1', nom:'Réception composants',         type:'appro',  duree:1, gestes:['REC-01','REC-02','REC-04','REC-05'], dependsDe:[], notes:'Contrôle des composants du kit à réception' },
        { id:'e2', nom:'Contrôle composants',          type:'etude',  duree:1, gestes:['CTR-01','CTR-02'], dependsDe:['e1'], notes:'Conformité dimensions, états, quantités' },
        { id:'e3', nom:'Formage étuis & étui-fourreau', type:'prod',  duree:2, gestes:['ASS-08','ASS-09','ASS-10','ASS-16'], dependsDe:['e2'], notes:'Montage étuis, fourreaux orientés' },
        { id:'e4', nom:'Insertion & assemblage kit',   type:'prod',   duree:2, gestes:['ASS-12','ASS-14','ASS-05'], dependsDe:['e3'], notes:'Insertion composants, fermeture sachet si nécessaire' },
        { id:'e5', nom:'Étiquetage final',             type:'prod',   duree:1, gestes:['ETI-01','ETI-02','ETI-04'], dependsDe:['e4'], notes:'Impression et collage étiquettes finales' },
        { id:'e6', nom:'Contrôle final & filmage',     type:'etude',  duree:1, gestes:['CTR-03','ASS-06'], dependsDe:['e5'], notes:'Mise en conformité, filmage unitaire' },
        { id:'e7', nom:'Mise en carton maître',        type:'prod',   duree:1, gestes:['ASS-04','ASS-09'], dependsDe:['e6'], notes:'Calage, fermeture carton maître' },
        { id:'e8', nom:'Kit prêt à expédier',          type:'jalon',  duree:0, gestes:[], dependsDe:['e7'], notes:'Jalon : production kit terminée', jalon:true },
      ],
    },
    {
      id: 'MPRJ-009',
      nom: 'Reconditionnement palette complète',
      couleur: '#92400e',
      groupe: 'Emballage',
      description: 'Dépalettisation → retrait étiquettes → reconditionnement unitaire → ré-étiquetage → reformation palette',
      etapes: [
        { id:'e1', nom:'Réception palette à reconditionner', type:'appro', duree:1, gestes:['REC-01','REC-02'], dependsDe:[], notes:'Contrôle état palette, comptage articles' },
        { id:'e2', nom:'Dépalettisation & contrôle état',    type:'prod',  duree:1, gestes:['REC-03','CTR-01'], dependsDe:['e1'], notes:'Dépose article par article, tri selon état' },
        { id:'e3', nom:'Retrait anciennes étiquettes',        type:'prod',  duree:1, gestes:['ETI-03'], dependsDe:['e2'], notes:'Décapeur thermique si nécessaire' },
        { id:'e4', nom:'Reconditionnement unitaire',          type:'prod',  duree:2, gestes:['ASS-06','ASS-07','ASS-09','ASS-16'], dependsDe:['e3'], notes:'Filmage, bandage, remise en étui selon besoin' },
        { id:'e5', nom:'Ré-étiquetage',                       type:'prod',  duree:1, gestes:['ETI-01','ETI-02'], dependsDe:['e4'], notes:'Nouvelles étiquettes, orientation correcte' },
        { id:'e6', nom:'Reformation palette',                  type:'prod',  duree:1, gestes:['STO-01','EXP-02'], dependsDe:['e5'], notes:'Palettisation, filmage palette finale' },
        { id:'e7', nom:'Palette reconditionnée validée',      type:'jalon', duree:0, gestes:[], dependsDe:['e6'], notes:'Jalon : palette prête pour expédition', jalon:true },
      ],
    },

    // ── GROUPE : ASSEMBLAGE ──────────────────────────────────────────────────
    {
      id: 'MPRJ-010',
      nom: 'Assemblage kit 2 pièces',
      couleur: '#2563eb',
      groupe: 'Assemblage',
      description: 'Appro composants → assemblage simple → contrôle → conditionnement → stock produit fini',
      etapes: [
        { id:'e1', nom:'Appro & prélèvement composants', type:'appro', duree:1, gestes:['PRE-01','PRE-02','STO-03'], dependsDe:[], notes:'Bon de travail, prélèvement selon BOM' },
        { id:'e2', nom:'Assemblage kit 2 pièces',         type:'prod',  duree:2, gestes:['ASS-01','ASS-14'], dependsDe:['e1'], notes:'Assemblage selon fiche technique, contrôle visuel' },
        { id:'e3', nom:'Contrôle assemblage',             type:'etude', duree:1, gestes:['CTR-01'], dependsDe:['e2'], notes:'Vérification fonctionnelle et esthétique' },
        { id:'e4', nom:'Conditionnement final',           type:'prod',  duree:1, gestes:['ASS-09','ETI-02','EXP-01'], dependsDe:['e3'], notes:'Mise en étui, étiquetage, pesée' },
        { id:'e5', nom:'Produit fini en stock',           type:'jalon', duree:0, gestes:[], dependsDe:['e4'], notes:'Jalon : produit disponible en stock', jalon:true },
      ],
    },
    {
      id: 'MPRJ-011',
      nom: 'Assemblage kit multi-composants',
      couleur: '#7c3aed',
      groupe: 'Assemblage',
      description: 'Appro → contrôle composants → assemblage complexe → CQ → emballage → expédition',
      etapes: [
        { id:'e1', nom:'Appro & réception composants',   type:'appro', duree:1, gestes:['REC-04','REC-05','PRE-02'], dependsDe:[], notes:'Réception et comptage de tous les composants' },
        { id:'e2', nom:'Contrôle entrée composants',      type:'etude', duree:1, gestes:['CTR-01','CTR-02'], dependsDe:['e1'], notes:'Vérification conformité chaque référence' },
        { id:'e3', nom:'Préparation poste de travail',    type:'prod',  duree:1, gestes:['PRE-01'], dependsDe:['e2'], notes:'Mise en place outillage, fiches de travail' },
        { id:'e4', nom:'Assemblage kit 3-5 pièces',       type:'prod',  duree:3, gestes:['ASS-02','ASS-12','ASS-14'], dependsDe:['e3'], notes:'Assemblage complexe selon fiche technique, contrôle intermédiaire' },
        { id:'e5', nom:'Contrôle qualité assemblage',     type:'etude', duree:1, gestes:['CTR-02','CTR-03'], dependsDe:['e4'], notes:'Contrôle final assemblage avant emballage' },
        { id:'e6', nom:'Emballage & protection',          type:'prod',  duree:1, gestes:['ASS-03','ASS-05','ASS-06'], dependsDe:['e5'], notes:'Film bulles, sachet, filmage unitaire' },
        { id:'e7', nom:'Étiquetage & identification',     type:'prod',  duree:1, gestes:['ETI-01','ETI-02'], dependsDe:['e6'], notes:'Étiquette produit fini et étiquette carton' },
        { id:'e8', nom:'Produit fini validé',             type:'jalon', duree:0, gestes:[], dependsDe:['e7'], notes:'Jalon : kit assemblé, contrôlé et conditionné', jalon:true },
      ],
    },
    {
      id: 'MPRJ-012',
      nom: 'Assemblage avec protection renforcée',
      couleur: '#0f766e',
      groupe: 'Assemblage',
      description: 'Appro → pliage/formage → assemblage avec calage → protection multicouche → banderolage → expédition',
      etapes: [
        { id:'e1', nom:'Appro matières & composants',    type:'appro', duree:1, gestes:['PRE-02','STO-03'], dependsDe:[], notes:'Prélèvement selon BOM, vérification référence' },
        { id:'e2', nom:'Pliage & formage composants',    type:'prod',  duree:2, gestes:['ASS-15','ASS-16','ASS-08'], dependsDe:['e1'], notes:'Pliage complexe, formage étuis et fourreaux' },
        { id:'e3', nom:'Assemblage avec calage',         type:'prod',  duree:2, gestes:['ASS-04','ASS-01','ASS-07'], dependsDe:['e2'], notes:'Assemblage, mise en place calage carton' },
        { id:'e4', nom:'Protection film bulles',         type:'prod',  duree:1, gestes:['ASS-03','ASS-06'], dependsDe:['e3'], notes:'Enroulage film bulles, filmage unitaire renforcé' },
        { id:'e5', nom:'Cerclage & banderolage final',   type:'prod',  duree:1, gestes:['ASS-07','ASS-11'], dependsDe:['e4'], notes:'Banderolage et groupage avec élastique si nécessaire' },
        { id:'e6', nom:'Pesée & étiquetage transport',   type:'prod',  duree:1, gestes:['EXP-01','ETI-01','ETI-02'], dependsDe:['e5'], notes:'Pesée précision, étiquettes transport et client' },
        { id:'e7', nom:'Prêt à expédier',                type:'jalon', duree:0, gestes:[], dependsDe:['e6'], notes:'Jalon : produit protégé, pesé et étiqueté', jalon:true },
      ],
    },
  ];
}
