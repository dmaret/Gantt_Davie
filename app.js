// Contrôleur principal: navigation, modal, toast, import/export, thème
const App = {
  view: 'dashboard',
  views: {},  // injectées par chaque views/*.js : { render(root) }

  init() {
    DB.load();
    this.applyTheme(localStorage.getItem('theme') || 'light');
    this.bindTopbar();
    this.navigate(location.hash.replace('#','') || 'dashboard');
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
    // Modal close
    document.querySelector('.modal-close').addEventListener('click', () => this.closeModal());
    document.querySelector('.modal-backdrop').addEventListener('click', () => this.closeModal());
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
};

// Lance après que tous les scripts de vue sont chargés
document.addEventListener('DOMContentLoaded', () => App.init());
