// Contrôleur principal: navigation, modal, toast, import/export, thème
const App = {
  view: 'dashboard',
  views: {},  // injectées par chaque views/*.js : { render(root) }

  init() {
    DB.load();
    this.applyTheme(localStorage.getItem('theme') || 'light');
    this.bindTopbar();
    this.populateUserSelect();
    this.updateBell();
    this.bellInterval = setInterval(() => this.updateBell(), 30000);
    this.navigate(location.hash.replace('#','') || 'dashboard');
  },

  currentUser() {
    const id = localStorage.getItem('atelier_user_id');
    return (DB.state.utilisateurs || []).find(u => u.id === id) || (DB.state.utilisateurs || [])[0] || { id:'_', nom:'Anonyme', axes:[] };
  },
  setCurrentUser(id) {
    localStorage.setItem('atelier_user_id', id);
    this.toast('Signé comme ' + (this.currentUser().nom), 'success');
  },
  populateUserSelect() {
    const sel = document.getElementById('user-select');
    if (!sel) return;
    const users = DB.state.utilisateurs || [];
    const curId = this.currentUser().id;
    sel.innerHTML = users.map(u => `<option value="${u.id}" ${u.id===curId?'selected':''}>${u.nom} · ${u.axes.join('/')||'—'}</option>`).join('');
    sel.onchange = e => this.setCurrentUser(e.target.value);
  },
  canSignAxe(axeCode) {
    const u = this.currentUser();
    return (u.axes || []).includes(axeCode);
  },

  updateBell() {
    const alerts = this.proactiveAlerts();
    const count = alerts.length;
    const badge = document.getElementById('bell-count');
    if (!badge) return;
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
    badge.classList.toggle('bad', alerts.some(a => a.niveau === 'bad'));
  },
  showBellPanel() {
    const alerts = this.proactiveAlerts();
    const body = alerts.length
      ? `<ul class="list">${alerts.map(a => `<li><span class="badge ${a.niveau}">${a.kind}</span> <span>${a.msg}</span></li>`).join('')}</ul>`
      : `<p class="muted">Aucune alerte. ✔</p>`;
    this.openModal(`Alertes proactives (${alerts.length})`, body, `<span class="spacer" style="flex:1"></span><button class="btn" onclick="App.closeModal()">Fermer</button>`);
  },

  bindTopbar() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.navigate(btn.dataset.view));
    });
    document.getElementById('btn-theme').addEventListener('click', () => {
      const next = document.body.classList.contains('dark') ? 'light' : 'dark';
      this.applyTheme(next);
    });
    document.getElementById('btn-export').addEventListener('click', () => this.exportData());
    document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file').click());
    document.getElementById('import-file').addEventListener('change', e => this.importData(e.target.files[0]));
    document.getElementById('btn-reset').addEventListener('click', () => {
      if (confirm('Réinitialiser toutes les données avec le jeu de démonstration ?')) {
        DB.reset(); this.refresh(); this.toast('Données réinitialisées', 'success');
      }
    });
    document.getElementById('btn-print').addEventListener('click', () => window.print());
    document.getElementById('btn-help').addEventListener('click', () => this.showHelp());
    document.getElementById('btn-bell').addEventListener('click', () => this.showBellPanel());
    document.getElementById('btn-tablette').addEventListener('click', () => {
      document.body.classList.toggle('tablette');
      const on = document.body.classList.contains('tablette');
      localStorage.setItem('tablette', on ? '1' : '0');
      if (on) {
        this.tabletteRefresh = setInterval(() => this.refresh(), 60000);
        this.toast('Mode tablette · refresh auto 60s','info');
      } else {
        clearInterval(this.tabletteRefresh);
      }
    });
    if (localStorage.getItem('tablette') === '1') {
      document.body.classList.add('tablette');
      this.tabletteRefresh = setInterval(() => this.refresh(), 60000);
    }
    // Modal close
    document.querySelector('.modal-close').addEventListener('click', () => this.closeModal());
    document.querySelector('.modal-backdrop').addEventListener('click', () => this.closeModal());
    // Raccourcis clavier
    document.addEventListener('keydown', e => this.handleKey(e));
  },

  handleKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const map = { d:'dashboard', g:'gantt', c:'calendrier', p:'personnes', l:'lieux', m:'machines', j:'projets', s:'stock', v:'deplacements', o:'commandes', b:'bom', x:'capacite', w:'whatif' };
    if (map[e.key]) { this.navigate(map[e.key]); e.preventDefault(); return; }
    if (e.key === '?') { this.showHelp(); e.preventDefault(); return; }
    if (e.key === 'n' && this.views[this.view].newItem) { this.views[this.view].newItem(); e.preventDefault(); return; }
    if (e.key === '/') { const s = document.querySelector('input[type=search]'); if (s) { s.focus(); e.preventDefault(); } return; }
    if (e.key === 'Escape') this.closeModal();
  },

  showHelp() {
    const el = document.getElementById('help-overlay');
    if (el) { el.classList.toggle('hidden'); return; }
    const o = document.createElement('div');
    o.id = 'help-overlay';
    o.className = 'help-overlay';
    o.innerHTML = `<div class="help-card">
      <h2 style="margin-top:0">Raccourcis clavier</h2>
      <p><kbd>D</kbd> Dashboard · <kbd>G</kbd> Gantt · <kbd>C</kbd> Calendrier · <kbd>P</kbd> Personnes</p>
      <p><kbd>L</kbd> Lieux · <kbd>M</kbd> Machines · <kbd>J</kbd> Projets · <kbd>S</kbd> Stock</p>
      <p><kbd>V</kbd> Déplacements · <kbd>O</kbd> Commandes · <kbd>B</kbd> BOM · <kbd>X</kbd> Capacité · <kbd>W</kbd> What-if</p>
      <p><kbd>/</kbd> Recherche · <kbd>N</kbd> Nouveau · <kbd>?</kbd> Aide · <kbd>Esc</kbd> Fermer</p>
      <p style="text-align:right;margin:14px 0 0 0"><button class="btn" id="help-close">OK</button></p>
    </div>`;
    document.body.appendChild(o);
    o.querySelector('#help-close').onclick = () => o.classList.add('hidden');
    o.onclick = (ev) => { if (ev.target === o) o.classList.add('hidden'); };
  },

  applyTheme(theme) {
    document.body.classList.toggle('dark', theme === 'dark');
    document.getElementById('btn-theme').textContent = theme === 'dark' ? '☀' : '☾';
    localStorage.setItem('theme', theme);
  },

  navigate(name) {
    if (!this.views[name]) { console.warn('vue inconnue', name); name = 'dashboard'; }
    this.view = name;
    location.hash = name;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    this.refresh();
  },

  refresh() {
    const root = document.getElementById('view-root');
    root.innerHTML = '';
    this.views[this.view].render(root);
    this.updateBell();
  },

  // Modal helpers
  openModal(title, bodyHTML, footerHTML) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    document.getElementById('modal-foot').innerHTML = footerHTML || '';
    document.getElementById('modal-root').classList.remove('hidden');
  },
  closeModal() { document.getElementById('modal-root').classList.add('hidden'); },

  toast(msg, kind='info') {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  },

  exportData() {
    const blob = new Blob([DB.exportJSON()], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'atelier-plan-' + D.today() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    this.toast('Export JSON téléchargé', 'success');
  },
  importData(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        DB.importJSON(JSON.parse(r.result));
        this.refresh();
        this.toast('Import réussi', 'success');
      } catch (e) { this.toast('JSON invalide', 'error'); }
    };
    r.readAsText(file);
  },

  // Détection de conflits — utilisée par dashboard et badges
  detectConflicts() {
    const state = DB.state;
    const out = { personnes: [], machines: [], stock: [], commandes: [] };

    // 1) Personne assignée à plusieurs tâches qui se chevauchent
    const tByPerson = {};
    state.taches.forEach(t => (t.assignes || []).forEach(pid => {
      (tByPerson[pid] = tByPerson[pid] || []).push(t);
    }));
    Object.entries(tByPerson).forEach(([pid, ts]) => {
      ts.sort((a,b) => a.debut.localeCompare(b.debut));
      for (let i=0; i<ts.length-1; i++) {
        if (ts[i].fin >= ts[i+1].debut) {
          out.personnes.push({ personneId: pid, t1: ts[i].id, t2: ts[i+1].id });
        }
      }
    });

    // 2) Machine utilisée par plusieurs tâches en parallèle
    const tByMachine = {};
    state.taches.forEach(t => { if (t.machineId) (tByMachine[t.machineId] = tByMachine[t.machineId] || []).push(t); });
    Object.entries(tByMachine).forEach(([mid, ts]) => {
      ts.sort((a,b) => a.debut.localeCompare(b.debut));
      for (let i=0; i<ts.length-1; i++) {
        if (ts[i].fin >= ts[i+1].debut) {
          out.machines.push({ machineId: mid, t1: ts[i].id, t2: ts[i+1].id });
        }
      }
    });

    // 3) Stock sous seuil
    state.stock.forEach(s => {
      if (s.quantite < s.seuilAlerte) out.stock.push({ id: s.id, manque: s.seuilAlerte - s.quantite });
    });

    // 4) Commandes bloquées (pas 4A validés)
    state.commandes.forEach(c => {
      if (c.statut !== 'engagée') {
        const axes = state.regle4A.axes;
        const manquants = axes.filter(a => !c.validations[a.code]).map(a => a.code);
        if (manquants.length) out.commandes.push({ id: c.id, manquants });
      }
    });

    return out;
  },

  // Utilitaires d'affichage
  personneLabel(p) { return p ? (p.prenom + ' ' + p.nom) : '—'; },
  lieuLabel(l) { return l ? l.nom : '—'; },
  projetLabel(p) { return p ? p.code + ' — ' + p.nom : '—'; },

  // Suggestions d'affectation basées sur compétence requise + charge actuelle
  suggestAssignees(task, n = 3) {
    const s = DB.state;
    const needed = this.competenceForTask(task);
    const today = D.today();
    const end = task.fin || D.addWorkdays(today, 4);
    return s.personnes
      .map(p => {
        const compMatch = needed && (p.competences||[]).includes(needed) ? 2 : 0;
        const ts = s.taches.filter(t => (t.assignes||[]).includes(p.id) && t.fin >= task.debut && t.debut <= end);
        const charge = ts.reduce((n,t) => n + D.workdaysBetween(
          t.debut > task.debut ? t.debut : task.debut,
          t.fin < end ? t.fin : end), 0);
        const lieuMatch = task.lieuId && p.lieuPrincipalId === task.lieuId ? 1 : 0;
        const score = compMatch * 100 - charge * 5 + lieuMatch * 10;
        return { p, score, charge, compMatch: !!compMatch };
      })
      .sort((a,b) => b.score - a.score)
      .slice(0, n);
  },
  competenceForTask(t) {
    // Déduire de type + machine/lieu
    if (t.machineId) {
      const m = DB.machine(t.machineId);
      if (m) return m.type;
    }
    const map = { etude:'CAO', appro:'Logistique', livraison:'Logistique' };
    return map[t.type] || null;
  },

  // Prédiction de date de fin basée sur avancement vs. temps écoulé
  predictProjectEnd(projetId) {
    const p = DB.projet(projetId);
    if (!p) return null;
    const tasks = DB.state.taches.filter(t => t.projetId === projetId && !t.jalon);
    if (!tasks.length) return p.fin;
    const totalPlanned = tasks.reduce((n,t) => n + Math.max(1, D.workdaysBetween(t.debut,t.fin)), 0);
    const today = D.today();
    const inProgress = tasks.filter(t => t.debut <= today && t.fin >= today);
    const done = tasks.filter(t => t.avancement >= 100);
    const donePlanned = done.reduce((n,t) => n + Math.max(1, D.workdaysBetween(t.debut,t.fin)), 0);
    const ipProgress = inProgress.reduce((n,t) => n + Math.max(1, D.workdaysBetween(t.debut,t.fin)) * (t.avancement||0) / 100, 0);
    const advancedJ = donePlanned + ipProgress;
    // Temps écoulé vs. tâches attendues à ce jour
    const expectedJ = tasks.reduce((n,t) => {
      if (t.fin < today) return n + Math.max(1, D.workdaysBetween(t.debut,t.fin));
      if (t.debut > today) return n;
      return n + D.workdaysBetween(t.debut, today);
    }, 0);
    if (expectedJ === 0) return p.fin;
    const vitesse = advancedJ / expectedJ; // 1.0 = à l'heure, <1 = en retard
    const restantPlanned = totalPlanned - advancedJ;
    const restantReel = vitesse > 0 ? restantPlanned / vitesse : restantPlanned * 2;
    const predEnd = D.addWorkdays(today, Math.round(restantReel));
    const delayDays = D.diffDays(p.fin, predEnd);
    return { predEnd, delayDays, vitesse: Math.round(vitesse*100)/100 };
  },

  // Alertes proactives
  proactiveAlerts() {
    const s = DB.state;
    const today = D.today();
    const horizon = D.addWorkdays(today, 10);
    const alerts = [];

    // 1) Tâches de production démarrant bientôt avec stock requis insuffisant
    s.taches.forEach(t => {
      if (t.jalon) return;
      if (t.debut < today || t.debut > horizon) return;
      const prj = DB.projet(t.projetId);
      if (!prj || !prj.bom) return;
      prj.bom.forEach(l => {
        const art = DB.stock(l.articleId);
        if (art && art.quantite < l.quantite) {
          const j = D.workdaysBetween(today, t.debut);
          alerts.push({ kind:'stock-bom', niveau:'bad', msg:`J-${j} · ${t.nom} (${prj.code}) · stock ${art.ref} insuffisant (${art.quantite}/${l.quantite})` });
        }
      });
    });

    // 2) Machines avec conflit dans les 10 j ouvrés
    const confs = this.detectConflicts().machines;
    confs.forEach(c => {
      const t1 = DB.tache(c.t1);
      if (t1 && t1.debut >= today && t1.debut <= horizon) {
        const m = DB.machine(c.machineId);
        alerts.push({ kind:'machine-conflit', niveau:'warn', msg:`Conflit ${m?.nom} entre « ${DB.tache(c.t1)?.nom} » et « ${DB.tache(c.t2)?.nom} »` });
      }
    });

    // 3) Personnes saturées (>100% semaine prochaine)
    const weekStart = D.addWorkdays(today, 1);
    const weekEnd = D.addWorkdays(weekStart, 4);
    s.personnes.forEach(p => {
      const ts = s.taches.filter(t => (t.assignes||[]).includes(p.id) && t.fin >= weekStart && t.debut <= weekEnd);
      const h = ts.reduce((n,t) => n + D.workdaysBetween(t.debut > weekStart ? t.debut : weekStart, t.fin < weekEnd ? t.fin : weekEnd) * 7, 0);
      if (h > (p.capaciteHebdo||35)) {
        alerts.push({ kind:'person-surcharge', niveau:'warn', msg:`${this.personneLabel(p)} saturé·e semaine prochaine (${h}h/${p.capaciteHebdo}h)` });
      }
    });

    // 4) Projets avec retard prédit > 3 jours
    s.projets.filter(p => p.statut === 'en-cours').forEach(p => {
      const pr = this.predictProjectEnd(p.id);
      if (pr && pr.delayDays >= 3) {
        alerts.push({ kind:'project-delay', niveau:'bad', msg:`${p.code} : retard prédit +${pr.delayDays} j (fin → ${D.fmt(pr.predEnd)})` });
      }
    });

    return alerts;
  },
};

// Lance après que tous les scripts de vue sont chargés
document.addEventListener('DOMContentLoaded', () => App.init());
