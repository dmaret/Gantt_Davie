App.views.lieux = {
  render(root) {
    const s = DB.state;
    const prod = s.lieux.filter(l => l.type === 'production');
    const sto = s.lieux.filter(l => l.type === 'stockage');
    // Group storage by etage
    const byEtage = {};
    sto.forEach(l => (byEtage[l.etage] = byEtage[l.etage] || []).push(l));

    root.innerHTML = `
      <div class="toolbar">
        <strong>Lieux</strong>
        <span class="spacer"></span>
        <button class="btn" id="l-add">+ Ajouter un lieu</button>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <h2>🏭 Lieux de production (${prod.length})</h2>
          <table class="data">
            <thead><tr><th>Nom</th><th>Étage</th><th>Capacité</th><th>Machines</th><th>Tâches en cours</th></tr></thead>
            <tbody>
              ${prod.map(l => {
                const machines = s.machines.filter(m => m.lieuId === l.id).map(m => `<span class="chip">${m.nom}</span>`).join('') || '<span class="muted small">—</span>';
                const today = D.today();
                const ts = s.taches.filter(t => t.lieuId === l.id && t.fin >= today && t.debut <= D.addDays(today,7)).length;
                return `<tr data-id="${l.id}" style="cursor:pointer"><td><strong>${l.nom}</strong></td><td>${l.etage}</td><td>${l.capacite}</td><td>${machines}</td><td>${ts}</td></tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="card">
          <h2>📦 Stockages (${sto.length}) — par étage</h2>
          <ul class="tree">
            ${Object.entries(byEtage).map(([etg, lieux]) => `
              <li><details open><summary><strong>${etg}</strong> <span class="muted small">· ${lieux.length} zones</span></summary>
                <ul class="tree">
                  ${lieux.map(l => {
                    const articles = s.stock.filter(x => x.lieuId === l.id);
                    const totalQty = articles.reduce((n,x) => n + x.quantite, 0);
                    const alerts = articles.filter(x => x.quantite < x.seuilAlerte).length;
                    return `<li data-id="${l.id}" style="cursor:pointer">
                      <strong>${l.nom}</strong>
                      <span class="muted small"> · cap. ${l.capacite} · ${articles.length} article(s) · ${totalQty} u.</span>
                      ${alerts ? `<span class="badge bad">${alerts} alerte(s)</span>` : ''}
                    </li>`;
                  }).join('')}
                </ul>
              </details></li>
            `).join('')}
          </ul>
        </div>
      </div>
    `;
    document.querySelectorAll('[data-id]').forEach(el => el.onclick = (ev) => { ev.stopPropagation(); this.openForm(el.dataset.id); });
    document.getElementById('l-add').onclick = () => this.openForm(null);
  },
  openForm(id) {
    const isNew = !id;
    const s = DB.state;
    const l = id ? DB.lieu(id) : { id: DB.uid('L'), nom:'', etage:'Rez', type:'production', capacite:10 };
    const body = `
      <div class="field"><label>Nom</label><input id="lf-nom" value="${l.nom||''}"></div>
      <div class="row">
        <div class="field"><label>Étage</label>
          <select id="lf-etage">${['Rez','S-sol','1er','2e','3e'].map(e=>`<option ${e===l.etage?'selected':''}>${e}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Type</label>
          <select id="lf-type">
            <option value="production" ${l.type==='production'?'selected':''}>Production</option>
            <option value="stockage" ${l.type==='stockage'?'selected':''}>Stockage</option>
          </select>
        </div>
        <div class="field"><label>Capacité</label><input type="number" id="lf-capa" value="${l.capacite||0}"></div>
      </div>
    `;
    const foot = `${!isNew?'<button class="btn btn-danger" id="lf-del">Supprimer</button>':''}<span class="spacer" style="flex:1"></span>
      <button class="btn btn-secondary" id="lf-cancel">Annuler</button>
      <button class="btn" id="lf-save">${isNew?'Créer':'Enregistrer'}</button>`;
    App.openModal(isNew?'Nouveau lieu':l.nom, body, foot);
    document.getElementById('lf-cancel').onclick = () => App.closeModal();
    document.getElementById('lf-save').onclick = () => {
      l.nom = document.getElementById('lf-nom').value.trim();
      l.etage = document.getElementById('lf-etage').value;
      l.type = document.getElementById('lf-type').value;
      l.capacite = +document.getElementById('lf-capa').value;
      if (!l.nom) { App.toast('Nom requis','error'); return; }
      if (isNew) s.lieux.push(l);
      DB.save(); App.closeModal(); App.refresh();
    };
    if (!isNew) document.getElementById('lf-del').onclick = () => {
      if (!confirm('Supprimer ce lieu ?')) return;
      s.lieux = s.lieux.filter(x => x.id !== l.id);
      DB.save(); App.closeModal(); App.refresh();
    };
  },
};
