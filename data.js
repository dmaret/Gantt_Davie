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
    if (!this.state.audit) this.state.audit = [];
    if (!this.state.modeles) this.state.modeles = [];
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
  reset() { this.state = seed(); this.save(); },
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
function defaultGroupes() {
  return {
    utilisateur: { libelle:'Utilisateur', description:'Consultation seule', perms:{ read:true, edit:false, sign:false, engage:false, admin:false, whatif:false, reset:false } },
    MSP:         { libelle:'MSP',         description:'Édition + signature des axes autorisés', perms:{ read:true, edit:true,  sign:true,  engage:true,  admin:false, whatif:true,  reset:false } },
    admin:       { libelle:'Admin',       description:'Tous droits + gestion utilisateurs',     perms:{ read:true, edit:true,  sign:true,  engage:true,  admin:true,  whatif:true,  reset:true  } },
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
