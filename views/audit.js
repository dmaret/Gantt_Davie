// Vue Historique / Journal d'audit
App.views.audit = {
  state: { filterEntity:'', filterAction:'', filterUser:'', q:'' },

  render(root) {
    const s = DB.state;
    const entries = (s.audit||[]).slice().reverse();
    const st = this.state;
    const entities = [...new Set(entries.map(e => e.entity))].sort();
    const actions = [...new Set(entries.map(e => e.action))].sort();
    const users = [...new Set(entries.map(e => e.userNom))].sort();
    let list = entries;
    if (st.filterEntity) list = list.filter(e => e.entity === st.filterEntity);
    if (st.filterAction) list = list.filter(e => e.action === st.filterAction);
    if (st.filterUser)   list = list.filter(e => e.userNom === st.filterUser);
    if (st.q) {
      const q = st.q.toLowerCase();
      list = list.filter(e => (e.details||'').toLowerCase().includes(q) || (e.entityId||'').toLowerCase().includes(q));
    }
    const badgeCol = (action) => action==='create'?'good':action==='delete'?'bad':action==='update'?'warn':'muted';
    root.innerHTML = `
      <div class="toolbar">
        <strong>📜 Historique des modifications</strong>
        <span class="muted small">${entries.length} action(s) archivée(s) · max 500</span>
        <span class="spacer"></span>
        <input id="au-q" placeholder="Recherche…" value="${st.q||''}">
        <select id="au-entity"><option value="">Tous types</option>${entities.map(e => `<option ${e===st.filterEntity?'selected':''}>${e}</option>`).join('')}</select>
        <select id="au-action"><option value="">Toutes actions</option>${actions.map(a => `<option ${a===st.filterAction?'selected':''}>${a}</option>`).join('')}</select>
        <select id="au-user"><option value="">Tous users</option>${users.map(u => `<option ${u===st.filterUser?'selected':''}>${u}</option>`).join('')}</select>
        ${App.can('admin') ? '<button class="btn-ghost" id="au-clear" title="Purger l\'historique">🗑 Purger</button>' : ''}
      </div>
      <div class="card">
        ${list.length ? `
          <div class="tbl-wrap"><table class="data col-freeze-1">
            <thead><tr><th>Horodatage</th><th>Utilisateur</th><th>Action</th><th>Type</th><th>Détails</th><th>ID</th></tr></thead>
            <tbody>${list.slice(0, 300).map(e => `
              <tr>
                <td class="mono small">${this.fmtTs(e.ts)}</td>
                <td>${e.userNom || '?'}</td>
                <td><span class="badge ${badgeCol(e.action)}">${e.action}</span></td>
                <td><span class="badge muted">${e.entity}</span></td>
                <td>${e.details||'—'}</td>
                <td class="mono small muted">${e.entityId||''}</td>
              </tr>`).join('')}</tbody>
          </table></div>
          ${list.length > 300 ? `<p class="muted small" style="margin-top:8px">Affichage limité aux 300 dernières entrées (filtré).</p>` : ''}
        ` : '<p class="muted">Aucune action enregistrée avec ces filtres.</p>'}
      </div>
    `;
    document.getElementById('au-q').oninput = (e) => { st.q = e.target.value; App.refresh(); };
    document.getElementById('au-entity').onchange = (e) => { st.filterEntity = e.target.value; App.refresh(); };
    document.getElementById('au-action').onchange = (e) => { st.filterAction = e.target.value; App.refresh(); };
    document.getElementById('au-user').onchange = (e) => { st.filterUser = e.target.value; App.refresh(); };
    const clearBtn = document.getElementById('au-clear');
    if (clearBtn) clearBtn.onclick = () => {
      if (!confirm('Purger tout l\'historique ? Action irréversible.')) return;
      DB.state.audit = [];
      DB.save(); App.refresh(); App.toast('Historique purgé','info');
    };
  },

  fmtTs(iso) {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2,'0');
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  },
};
