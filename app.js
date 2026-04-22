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
    this.applyGroupUI();
    // Login au démarrage si pas de session authentifiée
    if (!this.isAuthed()) {
      this.showLogin();
    } else {
      this.navigate(location.hash.replace('#','') || 'dashboard');
      if (!localStorage.getItem('atelier_tuto_seen')) {
        setTimeout(() => this.showTutorial(false), 400);
      }
    }
  },

  // Hachage SHA-256 du mot de passe (Web Crypto API)
  async hash(s) {
    const data = new TextEncoder().encode(s);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  },

  isAuthed() {
    const id = sessionStorage.getItem('atelier_authed');
    if (!id) return false;
    const u = (DB.state.utilisateurs || []).find(x => x.id === id);
    return !!u;
  },

  async login(userId, password) {
    const u = (DB.state.utilisateurs || []).find(x => x.id === userId);
    if (!u) return false;
    // Pas de mot de passe défini → accès direct
    if (!u.passwordHash) {
      sessionStorage.setItem('atelier_authed', userId);
      localStorage.setItem('atelier_user_id', userId);
      return true;
    }
    const h = await this.hash(password || '');
    if (h === u.passwordHash) {
      sessionStorage.setItem('atelier_authed', userId);
      localStorage.setItem('atelier_user_id', userId);
      return true;
    }
    return false;
  },

  logout() {
    sessionStorage.removeItem('atelier_authed');
    this.showLogin();
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

  showLogin() {
    const existing = document.getElementById('login-overlay');
    if (existing) existing.remove();
    const o = document.createElement('div');
    o.id = 'login-overlay';
    o.className = 'login-overlay';
    const users = DB.state.utilisateurs || [];
    const curId = localStorage.getItem('atelier_user_id') || users[0]?.id || '';
    o.innerHTML = `<div class="login-card">
      <div class="login-logo">◆</div>
      <h2>Atelier · Planification</h2>
      <p class="muted">Connecte-toi pour continuer</p>
      <label class="small" style="display:block;text-align:left;margin-top:14px">Utilisateur</label>
      <select id="login-user" class="login-input">
        ${users.map(u => `<option value="${u.id}" ${u.id===curId?'selected':''}>${u.nom} · ${u.groupe}${u.passwordHash?' 🔒':''}</option>`).join('')}
      </select>
      <label class="small" style="display:block;text-align:left;margin-top:10px">Mot de passe <span id="login-pw-hint" class="muted">(aucun — laisser vide)</span></label>
      <input type="password" id="login-pw" class="login-input" placeholder="••••••••" autofocus>
      <div id="login-error" class="login-error" style="display:none"></div>
      <button class="btn" id="login-btn" style="margin-top:14px;width:100%;padding:10px">Se connecter</button>
      ${this._pendingSwitch ? '<button class="btn btn-secondary" id="login-cancel" style="margin-top:6px;width:100%">Annuler (rester connecté·e comme avant)</button>' : ''}
      <p class="muted small" style="margin-top:14px">Astuce : les utilisateurs sans cadenas 🔒 n'ont pas de mot de passe. Un admin peut en définir un dans la vue Admin (⚙).</p>
    </div>`;
    document.body.appendChild(o);

    const userSel = document.getElementById('login-user');
    const pwInput = document.getElementById('login-pw');
    const hint = document.getElementById('login-pw-hint');
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    const refreshHint = () => {
      const u = users.find(x => x.id === userSel.value);
      if (u && u.passwordHash) {
        hint.textContent = '(obligatoire)'; hint.classList.remove('muted');
      } else {
        hint.textContent = '(aucun — laisser vide)'; hint.classList.add('muted');
      }
    };
    userSel.onchange = refreshHint;
    refreshHint();

    const doLogin = async () => {
      errEl.style.display = 'none';
      btn.disabled = true; btn.textContent = 'Connexion…';
      const ok = await this.login(userSel.value, pwInput.value);
      btn.disabled = false; btn.textContent = 'Se connecter';
      if (ok) {
        document.getElementById('login-overlay').remove();
        this.populateUserSelect();
        this.applyGroupUI();
        this.navigate(location.hash.replace('#','') || 'dashboard');
        this.toast('Connecté comme ' + this.currentUser().nom, 'success');
        if (!localStorage.getItem('atelier_tuto_seen')) {
          setTimeout(() => this.showTutorial(false), 400);
        }
      } else {
        errEl.style.display = 'block';
        errEl.textContent = '✗ Mot de passe incorrect';
        pwInput.value = '';
        pwInput.focus();
      }
    };
    btn.onclick = doLogin;
    pwInput.onkeydown = e => { if (e.key === 'Enter') doLogin(); };
    const cancelBtn = document.getElementById('login-cancel');
    if (cancelBtn) cancelBtn.onclick = () => {
      // Restaure la session précédente
      const prevId = this._pendingSwitch.prevId;
      sessionStorage.setItem('atelier_authed', prevId);
      localStorage.setItem('atelier_user_id', prevId);
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
      <p class="muted small">Utilisateur : <strong>${u.nom}</strong> · groupe ${u.groupe}</p>
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
    const prev = sessionStorage.getItem('atelier_authed');
    this._pendingSwitch = prev ? { prevId: prev } : null;
    sessionStorage.removeItem('atelier_authed');
    localStorage.setItem('atelier_user_id', id);
    this.showLogin();
  },
  populateUserSelect() {
    const sel = document.getElementById('user-select');
    if (!sel) return;
    const users = DB.state.utilisateurs || [];
    const curId = this.currentUser().id;
    sel.innerHTML = users.map(u => `<option value="${u.id}" ${u.id===curId?'selected':''}>${u.nom} · ${u.groupe||'—'}${u.axes.length?' ('+u.axes.join('/')+')':''}</option>`).join('');
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
  // Applique les permissions aux éléments marqués data-perm dans le DOM
  applyPerms() {
    document.querySelectorAll('[data-perm]').forEach(el => {
      const ok = this.can(el.dataset.perm);
      el.style.display = ok ? '' : 'none';
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
    // Recherche globale (Ctrl+K / Cmd+K) — fonctionne même depuis un input
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault(); this.showGlobalSearch(); return;
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
    const map = { d:'dashboard', g:'gantt', c:'calendrier', p:'personnes', l:'lieux', m:'machines', j:'projets', s:'stock', v:'deplacements', o:'commandes', b:'bom', x:'capacite', w:'whatif' };
    if (map[e.key]) { this.navigate(map[e.key]); e.preventDefault(); return; }
    if (e.key === '?') { this.showHelp(); e.preventDefault(); return; }
    if (e.key === 'n' && this.views[this.view].newItem) { this.views[this.view].newItem(); e.preventDefault(); return; }
    if (e.key === '/') { const s = document.querySelector('input[type=search]'); if (s) { s.focus(); e.preventDefault(); } return; }
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
    this.navigate(r.view);
    if (r.onOpen) setTimeout(r.onOpen, 50);
  },
  searchAll(q, limit) {
    const s = DB.state;
    const ql = q.toLowerCase().trim();
    const out = [];
    const push = (r) => { if (!ql || r.label.toLowerCase().includes(ql) || (r.meta||'').toLowerCase().includes(ql)) out.push(r); };
    s.personnes.forEach(p => push({ kind:'Personne', label:this.personneLabel(p), meta:`${p.role} · ${DB.lieu(p.lieuPrincipalId)?.nom||''} · ${(p.competences||[]).join(', ')}`, view:'personnes' }));
    s.projets.forEach(p => push({ kind:'Projet',   label:`${p.code} — ${p.nom}`, meta:`${p.client||''} · ${p.statut}`, view:'projets' }));
    s.stock.forEach(a => push({ kind:'Article',   label:`${a.ref} — ${a.nom}`, meta:`${a.quantite} ${a.unite} · ${DB.lieu(a.lieuId)?.nom||''}`, view:'stock' }));
    s.commandes.forEach(c => push({ kind:'Commande', label:c.ref, meta:`${c.fournisseur} · ${c.statut}`, view:'commandes' }));
    s.taches.forEach(t => {
      const prj = DB.projet(t.projetId);
      push({ kind:'Tâche', label:t.nom, meta:`${prj?prj.code:''} · ${D.fmt(t.debut)}→${D.fmt(t.fin)}`, view:'gantt' });
    });
    s.machines.forEach(m => push({ kind:'Machine', label:m.nom, meta:`${m.type} · ${DB.lieu(m.lieuId)?.nom||''}`, view:'machines' }));
    s.lieux.forEach(l => push({ kind:'Lieu', label:l.nom, meta:`${l.type} · ${l.etage}`, view:l.type==='production'?'lieux':'lieux' }));
    return out.slice(0, limit);
  },

  showTutorial(forceReplay) {
    const steps = [
      { icon:'👋', title:'Bienvenue sur Atelier · Planification',
        body:'Application web 100% locale pour gérer personnes, projets, machines, lieux, stock, commandes et plannings.<br><br>Les données sont sauvegardées dans le navigateur (<code>localStorage</code>). Utilise <strong>Exporter</strong> régulièrement pour des sauvegardes JSON.' },
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
      <p><kbd>Ctrl</kbd>+<kbd>K</kbd> Recherche globale · <kbd>/</kbd> Recherche vue · <kbd>N</kbd> Nouveau · <kbd>?</kbd> Aide</p>
      <p><kbd>Ctrl</kbd>+<kbd>Z</kbd> Annuler · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> Refaire · <kbd>Esc</kbd> Fermer</p>
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
