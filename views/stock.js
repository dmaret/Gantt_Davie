App.views.stock = {
  state: { search:'', lieuFilter:'', projetFilter:'', onlyAlert:false },
  render(root) {
    const s = DB.state;
    root.innerHTML = `
      <div class="toolbar">
        <input type="search" id="st-search" placeholder="Rechercher référence, nom...">
        <select id="st-lieu"><option value="">Tous stockages</option>${s.lieux.filter(l=>l.type==='stockage').map(l=>`<option value="${l.id}">${l.nom}</option>`).join('')}</select>
        <select id="st-proj"><option value="">Tous projets liés</option>${s.projets.map(p=>`<option value="${p.id}">${p.code}</option>`).join('')}</select>
        <label class="small"><input type="checkbox" id="st-alert"> Seulement alertes</label>
        <span class="spacer"></span>
        <button class="btn-ghost" id="st-csv">⤓ Exporter CSV</button>
        <button class="btn" id="st-add">+ Ajouter un article</button>
      </div>
      <div class="card"><div id="st-table"></div></div>
    `;
    document.getElementById('st-search').oninput = e => { this.state.search = e.target.value.toLowerCase(); this.draw(); };
    document.getElementById('st-lieu').onchange = e => { this.state.lieuFilter = e.target.value; this.draw(); };
    document.getElementById('st-proj').onchange = e => { this.state.projetFilter = e.target.value; this.draw(); };
    document.getElementById('st-alert').onchange = e => { this.state.onlyAlert = e.target.checked; this.draw(); };
    document.getElementById('st-add').onclick = () => this.openForm(null);
    document.getElementById('st-csv').onclick = () => {
      const head = ['Référence','Article','Stockage','Quantité','Unité','Seuil alerte','Sous seuil','Projets liés'];
      const rows = [head];
      DB.state.stock.forEach(x => {
        const lieu = DB.lieu(x.lieuId);
        const projs = (x.projetsLies||[]).map(pid => (DB.projet(pid)||{}).code || '').join(', ');
        rows.push([x.ref, x.nom, lieu?lieu.nom:'', x.quantite, x.unite, x.seuilAlerte, x.quantite<x.seuilAlerte?'OUI':'', projs]);
      });
      CSV.download('stock-' + D.today() + '.csv', rows);
      App.toast('Export CSV téléchargé','success');
    };
    this.draw();
  },
  draw() {
    const st = this.state, s = DB.state;
    let list = s.stock.slice();
    if (st.search) list = list.filter(x => (x.ref + ' ' + x.nom).toLowerCase().includes(st.search));
    if (st.lieuFilter) list = list.filter(x => x.lieuId === st.lieuFilter);
    if (st.projetFilter) list = list.filter(x => (x.projetsLies||[]).includes(st.projetFilter));
    if (st.onlyAlert) list = list.filter(x => x.quantite < x.seuilAlerte);

    const canEdit = App.can('edit');
    const rows = list.map(x => {
      const pct = x.seuilAlerte ? Math.min(100, Math.round(x.quantite / (x.seuilAlerte*2) * 100)) : 100;
      const cls = x.quantite < x.seuilAlerte ? 'bad' : x.quantite < x.seuilAlerte*1.3 ? 'warn' : '';
      const badge = x.quantite < x.seuilAlerte ? '<span class="badge bad">alerte</span>' : '';
      const projs = (x.projetsLies||[]).map(pid => {
        const p = DB.projet(pid); return p ? `<span class="chip" style="background:${p.couleur}22;color:${p.couleur}">${p.code}</span>` : '';
      }).join('');
      const lieu = DB.lieu(x.lieuId);
      const qteCell = canEdit
        ? `<input type="number" class="inline-edit" data-stock-qte="${x.id}" value="${x.quantite}" step="1"> <span class="muted small">${x.unite}</span>`
        : `${x.quantite} ${x.unite}`;
      return `<tr data-id="${x.id}">
        <td class="mono st-open">${x.ref}</td>
        <td class="st-open"><strong>${x.nom}</strong> ${badge}</td>
        <td class="st-open">${lieu?lieu.nom:'—'}</td>
        <td class="right">${qteCell}</td>
        <td class="right st-open">${x.seuilAlerte}</td>
        <td class="st-open"><div class="bar-inline ${cls}"><div class="fill" style="width:${pct}%"></div></div></td>
        <td class="st-open">${projs || '<span class="muted small">—</span>'}</td>
      </tr>`;
    }).join('');
    document.getElementById('st-table').innerHTML = `
      <table class="data">
        <thead><tr><th>Réf</th><th>Article</th><th>Stockage</th><th class="right">Qté</th><th class="right">Seuil</th><th>Niveau</th><th>Projets liés</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="muted small" style="margin-top:10px">${list.length} article(s)</p>
    `;
    document.querySelectorAll('#st-table tbody td.st-open').forEach(td => td.style.cursor = 'pointer');
    document.querySelectorAll('#st-table tbody td.st-open').forEach(td => td.onclick = () => this.openForm(td.closest('tr').dataset.id));
    document.querySelectorAll('[data-stock-qte]').forEach(inp => {
      const commit = () => {
        const art = DB.stock(inp.dataset.stockQte);
        if (!art) return;
        const v = +inp.value;
        if (art.quantite !== v) {
          art.quantite = v;
          DB.save();
          this.draw();
          App.toast('Stock mis à jour', 'success');
        }
      };
      inp.onblur = commit;
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } };
      inp.onclick = e => e.stopPropagation();
    });
  },
  openForm(id) {
    const isNew = !id;
    const s = DB.state;
    const x = id ? DB.stock(id) : { id: DB.uid('ART'), ref:'', nom:'', unite:'p', quantite:0, seuilAlerte:0, lieuId: s.lieux.find(l=>l.type==='stockage').id, projetsLies:[] };
    const body = `
      <div class="row">
        <div class="field"><label>Référence</label><input id="xf-ref" value="${x.ref||''}"></div>
        <div class="field"><label>Unité</label><input id="xf-unite" value="${x.unite||'p'}"></div>
      </div>
      <div class="field"><label>Nom</label><input id="xf-nom" value="${x.nom||''}"></div>
      <div class="row">
        <div class="field"><label>Quantité</label><input type="number" id="xf-qte" value="${x.quantite||0}"></div>
        <div class="field"><label>Seuil alerte</label><input type="number" id="xf-seuil" value="${x.seuilAlerte||0}"></div>
      </div>
      <div class="field"><label>Stockage</label>
        <select id="xf-lieu">${s.lieux.filter(l=>l.type==='stockage').map(l=>`<option value="${l.id}" ${l.id===x.lieuId?'selected':''}>${l.nom}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Projets liés</label>
        <select id="xf-projets" multiple size="5">
          ${s.projets.map(p=>`<option value="${p.id}" ${(x.projetsLies||[]).includes(p.id)?'selected':''}>${p.code} — ${p.nom}</option>`).join('')}
        </select>
      </div>
    `;
    const foot = `${!isNew?'<button class="btn btn-danger" id="xf-del">Supprimer</button>':''}<span class="spacer" style="flex:1"></span>
      <button class="btn btn-secondary" id="xf-cancel">Annuler</button>
      <button class="btn" id="xf-save">${isNew?'Créer':'Enregistrer'}</button>`;
    App.openModal(isNew?'Nouvel article':x.ref+' — '+x.nom, body, foot);
    document.getElementById('xf-cancel').onclick = () => App.closeModal();
    document.getElementById('xf-save').onclick = () => {
      x.ref = document.getElementById('xf-ref').value.trim();
      x.nom = document.getElementById('xf-nom').value.trim();
      x.unite = document.getElementById('xf-unite').value.trim();
      x.quantite = +document.getElementById('xf-qte').value;
      x.seuilAlerte = +document.getElementById('xf-seuil').value;
      x.lieuId = document.getElementById('xf-lieu').value;
      x.projetsLies = Array.from(document.getElementById('xf-projets').selectedOptions).map(o=>o.value);
      if (!x.ref || !x.nom) { App.toast('Référence et nom requis','error'); return; }
      if (isNew) s.stock.push(x);
      DB.save(); App.closeModal(); App.refresh();
    };
    if (!isNew) document.getElementById('xf-del').onclick = () => {
      if (!confirm('Supprimer cet article ?')) return;
      s.stock = s.stock.filter(y => y.id !== x.id);
      DB.save(); App.closeModal(); App.refresh();
    };
  },
};
