App.views.stock = {
  state: { search:'', lieuFilter:'', projetFilter:'', onlyAlert:false, limit:100 },
  render(root) {
    const s = DB.state;
    root.innerHTML = `
      <div class="toolbar">
        <input type="search" id="st-search" placeholder="Rechercher référence, nom...">
        <select id="st-lieu"><option value="">Tous stockages</option>${s.lieux.filter(l=>l.type==='stockage').map(l=>`<option value="${l.id}">${l.nom}</option>`).join('')}</select>
        <select id="st-proj"><option value="">Tous projets liés</option>${s.projets.map(p=>`<option value="${p.id}">${p.code}</option>`).join('')}</select>
        <label class="small"><input type="checkbox" id="st-alert"> Seulement alertes</label>
        <span class="spacer"></span>
        <input type="file" id="st-import-file" accept=".csv,.json" hidden>
        <button class="btn-ghost" id="st-tpl" data-perm="admin" title="Télécharger le modèle CSV">⬇ Modèle</button>
        <button class="btn-ghost" id="st-import" data-perm="admin" title="Importer articles depuis CSV/JSON">⬆ Importer</button>
        <button class="btn-ghost" id="st-csv">⤓ Exporter CSV</button>
        <button class="btn" id="st-add">+ Ajouter un article</button>
      </div>
      <div class="card"><div id="st-table"></div></div>
    `;
    document.getElementById('st-search').oninput = e => { this.state.search = e.target.value.toLowerCase(); this.state.limit = 100; this.draw(); };
    document.getElementById('st-lieu').onchange = e => { this.state.lieuFilter = e.target.value; this.draw(); };
    document.getElementById('st-proj').onchange = e => { this.state.projetFilter = e.target.value; this.draw(); };
    document.getElementById('st-alert').onchange = e => { this.state.onlyAlert = e.target.checked; this.draw(); };
    document.getElementById('st-add').onclick = () => this.openForm(null);
    document.getElementById('st-tpl').onclick = () => this.downloadTemplate();
    document.getElementById('st-import').onclick = () => document.getElementById('st-import-file').click();
    document.getElementById('st-import-file').onchange = e => { if (e.target.files[0]) this.importFile(e.target.files[0]); e.target.value = ''; };
    document.getElementById('st-csv').onclick = () => {
      const head = ['Référence','Nom','Unité','Quantité','Seuil alerte','Lieu de stockage','Sous seuil','Projets liés'];
      const rows = [head];
      DB.state.stock.forEach(x => {
        const lieu = DB.lieu(x.lieuId);
        const projs = (x.projetsLies||[]).map(pid => (DB.projet(pid)||{}).code || '').join(', ');
        rows.push([x.ref, x.nom, x.unite, x.quantite, x.seuilAlerte, lieu?lieu.nom:'', x.quantite<x.seuilAlerte?'OUI':'', projs]);
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
    const total = list.length;
    const hasMore = total > this.state.limit;
    list = list.slice(0, this.state.limit);
    const rows = list.map(x => {
      const pct = x.seuilAlerte ? Math.min(100, Math.round(x.quantite / (x.seuilAlerte*2) * 100)) : 100;
      const cls = x.quantite < x.seuilAlerte ? 'bad' : x.quantite < x.seuilAlerte*1.3 ? 'warn' : '';
      const badge = x.quantite < x.seuilAlerte ? '<span class="badge bad">alerte</span>' : '';
      const projs = (x.projetsLies||[]).map(pid => {
        const p = DB.projet(pid); return p ? `<span class="chip" style="background:${App.safeColor(p.couleur)}22;color:${App.safeColor(p.couleur)}">${App.escapeHTML(p.code)}</span>` : '';
      }).join('');
      const lieu = DB.lieu(x.lieuId);
      const qteCell = canEdit
        ? `<input type="number" class="inline-edit" data-stock-qte="${x.id}" value="${x.quantite}" step="1"> <span class="muted small">${x.unite}</span>`
        : `${x.quantite} ${x.unite}`;
      return `<tr data-id="${x.id}">
        <td class="mono st-open">${App.escapeHTML(x.ref)}</td>
        <td class="st-open"><strong>${App.escapeHTML(x.nom)}</strong> ${badge}</td>
        <td class="st-open">${lieu?App.escapeHTML(lieu.nom):'—'}</td>
        <td class="right">${qteCell}</td>
        <td class="right st-open">${x.seuilAlerte}</td>
        <td class="st-open"><div class="bar-inline ${cls}"><div class="fill" style="width:${pct}%"></div></div></td>
        <td class="st-open">${projs || '<span class="muted small">—</span>'}</td>
      </tr>`;
    }).join('');
    document.getElementById('st-table').innerHTML = `
      <div class="tbl-wrap"><table class="data col-freeze-1">
        <thead><tr><th>Réf</th><th>Article</th><th>Stockage</th><th class="right">Qté</th><th class="right">Seuil</th><th>Niveau</th><th>Projets liés</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="muted small" style="margin-top:10px">${list.length} article(s) affiché(s) sur ${total}${hasMore ? ` — <button id="st-show-more" class="btn-ghost small">Voir ${Math.min(100, total - this.state.limit)} de plus</button>` : ''}</p>
    `;
    if (hasMore) document.getElementById('st-show-more').onclick = () => { this.state.limit += 100; this.draw(); };
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
        <div class="field"><label>Référence</label><input id="xf-ref" value="${App.escapeHTML(x.ref||'')}"></div>
        <div class="field"><label>Unité</label><input id="xf-unite" value="${App.escapeHTML(x.unite||'p')}"></div>
      </div>
      <div class="field"><label>Nom</label><input id="xf-nom" value="${App.escapeHTML(x.nom||'')}"></div>
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
    App.openModal(isNew?'Nouvel article':App.escapeHTML(x.ref)+' — '+App.escapeHTML(x.nom), body, foot);
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

  downloadTemplate() {
    CSV.download('modele-import-stock.csv', [
      ['Référence','Nom','Unité','Quantité','Seuil alerte','Lieu de stockage'],
      ['ACI-3mm','Tôle acier 3mm','pl','50','20','1er · Matières'],
    ]);
  },

  importFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        let text = e.target.result;
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const isJson = file.name.endsWith('.json');
        if (isJson) { this.previewImport(JSON.parse(text)); return; }
        const sep = text.includes(';') ? ';' : ',';
        const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const hdrs = lines[0].split(sep).map(h => norm(h.replace(/^"|"$/g,'')));
        const rows = lines.slice(1).map(l => {
          const v = l.split(sep).map(c => c.trim().replace(/^"|"$/g,''));
          const o = {}; hdrs.forEach((h,i) => o[h] = v[i]||''); return o;
        }).filter(r => Object.values(r).some(v => v));
        this.previewImport(rows);
      } catch(err) { App.toast('Erreur lecture : ' + err.message, 'error'); }
    };
    reader.readAsText(file, 'UTF-8');
  },

  previewImport(rows) {
    const s = DB.state;
    const norm = s => (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
    const parsed = rows.map(r => {
      const ref = r['reference'] || r['ref'] || r['référence'] || '';
      const nom = r['nom'] || r['article'] || '';
      const unite = r['unite'] || r['unité'] || r['unit'] || 'p';
      const qte = parseFloat(r['quantite'] || r['quantité'] || r['qty'] || 0);
      const seuil = parseFloat(r['seuil alerte'] || r['seuil'] || r['seuilalerte'] || 0);
      const lieuNom = norm(r['lieu de stockage'] || r['lieu'] || r['stockage'] || '');
      const lieu = s.lieux.find(l => l.type === 'stockage' && norm(l.nom) === lieuNom);
      const existing = s.stock.find(x => x.ref === ref);
      return { ref, nom, unite, qte, seuil, lieuId: lieu?.id || null, lieuNom, existing };
    }).filter(r => r.ref || r.nom);
    if (!parsed.length) { App.toast('Aucun article à importer','warn'); return; }
    const creates = parsed.filter(r => !r.existing).length;
    const updates = parsed.filter(r => r.existing).length;
    const body = `<p class="muted small">${creates} à créer · ${updates} à mettre à jour</p>
      <table class="data"><thead><tr><th>Réf</th><th>Nom</th><th>Qté</th><th>Seuil</th><th>Lieu</th><th>Statut</th></tr></thead><tbody>
      ${parsed.map(r => `<tr>
        <td class="mono">${App.escapeHTML(r.ref)}</td><td>${App.escapeHTML(r.nom)}</td><td>${r.qte}</td><td>${r.seuil}</td>
        <td class="${r.lieuId?'':'warn'}">${App.escapeHTML(r.lieuNom||'—')}${r.lieuId?'':' ⚠'}</td>
        <td><span class="badge ${r.existing?'warn':'good'}">${r.existing?'màj':'nouveau'}</span></td>
      </tr>`).join('')}
      </tbody></table>`;
    const foot = `<button class="btn btn-secondary" onclick="App.closeModal()">Annuler</button>
      <button class="btn" id="st-import-ok">Importer (${parsed.length})</button>`;
    App.openModal('Aperçu import — Stock', body, foot);
    document.getElementById('st-import-ok').onclick = () => {
      let created = 0, updated = 0;
      parsed.forEach(r => {
        if (r.existing) {
          r.existing.nom = r.nom || r.existing.nom;
          r.existing.unite = r.unite || r.existing.unite;
          if (r.qte) r.existing.quantite = r.qte;
          if (r.seuil) r.existing.seuilAlerte = r.seuil;
          if (r.lieuId) r.existing.lieuId = r.lieuId;
          DB.logAudit('update','stock',r.existing.id,r.existing.ref+' (import)');
          updated++;
        } else {
          const art = { id: DB.uid('ART'), ref: r.ref, nom: r.nom, unite: r.unite, quantite: r.qte, seuilAlerte: r.seuil, lieuId: r.lieuId||s.lieux.find(l=>l.type==='stockage')?.id, projetsLies:[] };
          s.stock.push(art);
          DB.logAudit('create','stock',art.id,art.ref+' (import)');
          created++;
        }
      });
      DB.save(); App.closeModal(); App.refresh();
      App.toast(`${created} créé(s) · ${updated} mis à jour`, 'success');
    };
  },
};
