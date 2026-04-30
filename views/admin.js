// Vue Administration : gestion des utilisateurs et des permissions de groupes
App.views.admin = {
  render(root) {
    if (!App.can('admin')) {
      root.innerHTML = `<div class="card"><h2>Accès refusé</h2><p class="muted">Seuls les administrateurs peuvent accéder à cette vue. Sélectionne un utilisateur du groupe <strong>admin</strong> dans la topbar.</p></div>`;
      return;
    }
    const s = DB.state;
    root.innerHTML = `
      <div class="toolbar">
        <strong>Administration</strong>
        <span class="muted small">Gestion des utilisateurs et des permissions de groupes</span>
        <span class="spacer"></span>
        <button class="btn" id="adm-add-user">+ Nouvel utilisateur</button>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h2>Groupes & permissions</h2>
        <p class="muted small">Coche pour autoriser, décoche pour interdire. Les changements s'appliquent à tous les utilisateurs du groupe.</p>
        <div id="adm-groupes"></div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h2>Accès aux modules</h2>
        <p class="muted small">Contrôle quels modules sont visibles dans la navigation pour chaque groupe. L'Admin a toujours accès à tout.</p>
        <div id="adm-modules"></div>
      </div>

      <div class="card">
        <h2>Utilisateurs (${s.utilisateurs.length})</h2>
        <div id="adm-users"></div>
      </div>
    `;
    document.getElementById('adm-add-user').onclick = () => this.openUserForm(null);
    this.drawGroupes();
    this.drawModules();
    this.drawUsers();
  },

  drawGroupes() {
    const g = DB.state.groupes;
    const permCols = ['read','edit','sign','engage','whatif','reset','admin'];
    const permLabels = { read:'Lecture', edit:'Édition', sign:'Signer 4A', engage:'Engager', whatif:'What-if', reset:'Reset', admin:'Admin' };
    const rows = Object.keys(g).map(key => {
      const grp = g[key];
      return `<tr data-g="${key}">
        <td><strong>${grp.libelle}</strong><div class="muted small">${grp.description||''}</div></td>
        ${permCols.map(p => `<td style="text-align:center"><input type="checkbox" data-perm="${p}" ${grp.perms[p]?'checked':''} ${key==='admin'&&p==='admin'?'disabled':''}></td>`).join('')}
      </tr>`;
    }).join('');
    document.getElementById('adm-groupes').innerHTML = `
      <table class="data">
        <thead><tr><th>Groupe</th>${permCols.map(p => `<th style="text-align:center">${permLabels[p]}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    document.querySelectorAll('#adm-groupes tbody tr').forEach(tr => {
      const key = tr.dataset.g;
      tr.querySelectorAll('input[data-perm]').forEach(cb => {
        cb.onchange = () => {
          DB.state.groupes[key].perms[cb.dataset.perm] = cb.checked;
          DB.save();
          App.toast('Permission mise à jour','success');
          App.applyPerms();
        };
      });
    });
  },

  drawModules() {
    const g = DB.state.groupes;
    const groups = Object.keys(g).filter(k => k !== 'admin');
    const cats = [...new Set(MODULES_ACCESS.map(m => m.cat))];

    const headerCols = groups.map(k => `<th style="text-align:center;min-width:90px">${g[k].libelle}</th>`).join('') +
      `<th style="text-align:center;min-width:90px;color:var(--text-muted)">Admin</th>`;

    const rows = cats.map(cat => {
      const mods = MODULES_ACCESS.filter(m => m.cat === cat);
      const catRow = `<tr><td colspan="${groups.length + 2}" style="padding:6px 10px 2px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;background:var(--surface-2,var(--bg));">${cat}</td></tr>`;
      const modRows = mods.map(m => `
        <tr data-mod="${m.id}">
          <td style="padding:5px 10px;font-size:13px;">${m.label}</td>
          ${groups.map(k => {
            const checked = g[k].moduleAccess?.[m.id] !== false;
            return `<td style="text-align:center"><input type="checkbox" data-gkey="${k}" data-mid="${m.id}" ${checked ? 'checked' : ''}></td>`;
          }).join('')}
          <td style="text-align:center"><input type="checkbox" checked disabled title="L'Admin a toujours accès à tous les modules"></td>
        </tr>`).join('');
      return catRow + modRows;
    }).join('');

    document.getElementById('adm-modules').innerHTML = `
      <table class="data">
        <thead><tr><th>Module</th>${headerCols}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

    document.querySelectorAll('#adm-modules input[data-gkey]').forEach(cb => {
      cb.onchange = () => {
        const k = cb.dataset.gkey, mid = cb.dataset.mid;
        if (!DB.state.groupes[k].moduleAccess) DB.state.groupes[k].moduleAccess = {};
        DB.state.groupes[k].moduleAccess[mid] = cb.checked;
        DB.save();
        App.applyPerms();
        App.toast('Accès module mis à jour', 'success');
      };
    });
  },

  drawUsers() {
    const s = DB.state;
    const rows = s.utilisateurs.map(u => {
      const groupeClass = u.groupe === 'admin' ? 'bad' : u.groupe === 'MSP' ? 'warn' : 'muted';
      const pw = u.passwordHash ? '<span class="badge good">🔒 défini</span>' : '<span class="badge muted">aucun</span>';
      return `<tr data-id="${u.id}" style="cursor:pointer">
        <td><strong>${u.nom}</strong></td>
        <td>${u.role||''}</td>
        <td><span class="badge ${groupeClass}">${u.groupe||'—'}</span></td>
        <td>${(u.axes||[]).join(', ')||'—'}</td>
        <td>${pw}</td>
        <td class="mono small muted">${u.id}</td>
      </tr>`;
    }).join('');
    document.getElementById('adm-users').innerHTML = `
      <table class="data">
        <thead><tr><th>Nom</th><th>Rôle</th><th>Groupe</th><th>Axes 4A</th><th>Mot de passe</th><th>ID</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    document.querySelectorAll('#adm-users tbody tr').forEach(tr => tr.onclick = () => this.openUserForm(tr.dataset.id));
  },

  openUserForm(id) {
    const s = DB.state;
    const isNew = !id;
    const u = id ? s.utilisateurs.find(x => x.id === id) : { id: DB.uid('U'), nom:'', role:'', groupe:'utilisateur', axes:[] };
    const axesCodes = (s.regle4A.axes || []).map(a => a.code);
    const body = `
      <div class="field"><label>Nom complet</label><input id="uf-nom" value="${u.nom||''}"></div>
      <div class="row">
        <div class="field"><label>Rôle (libellé)</label><input id="uf-role" value="${u.role||''}"></div>
        <div class="field"><label>Groupe d'accès</label>
          <select id="uf-groupe">
            ${Object.keys(s.groupes).map(g => `<option value="${g}" ${g===u.groupe?'selected':''}>${s.groupes[g].libelle}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field"><label>Axes 4A autorisés (pour les MSP — ignoré pour admin qui a tous les axes, et utilisateur qui n'en a aucun)</label>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${axesCodes.map(a => `<label class="chip"><input type="checkbox" class="uf-axe" value="${a}" ${(u.axes||[]).includes(a)?'checked':''}> ${a}</label>`).join('')}
        </div>
      </div>
      <div class="field"><label>Mot de passe ${u.passwordHash?'<span class="badge good small">défini</span>':'<span class="badge muted small">aucun</span>'}</label>
        <div class="row" style="gap:6px">
          <input type="password" id="uf-pw" placeholder="${u.passwordHash?'Laisser vide pour ne pas changer':'Nouveau mot de passe (optionnel)'}">
          ${u.passwordHash ? '<button class="btn btn-secondary" id="uf-pw-clear" type="button" title="Retirer le mot de passe">Retirer</button>' : ''}
        </div>
        <p class="muted small" style="margin-top:4px">Laisser vide pour conserver l'actuel. Entrer un nouveau pour le remplacer.</p>
      </div>
      <div class="muted small">ID technique : <code>${u.id}</code></div>
    `;
    const foot = `${!isNew?'<button class="btn btn-danger" id="uf-del">Supprimer</button>':''}<span class="spacer" style="flex:1"></span>
      <button class="btn btn-secondary" id="uf-cancel">Annuler</button>
      <button class="btn" id="uf-save">${isNew?'Créer':'Enregistrer'}</button>`;
    App.openModal(isNew?'Nouvel utilisateur':App.escapeHTML(u.nom), body, foot);
    document.getElementById('uf-cancel').onclick = () => App.closeModal();
    document.getElementById('uf-save').onclick = async () => {
      u.nom = document.getElementById('uf-nom').value.trim();
      u.role = document.getElementById('uf-role').value.trim();
      u.groupe = document.getElementById('uf-groupe').value;
      u.axes = Array.from(document.querySelectorAll('.uf-axe:checked')).map(cb => cb.value);
      if (!u.nom) { App.toast('Nom requis','error'); return; }
      if (isNew) s.utilisateurs.push(u);
      const newPw = document.getElementById('uf-pw').value;
      if (newPw) { u.passwordHash = await App.hash(newPw); }
      DB.save(); App.closeModal(); App.populateUserSelect(); App.refresh();
      App.toast('Utilisateur enregistré' + (newPw?' · mot de passe mis à jour':''), 'success');
    };
    const clearBtn = document.getElementById('uf-pw-clear');
    if (clearBtn) clearBtn.onclick = () => {
      if (!confirm('Retirer le mot de passe de ' + u.nom + ' ?')) return;
      delete u.passwordHash;
      DB.save(); App.closeModal(); App.populateUserSelect(); App.refresh();
      App.toast('Mot de passe retiré','info');
    };
    if (!isNew) document.getElementById('uf-del').onclick = () => {
      if (s.utilisateurs.length === 1) { App.toast('Impossible de supprimer le dernier utilisateur','error'); return; }
      if (u.id === App.currentUser().id) { App.toast("Tu ne peux pas supprimer l'utilisateur courant",'error'); return; }
      if (!confirm('Supprimer ' + u.nom + ' ?')) return;
      s.utilisateurs = s.utilisateurs.filter(x => x.id !== u.id);
      DB.save(); App.closeModal(); App.populateUserSelect(); App.refresh();
    };
  },
};
