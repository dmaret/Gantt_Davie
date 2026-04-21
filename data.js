// Données + persistance localStorage + seed réaliste
const STORAGE_KEY = 'atelier_plan_v1';

const DB = {
  state: null,
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { this.state = JSON.parse(raw); return; }
    } catch (e) { console.warn('load failed', e); }
    this.state = seed();
    this.save();
  },
  save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); },
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

// Utilitaires date (YYYY-MM-DD)
const D = {
  today() { const d = new Date(); return D.iso(d); },
  iso(d)  { return d.toISOString().slice(0,10); },
  parse(s) { return new Date(s + 'T00:00:00'); },
  addDays(s, n) { const d = D.parse(s); d.setDate(d.getDate()+n); return D.iso(d); },
  diffDays(a, b) { return Math.round((D.parse(b)-D.parse(a))/86400000); },
  isWeekend(s) { const d = D.parse(s).getDay(); return d===0 || d===6; },
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
    return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });
  }
};

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

  // 6 projets actifs — toutes les durées en jours ouvrés
  const startWD = D.nextWorkday(start);
  const projets = [
    { id:'PRJ_A', code:'PRJ-A', nom:'Châssis série A',      client:'Dupuis SA',   couleur:'#2c5fb3', debut: startWD,                      fin: D.addWorkdays(startWD, 39), etage:'1er', priorite:'haute', statut:'en-cours'},
    { id:'PRJ_B', code:'PRJ-B', nom:'Prototype B-Quantum',  client:'Nexalys',     couleur:'#7c3aed', debut: D.addWorkdays(startWD, 4),    fin: D.addWorkdays(startWD, 27), etage:'2e',  priorite:'haute', statut:'en-cours'},
    { id:'PRJ_C', code:'PRJ-C', nom:'Refonte ligne C',      client:'Interne',     couleur:'#1f8a4c', debut: D.nextWorkday(D.addDays(startWD,-3)), fin: D.addWorkdays(startWD, 32), etage:'1er', priorite:'moyenne', statut:'en-cours'},
    { id:'PRJ_D', code:'PRJ-D', nom:'Série D — Export',     client:'Orion GmbH',  couleur:'#c47800', debut: D.addWorkdays(startWD, 7),    fin: D.addWorkdays(startWD, 43), etage:'2e',  priorite:'haute', statut:'planifié'},
    { id:'PRJ_E', code:'PRJ-E', nom:'Maintenance E',        client:'Interne',     couleur:'#c43b3b', debut: D.addWorkdays(startWD, 14),   fin: D.addWorkdays(startWD, 24), etage:'1er', priorite:'basse', statut:'planifié'},
    { id:'PRJ_F', code:'PRJ-F', nom:'Étude F — Nouveau',    client:'VertMétal',   couleur:'#0ea5b7', debut: D.addWorkdays(startWD, 18),   fin: D.addWorkdays(startWD, 50), etage:'2e',  priorite:'moyenne', statut:'planifié'},
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

  // Commandes (avec workflow "4A")
  // Règle: une commande doit être validée par 4 axes/rôles avant engagement:
  // A1 Chef de projet, A2 Logistique, A3 Direction technique, A4 Contrôle budget.
  const commandes = [
    { id:'CMD001', ref:'CMD-2026-001', fournisseur:'AcierPlus', projetId:'PRJ_A', montant:  8400, dateDemande: D.addDays(today,-5), validations:{A1:true,A2:true,A3:true,A4:true},  statut:'engagée',   lignes:[{articleId:'ART001',qte:20}]},
    { id:'CMD002', ref:'CMD-2026-002', fournisseur:'SoudElec',  projetId:'PRJ_C', montant:  1200, dateDemande: D.addDays(today,-3), validations:{A1:true,A2:true,A3:false,A4:false},statut:'en-attente',lignes:[{articleId:'ART005',qte:10}]},
    { id:'CMD003', ref:'CMD-2026-003', fournisseur:'PaintCo',   projetId:'PRJ_D', montant:  3600, dateDemande: D.addDays(today,-2), validations:{A1:true,A2:false,A3:false,A4:false},statut:'en-attente',lignes:[{articleId:'ART006',qte:30}]},
    { id:'CMD004', ref:'CMD-2026-004', fournisseur:'JointsPlus',projetId:'PRJ_C', montant:   640, dateDemande: D.addDays(today,-1), validations:{A1:false,A2:false,A3:false,A4:false},statut:'brouillon', lignes:[{articleId:'ART008',qte:40}]},
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
