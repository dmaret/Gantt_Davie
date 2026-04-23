App.views.machines = {
  state: { search:'', typeFilter:'', lieuFilter:'', onlyConflicts:false },
  render(root) {
    const s = DB.state;
    const types = Array.from(new Set(s.machines.map(m => m.type))).sort();
    const lieuxProd = s.lieux.filter(l => l.type === 'production');
    root.innerHTML = `
      <div class="toolbar">
        <input type="search" id="m-search" placeholder="Rechercher machine...">
        <select id="m-type"><option value="">Tous types</option>${types.map(t=>`<option value="${t}">${t}</option>`).join('')}</select>
        <select id="m-lieu"><option value="">Tous lieux</option>${lieuxProd.map(l=>`<option value="${l.id}">${l.nom}</option>`).join('')}</select>
        <label class="small"><input type="checkbox" id="m-conf"> Seulement conflits</label>
        <span class="spacer"></span>
        <button class="btn-ghost" id="m-csv">⤓ Exporter CSV</button>
        <button class="btn" id="m-add">+ Ajouter une machine</button>
      </div>
      <div class="card"><div id="m-table"></div></div>
    `;
    document.getElementById('m-search').oninput = e => { this.state.search = e.target.value.toLowerCase(); this.draw(); };
    document.getElementById('m-type').onchange = e => { this.state.typeFilter = e.target.value; this.draw(); };
    document.getElementById('m-lieu').onchange = e => { this.state.lieuFilter = e.target.value; this.draw(); };
    document.getElementById('m-conf').onchange = e => { this.state.onlyConflicts = e.target.checked; this.draw(); };
    document.getElementById('m-add').onclick = () => this.openForm(null);
    document.getElementById('m-csv').onclick = () => {
      const conflicts = App.detectConflicts();
      const conflSet = new Set(conflicts.machines.map(c => c.machineId));
      const head = ['Machine','Type','Lieu','Capacité/j','Tâches 7j','Charge j-h','Capacité j-h','Utilisation %','Conflit'];
      const rows = [head];
      const today = D.today();
      const end = D.addWorkdays(today, 6);
      DB.state.machines.forEach(m => {
        const lieu = DB.lieu(m.lieuId);
        const tasks = DB.state.taches.filter(t => t.machineId === m.id && t.fin >= today && t.debut <= end);
        const jours = tasks.reduce((n,t) => {
          const a = t.debut < today ? today : t.debut;
          const b = t.fin > end ? end : t.fin;
          return n + D.workdaysBetween(a, b);
        }, 0);
        const capa = m.capaciteJour ? (m.capaciteJour/8) * 7 : 7;
        const pct = capa ? Math.min(999, Math.round(jours / capa * 100)) : 0;
        rows.push([m.nom, m.type, lieu?lieu.nom:'', m.capaciteJour, tasks.length, jours, Math.round(capa*10)/10, pct, conflSet.has(m.id)?'OUI':'']);
      });
      CSV.download('machines-' + D.today() + '.csv', rows);
      App.toast('Export CSV téléchargé','success');
    };
    this.draw();
  },
  draw() {
    const st = this.state, s = DB.state;
    const conflicts = App.detectConflicts();
    const conflSet = new Set(conflicts.machines.map(c => c.machineId));
    const today = D.today();
    const end = D.addWorkdays(today, 6); // 7 jours ouvrés (j0 + 6)

    let list = s.machines.slice();
    if (st.search) list = list.filter(m => (m.nom + ' ' + m.type).toLowerCase().includes(st.search));
    if (st.typeFilter) list = list.filter(m => m.type === st.typeFilter);
    if (st.lieuFilter) list = list.filter(m => m.lieuId === st.lieuFilter);
    if (st.onlyConflicts) list = list.filter(m => conflSet.has(m.id));

    const rows = list.map(m => {
      const lieu = DB.lieu(m.lieuId);
      const tasks = s.taches.filter(t => t.machineId === m.id && t.fin >= today && t.debut <= end)
                            .sort((a,b) => a.debut.localeCompare(b.debut));
      const jours = tasks.reduce((n,t) => {
        const a = t.debut < today ? today : t.debut;
        const b = t.fin > end ? end : t.fin;
        return n + D.workdaysBetween(a, b);
      }, 0);
      const capa = m.capaciteJour ? (m.capaciteJour/8) * 7 : 7; // en jours-homme sur 7 jours ouvrés
      const pct = capa ? Math.min(100, Math.round(jours / capa * 100)) : 0;
      const cls = pct > 90 ? 'bad' : pct > 70 ? 'warn' : '';
      const projChips = Array.from(new Set(tasks.map(t => t.projetId))).map(pid => {
        const p = DB.projet(pid); return p ? `<span class="chip" style="background:${p.couleur}22;color:${p.couleur}">${p.code}</span>` : '';
      }).join('');
      const confBadge = conflSet.has(m.id) ? '<span class="badge bad">conflit</span>' : '';
      return `<tr data-id="${m.id}" style="cursor:pointer">
        <td><strong>${m.nom}</strong> ${confBadge}</td>
        <td>${m.type}</td>
        <td>${lieu?lieu.nom:'—'} <span class="muted small">${lieu?'· '+lieu.etage:''}</span></td>
        <td class="right">${m.capaciteJour} j-h/j</td>
        <td class="right">${tasks.length}</td>
        <td><div class="bar-inline ${cls}"><div class="fill" style="width:${pct}%"></div></div></td>
        <td class="right">${pct}%</td>
        <td>${projChips || '<span class="muted small">—</span>'}</td>
      </tr>`;
    }).join('');
    document.getElementById('m-table').innerHTML = `
      <table class="data">
        <thead><tr><th>Machine</th><th>Type</th><th>Lieu</th><th class="right">Capacité</th><th class="right">Tâches 7j</th><th>Charge</th><th class="right">%</th><th>Projets</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="muted small" style="margin-top:10px">${list.length} machine(s) · charge calculée sur 7 jours ouvrés</p>
    `;
    document.querySelectorAll('#m-table tbody tr').forEach(tr => tr.onclick = () => this.openForm(tr.dataset.id));
  },
  openForm(id) {
    const isNew = !id;
    const s = DB.state;
    const m = id ? DB.machine(id) : { id: DB.uid('M'), nom:'', type:'', lieuId: s.lieux.find(l=>l.type==='production').id, capaciteJour:8 };
    const lieuxProd = s.lieux.filter(l => l.type === 'production');

    // Conflits éventuels pour cette machine
    const conflictsAll = isNew ? [] : App.detectConflicts().machines.filter(c => c.machineId === id);
    const conflictTids = new Set(conflictsAll.flatMap(c => [c.t1, c.t2]));

    const tachesMachine = id ? s.taches.filter(t => t.machineId === id).sort((a,b) => a.debut.localeCompare(b.debut)) : [];

    // Bloc conflits
    const conflictsHTML = conflictsAll.length ? `
      <div class="field">
        <label style="color:var(--danger)">⚠ ${conflictsAll.length} conflit(s) détecté(s)</label>
        <ul class="list" style="margin:4px 0 0 0">
          ${conflictsAll.map(c => {
            const t1 = DB.tache(c.t1), t2 = DB.tache(c.t2);
            const p1 = t1 && DB.projet(t1.projetId), p2 = t2 && DB.projet(t2.projetId);
            return `<li style="background:var(--danger-bg,#fff0f0);border-radius:4px;padding:6px 10px;gap:8px">
              <div style="flex:1">
                <div><strong>${t1?t1.nom:'?'}</strong> <span class="muted small">${p1?p1.code:''}</span> · ${t1?D.fmt(t1.debut)+' → '+D.fmt(t1.fin):'?'}</div>
                <div class="muted small" style="margin:2px 0">↕ chevauche</div>
                <div><strong>${t2?t2.nom:'?'}</strong> <span class="muted small">${p2?p2.code:''}</span> · ${t2?D.fmt(t2.debut)+' → '+D.fmt(t2.fin):'?'}</div>
              </div>
              <div style="display:flex;flex-direction:column;gap:4px;align-self:center">
                <button class="btn btn-secondary conf-gantt" data-t1="${c.t1}" data-t2="${c.t2}" style="padding:3px 10px;font-size:12px">📅 Gantt</button>
              </div>
            </li>`;
          }).join('')}
        </ul>
        <p class="muted small" style="margin-top:6px">Pour résoudre : décaler une tâche dans le Gantt (bouton 📅) ou réaffecter sa machine ci-dessous.</p>
      </div>` : '';

    const tachesHTML = tachesMachine.length ? `
      <div class="field"><label>Tâches affectées (${tachesMachine.length})</label>
        <ul class="list" style="max-height:180px;overflow:auto">
          ${tachesMachine.map(t => {
            const p = DB.projet(t.projetId);
            const isConf = conflictTids.has(t.id);
            return `<li style="${isConf?'border-left:3px solid var(--danger);padding-left:8px':''}">
              <div style="flex:1">
                <strong>${t.nom}</strong> · <span class="muted small">${p?p.code:''}</span>
                ${isConf?'<span class="badge bad" style="margin-left:6px">conflit</span>':''}
                <div class="small muted">${D.fmt(t.debut)} → ${D.fmt(t.fin)}</div>
              </div>
              ${isConf ? `<button class="btn-ghost conf-gantt" data-t1="${t.id}" style="font-size:12px;padding:2px 8px" title="Ouvrir dans le Gantt">📅</button>` : ''}
            </li>`;
          }).join('')}
        </ul>
      </div>` : '';

    const body = `
      <div class="field"><label>Nom</label><input id="mf-nom" value="${m.nom||''}"></div>
      <div class="row">
        <div class="field"><label>Type</label><input id="mf-type" value="${m.type||''}" placeholder="CNC, Laser, Soudure..."></div>
        <div class="field"><label>Capacité (heures/jour)</label><input type="number" id="mf-capa" value="${m.capaciteJour||8}"></div>
      </div>
      <div class="field"><label>Lieu de production</label>
        <select id="mf-lieu">${lieuxProd.map(l=>`<option value="${l.id}" ${l.id===m.lieuId?'selected':''}>${l.nom}</option>`).join('')}</select>
      </div>
      ${conflictsHTML}
      ${tachesHTML}
    `;
    const foot = `${!isNew?'<button class="btn btn-danger" id="mf-del">Supprimer</button>':''}<span class="spacer" style="flex:1"></span>
      <button class="btn btn-secondary" id="mf-cancel">Annuler</button>
      <button class="btn" id="mf-save">${isNew?'Créer':'Enregistrer'}</button>`;
    App.openModal(isNew?'Nouvelle machine':m.nom, body, foot);

    // Navigation Gantt depuis les boutons conflit
    document.querySelectorAll('.conf-gantt').forEach(btn => {
      btn.onclick = () => {
        App.closeModal();
        App.navigateToTarget({ view: 'gantt', tacheId: btn.dataset.t1 });
      };
    });

    document.getElementById('mf-cancel').onclick = () => App.closeModal();
    document.getElementById('mf-save').onclick = () => {
      m.nom = document.getElementById('mf-nom').value.trim();
      m.type = document.getElementById('mf-type').value.trim();
      m.capaciteJour = +document.getElementById('mf-capa').value;
      m.lieuId = document.getElementById('mf-lieu').value;
      if (!m.nom || !m.type) { App.toast('Nom et type requis','error'); return; }
      if (isNew) s.machines.push(m);
      DB.save(); App.closeModal(); App.refresh();
    };
    if (!isNew) document.getElementById('mf-del').onclick = () => {
      const nbTaches = s.taches.filter(t => t.machineId === m.id).length;
      const warn = nbTaches ? ` ${nbTaches} tâche(s) perdront leur machine.` : '';
      if (!confirm('Supprimer cette machine ?' + warn)) return;
      s.machines = s.machines.filter(y => y.id !== m.id);
      s.taches.forEach(t => { if (t.machineId === m.id) t.machineId = null; });
      DB.save(); App.closeModal(); App.refresh();
    };
  },
};
