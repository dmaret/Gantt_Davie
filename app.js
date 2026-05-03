// Contrôleur principal: navigation, modal, toast, import/export, thème
const App = {
  view: 'dashboard',
  views: {},  // injectées par chaque views/*.js : { render(root) }
  _navHistory: [],
  _navFuture: [],

  async init() {
    this.applyTheme(localStorage.getItem('theme') || 'light');
    if (!this.isAuthed()) { this.showLogin(); return; }

    const vr = document.getElementById('view-root');
    if (vr) vr.innerHTML = `<div style="text-align:center;padding:80px 20px;color:var(--text-muted)"><div style="font-size:36px;margin-bottom:12px">◆</div><div>Chargement…</div></div>`;

    const ok = await DB.load();
    if (!ok) { this.showLogin(); return; }

    this.bindTopbar();
    this.initSearchBar();
    this.populateUserSelect();
    this.updateBell();
    this.bellInterval = setInterval(() => this.updateBell(), 30000);
    this.initNotifications();
    this.applyGroupUI();
    this.navigate(location.hash.replace('#','') || 'dashboard');
    if (!localStorage.getItem('atelier_tuto_seen')) {
      setTimeout(() => this.showTutorial(false), 400);
    }
  },

  // Hachage SHA-256 du mot de passe (Web Crypto API)
  async hash(s) {
    const data = new TextEncoder().encode(s);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  },

  // Échappe les caractères HTML pour prévenir XSS
  escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },
  // Valide qu'une couleur est un hex CSS sûr (#rgb ou #rrggbb), sinon retourne le fallback
  safeColor(c, fallback = '#888888') {
    return (typeof c === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(c)) ? c : fallback;
  },

  isAuthed() {
    const token = localStorage.getItem('atelier_token');
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return !!payload.id && payload.exp > Math.floor(Date.now() / 1000);
    } catch { return false; }
  },

  async login(userId, password) {
    const h = await this.hash(password || '');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, passwordHash: h }),
      });
      if (!res.ok) return false;
      const { token } = await res.json();
      DB._setToken(token);
      localStorage.setItem('atelier_user_id', userId);
      return true;
    } catch { return false; }
  },

  logout() {
    this.clearAllIntervals();
    DB._clearToken();
    localStorage.removeItem('atelier_user_id');
    this.showLogin();
  },

  clearAllIntervals() {
    if (this.bellInterval) { clearInterval(this.bellInterval); this.bellInterval = null; }
    if (this.tabletteRefresh) { clearInterval(this.tabletteRefresh); this.tabletteRefresh = null; }
  },

  async setPassword(userId, newPassword) {
    const u = (DB.state.utilisateurs || []).find(x => x.id === userId);
    if (!u) return;
    if (!newPassword) {
      delete u.passwordHash;
    } else {
      u.passwordHash = await this.hash(newPassword);
    }
    DB.save();
  },

  async showLogin() {
    const existing = document.getElementById('login-overlay');
    if (existing) existing.remove();

    // Affiche un loader pendant le fetch des utilisateurs
    const o = document.createElement('div');
    o.id = 'login-overlay';
    o.className = 'login-overlay';
    o.innerHTML = `<div class="login-card"><div class="login-logo">◆</div><p class="muted">Chargement…</p></div>`;
    document.body.appendChild(o);

    let users = [];
    try {
      const res = await fetch('/api/auth/users');
      if (res.ok) users = await res.json();
    } catch { /* serveur non disponible */ }

    const curId = localStorage.getItem('atelier_user_id') || users[0]?.id || '';
    o.innerHTML = `<div class="login-card">
      <div class="login-logo">◆</div>
      <h2>Atelier · Planification</h2>
      <p class="muted">Connecte-toi pour continuer</p>
      <label class="small" style="display:block;text-align:left;margin-top:14px">Utilisateur</label>
      <select id="login-user" class="login-input">
        ${users.map(u => `<option value="${u.id}" ${u.id===curId?'selected':''}>${this.escapeHTML(u.nom)} · ${this.escapeHTML(u.groupe)}${u.hasPassword?' 🔒':''}</option>`).join('')}
      </select>
      <label class="small" style="display:block;text-align:left;margin-top:10px">Mot de passe <span id="login-pw-hint" class="muted">(aucun — laisser vide)</span></label>
      <input type="password" id="login-pw" class="login-input" placeholder="••••••••" autofocus>
      <div id="login-error" class="login-error" style="display:none"></div>
      <button class="btn" id="login-btn" style="margin-top:14px;width:100%;padding:10px">Se connecter</button>
      ${this._pendingSwitch ? '<button class="btn btn-secondary" id="login-cancel" style="margin-top:6px;width:100%">Annuler (rester connecté·e comme avant)</button>' : ''}
      <p class="muted small" style="margin-top:14px">Les utilisateurs sans 🔒 n'ont pas de mot de passe. Un admin peut en définir un dans la vue Admin (⚙).</p>
    </div>`;

    const userSel = document.getElementById('login-user');
    const pwInput = document.getElementById('login-pw');
    const hint    = document.getElementById('login-pw-hint');
    const errEl   = document.getElementById('login-error');
    const btn     = document.getElementById('login-btn');

    const refreshHint = () => {
      const u = users.find(x => x.id === userSel.value);
      if (u?.hasPassword) { hint.textContent = '(obligatoire)'; hint.classList.remove('muted'); }
      else { hint.textContent = '(aucun — laisser vide)'; hint.classList.add('muted'); }
    };
    userSel.onchange = refreshHint;
    refreshHint();

    const doLogin = async () => {
      errEl.style.display = 'none';
      btn.disabled = true; btn.textContent = 'Connexion…';
      const ok = await this.login(userSel.value, pwInput.value);
      btn.disabled = false; btn.textContent = 'Se connecter';
      if (ok) {
        this._pendingSwitch = null;
        document.getElementById('login-overlay').remove();
        // Charge les données puis lance l'appli
        const vr = document.getElementById('view-root');
        if (vr) vr.innerHTML = `<div style="text-align:center;padding:80px;color:var(--text-muted)"><div style="font-size:36px;margin-bottom:12px">◆</div><div>Chargement…</div></div>`;
        await DB.load();
        this.bindTopbar();
        this.initSearchBar();
        this.populateUserSelect();
        this.applyGroupUI();
        this.navigate(location.hash.replace('#','') || 'dashboard');
        this.toast('Connecté comme ' + this.currentUser().nom, 'success');
        if (!localStorage.getItem('atelier_tuto_seen')) {
          setTimeout(() => this.showTutorial(false), 400);
        }
      } else {
        errEl.style.display = 'block';
        errEl.textContent = '✗ Mot de passe incorrect ou utilisateur inconnu';
        pwInput.value = '';
        pwInput.focus();
      }
    };
    btn.onclick = doLogin;
    pwInput.onkeydown = e => { if (e.key === 'Enter') doLogin(); };
    const cancelBtn = document.getElementById('login-cancel');
    if (cancelBtn) cancelBtn.onclick = () => {
      const prev = this._pendingSwitch;
      if (prev?.prevToken) DB._setToken(prev.prevToken);
      if (prev?.prevId) localStorage.setItem('atelier_user_id', prev.prevId);
      else              localStorage.removeItem('atelier_user_id');
      this._pendingSwitch = null;
      document.getElementById('login-overlay').remove();
      this.populateUserSelect();
      this.applyGroupUI();
    };
    setTimeout(() => pwInput.focus(), 50);
  },

  // Change le mot de passe de l'utilisateur courant (auto-service)
  showMyPasswordDialog() {
    const u = this.currentUser();
    const hasPw = !!u.passwordHash;
    const body = `
      <p class="muted small">Utilisateur : <strong>${this.escapeHTML(u.nom)}</strong> · groupe ${this.escapeHTML(u.groupe||'—')}</p>
      ${hasPw ? '<div class="field"><label>Mot de passe actuel</label><input type="password" id="mp-current"></div>' : '<p class="muted small">Tu n\'as pas encore de mot de passe.</p>'}
      <div class="field"><label>Nouveau mot de passe (laisser vide pour retirer)</label><input type="password" id="mp-new"></div>
      <div class="field"><label>Confirmer</label><input type="password" id="mp-confirm"></div>
    `;
    const foot = `<button class="btn btn-secondary" onclick="App.closeModal()">Annuler</button><span class="spacer" style="flex:1"></span><button class="btn" id="mp-save">Enregistrer</button>`;
    this.openModal('Mon mot de passe', body, foot);
    document.getElementById('mp-save').onclick = async () => {
      const cur = hasPw ? document.getElementById('mp-current').value : '';
      const n1 = document.getElementById('mp-new').value;
      const n2 = document.getElementById('mp-confirm').value;
      if (hasPw) {
        const h = await this.hash(cur);
        if (h !== u.passwordHash) { this.toast('Mot de passe actuel incorrect','error'); return; }
      }
      if (n1 !== n2) { this.toast('Les deux champs ne correspondent pas','error'); return; }
      await this.setPassword(u.id, n1);
      this.populateUserSelect();
      this.closeModal();
      this.toast(n1 ? 'Mot de passe mis à jour' : 'Mot de passe retiré', 'success');
    };
  },

  currentUser() {
    const id = localStorage.getItem('atelier_user_id');
    return (DB.state.utilisateurs || []).find(u => u.id === id) || (DB.state.utilisateurs || [])[0] || { id:'_', nom:'Anonyme', axes:[] };
  },
  // Changement d'utilisateur : passe par l'écran de login pour re-authentifier
  setCurrentUser(id) {
    const prevToken = DB._token();
    const prevId    = localStorage.getItem('atelier_user_id');
    this._pendingSwitch = prevToken ? { prevToken, prevId } : null;
    DB._clearToken();
    localStorage.setItem('atelier_user_id', id);
    this.showLogin();
  },
  populateUserSelect() {
    const sel = document.getElementById('user-select');
    if (!sel) return;
    const users = DB.state.utilisateurs || [];
    const curId = this.currentUser().id;
    sel.innerHTML = users.map(u => { const axes = u.axes || []; const eid = this.escapeHTML(u.id); const enom = this.escapeHTML(u.nom); const egrp = this.escapeHTML(u.groupe||'—'); return `<option value="${eid}" ${u.id===curId?'selected':''}>${enom} · ${egrp}${axes.length?' ('+axes.join('/')+')':''}</option>`; }).join('');
    sel.onchange = e => this.setCurrentUser(e.target.value);
    this.refreshUserBadge();
  },
  refreshUserBadge() {
    const b = document.getElementById('user-badge');
    if (!b) return;
    const g = this.currentUser().groupe || '—';
    const map = { utilisateur:'var(--text-muted)', MSP:'var(--primary)', admin:'var(--danger)' };
    b.textContent = g;
    b.style.background = map[g] || 'var(--text-muted)';
  },
  canSignAxe(axeCode) {
    const u = this.currentUser();
    if (!this.can('sign')) return false;
    // admin : tous les axes ; MSP : axes listés dans u.axes
    if (u.groupe === 'admin') return true;
    return (u.axes || []).includes(axeCode);
  },
  // Vérifie une permission logique contre le groupe de l'utilisateur courant
  can(action) {
    const u = this.currentUser();
    const g = (DB.state.groupes || {})[u.groupe] || { perms:{} };
    return !!g.perms[action];
  },
  // Enforce permission check at function entry point (not just UI hiding)
  requirePerm(action) {
    if (!this.can(action)) {
      this.toast('Accès refusé. Vous n\'avez pas la permission : ' + action, 'error');
      return false;
    }
    return true;
  },
  canView(viewName) {
    if (!viewName) return true;
    const u = this.currentUser();
    const g = (DB.state.groupes || {})[u.groupe] || {};
    if (g.perms?.admin) return true;
    const ma = g.moduleAccess;
    if (!ma) return true;
    return ma[viewName] !== false;
  },
  // Applique les permissions aux éléments marqués data-perm dans le DOM
  applyPerms() {
    document.querySelectorAll('[data-perm]').forEach(el => {
      const ok = this.can(el.dataset.perm);
      el.style.display = ok ? '' : 'none';
    });
    document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
      btn.style.display = this.canView(btn.dataset.view) ? '' : 'none';
    });
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

  updateNavBadges() {
    const alerts = this.proactiveAlerts();
    const counts = {};
    alerts.forEach(a => {
      if (a.target && a.target.view) {
        const prev = counts[a.target.view] || { total: 0, bad: false };
        counts[a.target.view] = { total: prev.total + 1, bad: prev.bad || a.niveau === 'bad' };
      }
    });
    document.querySelectorAll('.nav-btn').forEach(btn => {
      const view = btn.dataset.view;
      const info = counts[view] || null;
      let badge = btn.querySelector('.nav-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        btn.appendChild(badge);
      }
      if (info) {
        badge.textContent = info.total;
        badge.style.display = '';
        badge.classList.toggle('bad', info.bad);
      } else {
        badge.style.display = 'none';
      }
    });
  },

  showCommandPalette() {
    if (document.getElementById('cmd-palette')) return;
    const VIEWS = [
      { view:'dashboard', label:'Tableau de bord', key:'D' },
      { view:'gantt', label:'Gantt', key:'G' },
      { view:'kanban', label:'Kanban', key:'' },
      { view:'calendrier', label:'Calendrier', key:'C' },
      { view:'personnes', label:'Personnes', key:'P' },
      { view:'lieux', label:'Lieux', key:'L' },
      { view:'machines', label:'Machines', key:'M' },
      { view:'projets', label:'Projets', key:'J' },
      { view:'stock', label:'Stock', key:'S' },
      { view:'bom', label:'BOM', key:'B' },
      { view:'deplacements', label:'Déplacements', key:'V' },
      { view:'commandes', label:'Commandes', key:'O' },
      { view:'capacite', label:'Capacité', key:'X' },
      { view:'ressources', label:'Ressources', key:'R' },
      { view:'equipes', label:'Équipes', key:'E' },
      { view:'plan', label:'Plan', key:'A' },
      { view:'absences', label:'Absences', key:'F' },
      { view:'modeles', label:'Modèles de tâche', key:'T' },
      { view:'modelesprojets', label:'Modèles de projet', key:'' },
      { view:'audit', label:'Historique', key:'H' },
      { view:'whatif', label:'What-if', key:'W' },
      { view:'majourney',      label:'Ma journée',              key:'' },
      { view:'timeline',       label:'Timeline',                key:'' },
      { view:'flux',           label:'Flux atelier',            key:'' },
      { view:'aide',           label:'🎓 Guide & Flux de travail', key:'I' },
    ];
    const ACTIONS = [
      { label:'+ Nouvelle tâche Gantt', meta:'action', action: () => { this.navigate('gantt'); setTimeout(() => this.views.gantt?.newItem?.(), 80); } },
      { label:'+ Nouveau projet', meta:'action', action: () => { this.navigate('projets'); setTimeout(() => this.views.projets?.newItem?.(), 80); } },
      { label:'+ Nouvelle personne', meta:'action', action: () => { this.navigate('personnes'); setTimeout(() => this.views.personnes?.newItem?.(), 80); } },
      { label:'Exporter JSON', meta:'action', action: () => this.exportData() },
      { label:'Exporter CSV — Tâches', meta:'action', action: () => this.exportCSV('taches') },
      { label:'Exporter CSV — Stock', meta:'action', action: () => this.exportCSV('stock') },
      { label:'Exporter CSV — Commandes', meta:'action', action: () => this.exportCSV('commandes') },
      { label:'Exporter CSV — Personnes', meta:'action', action: () => this.exportCSV('personnes') },
      { label:'Alertes proactives', meta:'action', action: () => this.showBellPanel() },
      { label:'Aide · raccourcis clavier', meta:'action', action: () => this.showHelp() },
    ];
    const el = document.createElement('div');
    el.id = 'cmd-palette';
    el.className = 'gs-overlay';
    el.innerHTML = `<div class="gs-panel">
      <input type="text" id="cp-input" placeholder="Naviguer vers… ou action (↑↓ · Entrée · Esc)" autofocus>
      <div id="cp-results" class="gs-results"></div>
      <div class="gs-hint muted small">Ctrl+P · ↑↓ naviguer · Entrée ouvrir · Esc fermer</div>
    </div>`;
    document.body.appendChild(el);
    el.onclick = ev => { if (ev.target === el) this.closeCommandPalette(); };
    this._cpSelected = 0;
    this._cpItems = [];
    const input = document.getElementById('cp-input');
    const renderCp = () => {
      const q = input.value.toLowerCase();
      const viewItems = VIEWS
        .filter(v => !q || v.label.toLowerCase().includes(q) || v.view.toLowerCase().includes(q))
        .map(v => ({ label: v.label, meta: v.key ? `Touche ${v.key}` : 'vue', action: () => this.navigate(v.view) }));
      const actionItems = ACTIONS.filter(a => !q || a.label.toLowerCase().includes(q));
      this._cpItems = [...viewItems, ...actionItems];
      this._cpSelected = Math.min(this._cpSelected, Math.max(0, this._cpItems.length - 1));
      document.getElementById('cp-results').innerHTML = this._cpItems.length
        ? this._cpItems.map((it, i) => `<div class="gs-item ${i === this._cpSelected ? 'on' : ''}" data-i="${i}"><span class="gs-label">${it.label}</span><span class="gs-meta muted small">${it.meta || ''}</span></div>`).join('')
        : `<div class="muted small" style="padding:10px">Aucun résultat.</div>`;
      document.querySelectorAll('#cp-results .gs-item').forEach(item => {
        item.onclick = () => { this._cpSelected = +item.dataset.i; this._execCpItem(); };
      });
    };
    this._execCpItem = () => {
      const it = this._cpItems[this._cpSelected];
      if (it) { this.closeCommandPalette(); it.action(); }
    };
    input.oninput = renderCp;
    input.onkeydown = e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this._cpSelected = Math.min(this._cpItems.length - 1, this._cpSelected + 1); renderCp(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this._cpSelected = Math.max(0, this._cpSelected - 1); renderCp(); }
      else if (e.key === 'Enter') { e.preventDefault(); this._execCpItem(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.closeCommandPalette(); }
    };
    renderCp();
    setTimeout(() => input.focus(), 10);
  },
  closeCommandPalette() {
    const el = document.getElementById('cmd-palette');
    if (el) el.remove();
  },
  showBellPanel() {
    const alerts = this.proactiveAlerts();
    this._lastAlerts = alerts;
    const body = alerts.length
      ? `<ul class="list list-clickable">${alerts.map((a,i) => `
          <li class="alert-row" data-idx="${i}" ${a.target?'role="button" tabindex="0"':''}>
            <span class="badge ${a.niveau}">${this.escapeHTML(a.kind)}</span>
            <span class="alert-msg">${this.escapeHTML(a.msg)}</span>
            ${a.target ? '<span class="alert-arrow" title="Ouvrir la vue concernée">›</span>' : ''}
          </li>`).join('')}</ul>
          <p class="muted small" style="margin-top:8px">Clic sur une ligne pour ouvrir l'élément concerné.</p>`
      : `<p class="muted">Aucune alerte. ✔</p>`;
    const notifSupported = 'Notification' in window;
    const notifGranted = notifSupported && Notification.permission === 'granted';
    const notifBtn = notifSupported
      ? `<button class="btn-ghost" onclick="App.requestNotificationPermission()" title="${notifGranted ? 'Notifications activées' : 'Activer les notifications navigateur'}">${notifGranted ? '🔔 Notif. ON' : '🔕 Activer notifs'}</button>`
      : '';
    this.openModal(`Alertes proactives (${alerts.length})`, body, `${notifBtn}<span class="spacer" style="flex:1"></span><button class="btn" onclick="App.closeModal()">Fermer</button>`);
    document.querySelectorAll('.alert-row').forEach(li => {
      li.onclick = () => {
        const a = this._lastAlerts[+li.dataset.idx];
        if (!a || !a.target) return;
        this.closeModal();
        this.navigateToTarget(a.target);
      };
    });
  },

  // Navigue vers l'entité décrite par `target` puis ouvre son formulaire si possible.
  // target: { view, projetId?, personneId?, tacheId?, articleId?, machineId?, lieuId?, commandeId? }
  navigateToTarget(target) {
    if (!target || !target.view) return;
    // Ouvrir une tâche en modal sans quitter la vue courante
    if (target.view === 'gantt' && target.tacheId && this.views.gantt?.openTacheForm) {
      const prefill = target.machineId
        ? { machineConflict: { machineId: target.machineId, conflictTacheId: target.conflictTacheId } }
        : {};
      this.views.gantt.openTacheForm(target.tacheId, prefill);
      return;
    }
    this.navigate(target.view);
    // Laisser le temps à la vue de se rendre avant d'ouvrir le form
    setTimeout(() => {
      try {
        if (target.view === 'projets' && target.projetId && this.views.projets?.openForm) {
          this.views.projets.openForm(target.projetId);
          this._flashRow(target.projetId);
        } else if (target.view === 'personnes' && target.personneId && this.views.personnes?.openForm) {
          this.views.personnes.openForm(target.personneId);
          this._flashRow(target.personneId);
        } else if (target.view === 'stock' && target.articleId && this.views.stock?.openForm) {
          this.views.stock.openForm(target.articleId);
          this._flashRow(target.articleId);
        } else if (target.view === 'machines' && target.machineId && this.views.machines?.openForm) {
          this.views.machines.openForm(target.machineId);
          this._flashRow(target.machineId);
        } else if (target.view === 'commandes' && target.commandeId && this.views.commandes?.openForm) {
          this.views.commandes.openForm(target.commandeId);
          this._flashRow(target.commandeId);
        } else if (target.view === 'lieux' && target.lieuId && this.views.lieux?.openForm) {
          this.views.lieux.openForm(target.lieuId);
          this._flashRow(target.lieuId);
        } else if (target.view === 'bom' && target.projetId) {
          // BOM view: just navigate and let it render
          const bomV = this.views.bom;
          if (bomV?.state) bomV.state.projet = target.projetId;
          bomV?.render && bomV.render(document.getElementById('view-root'));
        }
        // For views navigated without a specific entity (just filtering), flash nothing
      } catch (err) {
        console.warn('navigateToTarget:', err);
      }
    }, 60);
  },

  _flashRow(id) {
    if (!id) return;
    setTimeout(() => {
      const el = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('row-flash');
      void el.offsetWidth; // reflow to restart animation
      el.classList.add('row-flash');
    }, 120);
  },

  bindTopbar() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.navigate(btn.dataset.view));
    });
    document.getElementById('btn-back').addEventListener('click', () => this.navigateBack());
    document.getElementById('btn-fwd').addEventListener('click', () => this.navigateForward());
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
    document.getElementById('btn-admin').addEventListener('click', () => this.views.admin && this.navigate('admin'));
    document.getElementById('btn-password').addEventListener('click', () => this.showMyPasswordDialog());
    document.getElementById('btn-logout').addEventListener('click', () => this.logout());
    document.getElementById('btn-tuto').addEventListener('click', () => this.showTutorial(true));
    document.getElementById('btn-tablette').addEventListener('click', () => {
      document.body.classList.toggle('tablette');
      const on = document.body.classList.contains('tablette');
      localStorage.setItem('tablette', on ? '1' : '0');
      if (on) {
        this.tabletteRefresh = setInterval(() => this.refresh(), 60000);
        this.toast('Mode tablette · refresh auto 60s','info');
      } else {
        if (this.tabletteRefresh) { clearInterval(this.tabletteRefresh); this.tabletteRefresh = null; }
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
    // Retour (Alt+←)
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'ArrowLeft') {
      e.preventDefault(); this.navigateBack(); return;
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'ArrowRight') {
      e.preventDefault(); this.navigateForward(); return;
    }
    // Recherche globale (Ctrl+K / Cmd+K) — fonctionne même depuis un input
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault(); this.showGlobalSearch(); return;
    }
    // Palette de commandes (Ctrl+P / Cmd+P)
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault(); this.showCommandPalette(); return;
    }
    // Undo / Redo (Ctrl+Z / Ctrl+Shift+Z)
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      if (e.shiftKey) this.redo(); else this.undo();
      return;
    }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const map = { d:'dashboard', g:'gantt', c:'calendrier', p:'personnes', l:'lieux', m:'machines', j:'projets', s:'stock', v:'deplacements', o:'commandes', b:'bom', x:'capacite', w:'whatif', r:'ressources', e:'equipes', a:'plan', f:'absences', h:'audit', t:'modeles', i:'aide', u:'flux' };
    if (map[e.key]) { this.navigate(map[e.key]); e.preventDefault(); return; }
    if (e.key === '?') { this.showHelp(); e.preventDefault(); return; }
    if (e.key === 'n' && this.views[this.view].newItem) { this.views[this.view].newItem(); e.preventDefault(); return; }
    if (e.key === '/') { const sb = document.getElementById('searchbar-input'); if (sb) { sb.focus(); sb.select(); e.preventDefault(); } return; }
    if (e.key === 'Escape') { this.closeGlobalSearch(); this.closeModal(); }
  },

  undo() {
    if (DB.undo()) { this.toast('Annulé','info'); this.refresh(); }
    else this.toast('Rien à annuler','muted');
  },
  redo() {
    if (DB.redo()) { this.toast('Refait','info'); this.refresh(); }
    else this.toast('Rien à refaire','muted');
  },

  // Recherche globale — personnes, projets, articles, commandes, tâches, machines, lieux
  showGlobalSearch() {
    if (document.getElementById('global-search')) return;
    const el = document.createElement('div');
    el.id = 'global-search';
    el.className = 'gs-overlay';
    el.innerHTML = `<div class="gs-panel">
      <input type="text" id="gs-input" placeholder="Rechercher une personne, un projet, un article, une commande, une tâche…" autofocus>
      <div id="gs-results" class="gs-results"></div>
      <div class="gs-hint muted small">↑↓ naviguer · Entrée ouvrir · Esc fermer</div>
    </div>`;
    document.body.appendChild(el);
    el.onclick = ev => { if (ev.target === el) this.closeGlobalSearch(); };
    const input = document.getElementById('gs-input');
    input.oninput = () => this.renderGlobalSearch(input.value);
    input.onkeydown = e => this.handleGlobalSearchKey(e);
    this.gsSelected = 0;
    this.renderGlobalSearch('');
    setTimeout(() => input.focus(), 10);
  },
  closeGlobalSearch() {
    const el = document.getElementById('global-search');
    if (el) el.remove();
  },
  renderGlobalSearch(q) {
    const results = this.searchAll(q, 20);
    this.gsResults = results;
    this.gsSelected = Math.min(this.gsSelected, Math.max(0, results.length - 1));
    const html = results.length
      ? results.map((r, i) => `<div class="gs-item ${i===this.gsSelected?'on':''}" data-i="${i}">
          <span class="gs-kind">${r.kind}</span>
          <span class="gs-label">${r.label}</span>
          <span class="gs-meta muted small">${r.meta||''}</span>
        </div>`).join('')
      : q ? `<div class="muted small" style="padding:10px">Aucun résultat.</div>` : `<div class="muted small" style="padding:10px">Taper pour rechercher…</div>`;
    document.getElementById('gs-results').innerHTML = html;
    document.querySelectorAll('.gs-item').forEach(el => {
      el.onclick = () => { this.gsSelected = +el.dataset.i; this.openGlobalSearchResult(); };
    });
  },
  handleGlobalSearchKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); this.gsSelected = Math.min((this.gsResults||[]).length - 1, this.gsSelected + 1); this.renderGlobalSearch(document.getElementById('gs-input').value); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.gsSelected = Math.max(0, this.gsSelected - 1); this.renderGlobalSearch(document.getElementById('gs-input').value); }
    else if (e.key === 'Enter') { e.preventDefault(); this.openGlobalSearchResult(); }
    else if (e.key === 'Escape') { e.preventDefault(); this.closeGlobalSearch(); }
  },
  openGlobalSearchResult() {
    const r = (this.gsResults||[])[this.gsSelected];
    if (!r) return;
    this.closeGlobalSearch();
    if (r.target) { this.navigateToTarget(r.target); return; }
    this.navigate(r.view);
    if (r.onOpen) setTimeout(r.onOpen, 50);
  },
  searchAll(q, limit) {
    const s = DB.state;
    const ql = q.toLowerCase().trim();
    const out = [];
    const push = (r) => { if (!ql || r.label.toLowerCase().includes(ql) || (r.meta||'').toLowerCase().includes(ql)) out.push(r); };
    s.personnes.forEach(p => push({ kind:'Personne', label:this.personneLabel(p), meta:`${p.role} · ${DB.lieu(p.lieuPrincipalId)?.nom||''} · ${(p.competences||[]).join(', ')}`, view:'personnes', target:{ view:'personnes', personneId:p.id } }));
    s.projets.forEach(p => push({ kind:'Projet',   label:`${p.code} — ${p.nom}`, meta:`${p.client||''} · ${p.statut}`, view:'projets', target:{ view:'projets', projetId:p.id } }));
    s.stock.forEach(a => push({ kind:'Article',   label:`${a.ref} — ${a.nom}`, meta:`${a.quantite} ${a.unite} · ${DB.lieu(a.lieuId)?.nom||''}`, view:'stock', target:{ view:'stock', articleId:a.id } }));
    s.commandes.forEach(c => push({ kind:'Commande', label:c.ref, meta:`${c.fournisseur} · ${c.statut}`, view:'commandes', target:{ view:'commandes', commandeId:c.id } }));
    s.taches.forEach(t => {
      const prj = DB.projet(t.projetId);
      push({ kind:'Tâche', label:t.nom, meta:`${prj?prj.code:''} · ${D.fmt(t.debut)}→${D.fmt(t.fin)}`, view:'gantt', target:{ view:'gantt', tacheId:t.id } });
    });
    s.machines.forEach(m => push({ kind:'Machine', label:m.nom, meta:`${m.type} · ${DB.lieu(m.lieuId)?.nom||''}`, view:'machines', target:{ view:'machines', machineId:m.id } }));
    s.lieux.forEach(l => push({ kind:'Lieu', label:l.nom, meta:`${l.type} · ${l.etage}`, view:'lieux', target:{ view:'lieux', lieuId:l.id } }));
    return out.slice(0, limit);
  },

  showTutorial(forceReplay) {
    const steps = [
      { icon:'👋', title:'Bienvenue sur Atelier · Planification',
        body:'Application web pour gérer personnes, projets, machines, lieux, stock, commandes et plannings.<br><br>Les données sont sauvegardées automatiquement sur le serveur. Accessible depuis n\'importe quel poste connecté.' },
      { icon:'🧭', title:'Navigation',
        body:'Utilise les onglets en haut ou les <strong>raccourcis clavier</strong> : <kbd>G</kbd> Gantt, <kbd>P</kbd> Personnes, <kbd>J</kbd> Projets, <kbd>O</kbd> Commandes, etc.<br><br><kbd>?</kbd> affiche la liste complète, <kbd>N</kbd> crée un élément, <kbd>/</kbd> focus la recherche, <kbd>Ctrl+K</kbd> recherche globale.' },
      { icon:'👥', title:'Utilisateurs & groupes',
        body:'Chaque utilisateur appartient à un groupe :<br><strong>utilisateur</strong> : consultation seule<br><strong>MSP</strong> : édition + signature des axes qui lui sont attribués<br><strong>admin</strong> : tous droits<br><br>Sélectionne ton profil dans la topbar. L\'admin (⚙) peut créer et paramétrer les utilisateurs.' },
      { icon:'📅', title:'Gantt & planification',
        body:'Vue <strong>Gantt</strong> : glisse-dépose les barres pour replanifier. Active les <strong>dépendances</strong> et le <strong>chemin critique</strong>. La <strong>cascade auto</strong> décale les tâches dépendantes automatiquement.<br><br>Le jour courant est en bleu, les weekends hachurés.' },
      { icon:'📦', title:'Stock & BOM',
        body:'<strong>Stock</strong> : gestion des articles avec seuils d\'alerte.<br><strong>BOM</strong> (nomenclature) : besoins par projet vs. stock disponible. Les ruptures sont détectées automatiquement.' },
      { icon:'✅', title:'Commandes — règle 4A',
        body:'Une commande doit être validée par les <strong>4 axes obligatoires</strong> (A1 chef de projet, A2 logistique, A3 technique, A4 budget) avant d\'être engagée. Chaque signature est journalisée avec le nom du signataire.' },
      { icon:'🔔', title:'Alertes proactives',
        body:'La cloche dans la topbar liste : stocks insuffisants vs BOM, conflits de machines, personnes saturées, projets en retard prédit. Rafraîchie toutes les 30 s.' },
      { icon:'🎯', title:'Tu es prêt !',
        body:'Commence par explorer le <strong>tableau de bord</strong>. Les données actuelles sont un jeu de démo — clic sur <strong>Reset</strong> pour recommencer, ou <strong>Importer</strong> tes propres données JSON.<br><br>Ce tuto est accessible à tout moment via 🎓 dans la topbar.' },
    ];
    localStorage.setItem('atelier_tuto_seen', '1');
    let i = 0;
    const show = () => {
      const s = steps[i];
      const nav = `<div style="display:flex;gap:6px;margin-top:12px">
        ${steps.map((_,k) => `<span class="tuto-dot ${k===i?'on':''}" data-k="${k}"></span>`).join('')}
      </div>`;
      const body = `<div class="tuto-step"><div class="tuto-icon">${s.icon}</div><h3>${s.title}</h3><p>${s.body}</p>${nav}</div>`;
      const foot = `
        <button class="btn btn-secondary" id="tuto-skip">Passer</button>
        <span class="spacer" style="flex:1"></span>
        ${i>0?'<button class="btn btn-secondary" id="tuto-prev">← Précédent</button>':''}
        ${i<steps.length-1?'<button class="btn" id="tuto-next">Suivant →</button>':'<button class="btn" id="tuto-done">Terminer 🎉</button>'}
      `;
      this.openModal(`Mode d'emploi (${i+1}/${steps.length})`, body, foot);
      document.getElementById('tuto-skip').onclick = () => this.closeModal();
      const prev = document.getElementById('tuto-prev');
      const next = document.getElementById('tuto-next');
      const done = document.getElementById('tuto-done');
      if (prev) prev.onclick = () => { i--; show(); };
      if (next) next.onclick = () => { i++; show(); };
      if (done) done.onclick = () => this.closeModal();
      document.querySelectorAll('.tuto-dot').forEach(d => d.onclick = () => { i = +d.dataset.k; show(); });
    };
    show();
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
      <p><kbd>R</kbd> Ressources · <kbd>E</kbd> Équipes · <kbd>A</kbd> Plan atelier</p>
      <p><kbd>Ctrl</kbd>+<kbd>K</kbd> Recherche globale · <kbd>Ctrl</kbd>+<kbd>P</kbd> Palette de commandes · <kbd>I</kbd> Guide · <kbd>/</kbd> Recherche vue · <kbd>N</kbd> Nouveau · <kbd>?</kbd> Aide</p>
      <p><kbd>Ctrl</kbd>+<kbd>Z</kbd> Annuler · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> Refaire · <kbd>Alt</kbd>+<kbd>←</kbd> Vue précédente · <kbd>Esc</kbd> Fermer</p>
      <p class="muted small">Clic-droit sur une barre Gantt pour un menu d'actions rapides.</p>
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

  navigate(name, { addToHistory = true } = {}) {
    if (!this.views[name]) { console.warn('vue inconnue', name); name = 'dashboard'; }
    if (!this.canView(name) && name !== 'dashboard') { name = 'dashboard'; }
    if (addToHistory && this.view && this.view !== name) {
      this._navHistory.push(this.view);
      if (this._navHistory.length > 30) this._navHistory.shift();
      this._navFuture = []; // navigation normale efface le futur
    }
    if (this.view === 'gantt' && name !== 'gantt') {
      if (this.views.gantt.clearSelection) this.views.gantt.clearSelection();
      const mm = document.getElementById('gantt-minimap');
      if (mm) mm.remove();
    }
    this.view = name;
    location.hash = name;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    this.updateBackBtn();
    this.refresh();
  },

  navigateBack() {
    if (!this._navHistory.length) return;
    this._navFuture.push(this.view);
    const prev = this._navHistory.pop();
    if (this.view === 'gantt' && prev !== 'gantt') {
      const mm = document.getElementById('gantt-minimap');
      if (mm) mm.remove();
    }
    this.view = prev;
    location.hash = prev;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === prev));
    this._updateNavBtns();
    this.refresh();
  },

  navigateForward() {
    if (!this._navFuture.length) return;
    this._navHistory.push(this.view);
    const next = this._navFuture.pop();
    if (this.view === 'gantt' && next !== 'gantt') {
      const mm = document.getElementById('gantt-minimap');
      if (mm) mm.remove();
    }
    this.view = next;
    location.hash = next;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === next));
    this._updateNavBtns();
    this.refresh();
  },

  updateBackBtn() { this._updateNavBtns(); },
  _updateNavBtns() {
    const back = document.getElementById('btn-back');
    const fwd  = document.getElementById('btn-fwd');
    if (back) back.hidden = this._navHistory.length === 0;
    if (fwd)  fwd.hidden  = this._navFuture.length === 0;
  },

  refresh() {
    const root = document.getElementById('view-root');
    root.innerHTML = '';
    this.views[this.view].render(root);
    this.updateBell();
    this.updateNavBadges();
    this.applyPerms();
    this.applyGroupUI();
  },
  // Marque <body> avec une classe selon le groupe, pour du style conditionnel en CSS
  applyGroupUI() {
    const g = this.currentUser().groupe || 'utilisateur';
    document.body.classList.remove('group-utilisateur','group-MSP','group-admin');
    document.body.classList.add('group-' + g);
  },

  // Modal helpers
  openModal(title, bodyHTML, footerHTML) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    document.getElementById('modal-foot').innerHTML = footerHTML || '';
    document.getElementById('modal-root').classList.remove('hidden');
  },
  closeModal() { document.getElementById('modal-root').classList.add('hidden'); },

  // Overlay = petite popup posée au-dessus d'une modale (préserve le form derrière)
  openOverlay(title, bodyHTML, footerHTML) {
    this.closeOverlay();
    const ov = document.createElement('div');
    ov.className = 'app-overlay';
    ov.innerHTML = `
      <div class="app-overlay-card">
        <header class="app-overlay-head">
          <h3>${title}</h3>
          <button class="modal-close" id="app-overlay-close" aria-label="Fermer">×</button>
        </header>
        <div class="app-overlay-body">${bodyHTML}</div>
        <footer class="app-overlay-foot">${footerHTML||''}</footer>
      </div>`;
    document.body.appendChild(ov);
    document.getElementById('app-overlay-close').onclick = () => this.closeOverlay();
  },
  closeOverlay() {
    const ov = document.querySelector('.app-overlay');
    if (ov) ov.remove();
  },

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
  exportCSV(type = 'taches') {
    const s = DB.state;
    let rows, headers, filename;

    if (type === 'taches') {
      headers = ['ID','Nom','Projet','Assigné(s)','Début','Fin','Avancement%','Statut','Machine','Lieu'];
      rows = (s.taches || []).map(t => {
        const prj = DB.projet(t.projetId);
        const assignes = (t.assignes || []).map(pid => { const p = DB.personne(pid); return p ? (p.prenom + ' ' + p.nom) : pid; }).join(' | ');
        const machine = t.machineId ? (DB.machine(t.machineId)?.nom || t.machineId) : '';
        const lieu = t.lieuId ? (DB.lieu(t.lieuId)?.nom || t.lieuId) : '';
        return [t.id, t.nom, prj?.nom || '', assignes, t.debut, t.fin, t.avancement || 0, t.statut || '', machine, lieu];
      });
      filename = 'taches-' + D.today() + '.csv';
    } else if (type === 'stock') {
      headers = ['ID','Réf','Nom','Quantité','Seuil alerte','Unité','Emplacement'];
      rows = (s.stock || []).map(a => {
        const lieu = a.lieuId ? (DB.lieu(a.lieuId)?.nom || a.lieuId) : '';
        return [a.id, a.ref || '', a.nom, a.quantite ?? '', a.seuilAlerte ?? '', a.unite || '', lieu];
      });
      filename = 'stock-' + D.today() + '.csv';
    } else if (type === 'commandes') {
      headers = ['ID','Réf','Fournisseur','Article','Qté','Statut','Date commande','Date livraison prévue'];
      rows = (s.commandes || []).map(c => [c.id, c.ref || '', c.fournisseur || '', c.article || '', c.quantite ?? '', c.statut || '', c.dateCommande || '', c.dateLivraison || '']);
      filename = 'commandes-' + D.today() + '.csv';
    } else if (type === 'personnes') {
      headers = ['ID','Prénom','Nom','Groupe','Lieu principal','Horaires (h/sem)'];
      rows = (s.personnes || []).map(p => {
        const lieu = p.lieuPrincipalId ? (DB.lieu(p.lieuPrincipalId)?.nom || '') : '';
        const heures = p.horaires ? Object.values(p.horaires).reduce((sum, h) => sum + (h.debut && h.fin ? (D.parse(D.today().slice(0,8)+'01') ? 8 : 8) : 0), 0) : '';
        return [p.id, p.prenom || '', p.nom, p.groupe || '', lieu, heures];
      });
      filename = 'personnes-' + D.today() + '.csv';
    } else {
      return;
    }

    const escape = v => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    this.toast('Export CSV téléchargé (' + rows.length + ' lignes)', 'success');
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

  // Utilitaires d'affichage (with HTML escaping for safety)
  personneLabel(p) { return p ? (this.escapeHTML(p.prenom) + ' ' + this.escapeHTML(p.nom)) : '—'; },
  lieuLabel(l) { return l ? this.escapeHTML(l.nom) : '—'; },
  projetLabel(p) { return p ? (this.escapeHTML(p.code) + ' — ' + this.escapeHTML(p.nom)) : '—'; },

  // Build <option>/<optgroup> HTML for project selects; selectedId = currently selected project id
  projetsOptions(selectedId = '', emptyLabel = '— Aucun projet (tâche libre)') {
    const projets = DB.state.projets;
    const grouped = {};
    projets.forEach(p => { const g = p.groupe||''; if (!grouped[g]) grouped[g]=[]; grouped[g].push(p); });
    const keys = Object.keys(grouped).sort((a,b) => { if(!a) return 1; if(!b) return -1; return a.localeCompare(b); });
    let html = `<option value="" ${!selectedId?'selected':''}>${emptyLabel}</option>`;
    keys.forEach(g => {
      const opts = grouped[g].map(p => `<option value="${p.id}" ${p.id===selectedId?'selected':''}>${p.code} — ${p.nom}</option>`).join('');
      html += g ? `<optgroup label="${g}">${opts}</optgroup>` : opts;
    });
    return html;
  },

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
          alerts.push({
            kind:'stock-bom', niveau:'bad',
            msg:`J-${j} · ${t.nom} (${prj.code}) · stock ${art.ref} insuffisant (${art.quantite}/${l.quantite})`,
            target: { view: 'bom', projetId: prj.id, articleId: art.id },
          });
        }
      });
    });

    // 2) Machines avec conflit dans les 10 j ouvrés
    const confs = this.detectConflicts().machines;
    confs.forEach(c => {
      const t1 = DB.tache(c.t1), t2 = DB.tache(c.t2);
      if (t1 && t1.debut >= today && t1.debut <= horizon) {
        const m = DB.machine(c.machineId);
        const p1 = DB.projet(t1?.projetId), p2 = DB.projet(t2?.projetId);
        const lbl = (t, p) => `${p?p.code+' · ':''}« ${t?.nom} » ${D.fmt(t?.debut)}→${D.fmt(t?.fin)}`;
        alerts.push({
          kind:'machine-conflit', niveau:'warn',
          msg:`Conflit ${m?.nom} : ${lbl(t1,p1)} ↔ ${lbl(t2,p2)}`,
          target: { view: 'gantt', tacheId: c.t1, machineId: c.machineId, conflictTacheId: c.t2 },
        });
      }
    });

    // 3) Personnes saturées (>100% semaine prochaine)
    const weekStart = D.addWorkdays(today, 1);
    const weekEnd = D.addWorkdays(weekStart, 4);
    s.personnes.forEach(p => {
      const ts = s.taches.filter(t => (t.assignes||[]).includes(p.id) && t.fin >= weekStart && t.debut <= weekEnd);
      const h = ts.reduce((n,t) => n + D.workdaysBetween(t.debut > weekStart ? t.debut : weekStart, t.fin < weekEnd ? t.fin : weekEnd) * 7, 0);
      if (h > (p.capaciteHebdo||35)) {
        alerts.push({
          kind:'person-surcharge', niveau:'warn',
          msg:`${this.personneLabel(p)} saturé·e semaine prochaine (${h}h/${p.capaciteHebdo}h)`,
          target: { view: 'personnes', personneId: p.id },
        });
      }
    });

    // 4) Projets avec retard prédit > 3 jours
    s.projets.filter(p => p.statut === 'en-cours').forEach(p => {
      const pr = this.predictProjectEnd(p.id);
      if (pr && pr.delayDays >= 3) {
        alerts.push({
          kind:'project-delay', niveau:'bad',
          msg:`${p.code} : retard prédit +${pr.delayDays} j (fin → ${D.fmt(pr.predEnd)})`,
          target: { view: 'projets', projetId: p.id },
        });
      }
    });

    return alerts;
  },

  // ── Barre de recherche persistante ──────────────────────────────────────
  initSearchBar() {
    const input = document.getElementById('searchbar-input');
    const results = document.getElementById('searchbar-results');
    if (!input || !results) return;
    let sbSelected = 0, sbResults = [];

    const render = (q) => {
      sbResults = q.trim() ? this.searchAll(q, 12) : [];
      sbSelected = 0;
      if (!sbResults.length) {
        results.innerHTML = q.trim() ? `<div class="sb-empty">Aucun résultat pour « ${this.escapeHTML(q)} »</div>` : '';
        results.classList.toggle('hidden', !q.trim());
        return;
      }
      results.innerHTML = sbResults.map((r, i) =>
        `<div class="sb-item${i===0?' on':''}" data-i="${i}">
          <span class="sb-kind">${this.escapeHTML(r.kind)}</span>
          <span class="sb-label">${this.escapeHTML(r.label)}</span>
          <span class="sb-meta">${this.escapeHTML(r.meta||'')}</span>
        </div>`).join('');
      results.classList.remove('hidden');
      results.querySelectorAll('.sb-item').forEach(el => {
        el.onmouseenter = () => { sbSelected = +el.dataset.i; highlight(); };
        el.onclick = () => open(+el.dataset.i);
      });
    };

    const highlight = () => {
      results.querySelectorAll('.sb-item').forEach((el, i) => el.classList.toggle('on', i === sbSelected));
    };

    const open = (idx) => {
      const r = sbResults[idx];
      if (!r) return;
      input.value = '';
      results.classList.add('hidden');
      input.blur();
      if (r.target) { this.navigateToTarget(r.target); return; }
      this.navigate(r.view);
      if (r.onOpen) setTimeout(r.onOpen, 60);
    };

    input.oninput = () => render(input.value);
    input.onkeydown = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sbSelected = Math.min(sbResults.length - 1, sbSelected + 1); highlight(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sbSelected = Math.max(0, sbSelected - 1); highlight(); }
      else if (e.key === 'Enter') { e.preventDefault(); open(sbSelected); }
      else if (e.key === 'Escape') { input.value = ''; results.classList.add('hidden'); input.blur(); }
    };
    input.onfocus = () => { if (input.value.trim()) render(input.value); };
    input.onblur = () => setTimeout(() => results.classList.add('hidden'), 150);

    // / key focuses the bar (only when not in another input)
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {
        e.preventDefault(); input.focus(); input.select();
      }
    });
  },

  // ── Notifications navigateur ────────────────────────────────────────────
  _notifLastHash: null,
  initNotifications() {
    if (!('Notification' in window)) return;
    // Si déjà accordée, activer silencieusement
    if (Notification.permission === 'granted') this._scheduleNotifCheck();
  },
  requestNotificationPermission() {
    if (!('Notification' in window)) { this.toast('Notifications non supportées par ce navigateur', 'warn'); return; }
    if (Notification.permission === 'granted') { this.toast('Notifications déjà activées ✓', 'success'); return; }
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        this.toast('Notifications activées ✓', 'success');
        this._scheduleNotifCheck();
        this._sendBrowserNotif('Atelier Plan', 'Vous recevrez des alertes pour les tâches urgentes.', 'welcome');
      } else {
        this.toast('Permission refusée', 'warn');
      }
    });
  },
  _scheduleNotifCheck() {
    // Vérifier toutes les heures
    this._notifTimer = setInterval(() => this._checkAndNotify(), 60 * 60 * 1000);
    this._checkAndNotify(); // vérification immédiate
  },
  _checkAndNotify() {
    if (Notification.permission !== 'granted') return;
    const alerts = this.proactiveAlerts().filter(a => a.niveau === 'bad');
    if (!alerts.length) return;
    const hash = alerts.map(a => a.msg).join('|');
    if (hash === this._notifLastHash) return; // déjà notifié pour ces alertes
    this._notifLastHash = hash;
    const badCount = alerts.length;
    this._sendBrowserNotif(
      `⚠ ${badCount} alerte${badCount > 1 ? 's' : ''} critique${badCount > 1 ? 's' : ''}`,
      alerts.slice(0, 3).map(a => `• ${a.msg}`).join('\n'),
      'atelier-alerts'
    );
  },
  _sendBrowserNotif(title, body, tag = 'atelier') {
    if (Notification.permission !== 'granted') return;
    const n = new Notification(title, {
      body, tag, icon: './icons/icon-192.svg', badge: './icons/icon-192.svg',
      requireInteraction: false,
    });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 8000);
  },

};

// Lance après que tous les scripts de vue sont chargés
document.addEventListener('DOMContentLoaded', () => App.init());
