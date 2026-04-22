App.views.bom = {
  state: { projetFilter:'', onlyRupture:false },
  render(root) {
    const s = DB.state;
    // Garantir que chaque projet a un tableau bom
    s.projets.forEach(p => { if (!p.bom) p.bom = this.seedBom(p); });
    root.innerHTML = `
      <div class="toolbar">
        <strong>Nomenclatures (BOM)</strong>
        <select id="b-prj"><option value="">Tous projets</option>${s.projets.map(p=>`<option value="${p.id}">${p.code}</option>`).join('')}</select>
        <label class="small"><input type="checkbox" id="b-rup"> Seulement ruptures prévues</label>
        <span class="spacer"></span>
        <button class="btn-ghost" id="b-csv">⤓ Exporter CSV</button>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <h2>Besoins par projet</h2>
          <div id="b-projets"></div>
        </div>
        <div class="card">
          <h2>Articles : stock vs. besoins</h2>
          <div id="b-articles"></div>
        </div>
      </div>
    `;
    document.getElementById('b-prj').onchange = e => { this.state.projetFilter = e.target.value; this.draw(); };
    document.getElementById('b-rup').onchange = e => { this.state.onlyRupture = e.target.checked; this.draw(); };
    document.getElementById('b-csv').onclick = () => this.exportCSV();
    this.draw();
  },
  seedBom(prj) {
    // Heuristique simple: articles liés à ce projet dans le stock, qté = 10% du seuil * 5
    return DB.state.stock.filter(x => (x.projetsLies||[]).includes(prj.id))
      .map(x => ({ articleId: x.id, quantite: Math.max(1, Math.round(x.seuilAlerte * 0.5)) }));
  },
  totalBesoin(articleId) {
    // Somme des quantités dans tous les BOM, pondérée par le statut du projet
    let total = 0;
    DB.state.projets.forEach(p => {
      if (p.statut === 'annulé' || p.statut === 'terminé') return;
      (p.bom || []).forEach(l => { if (l.articleId === articleId) total += l.quantite; });
    });
    return total;
  },
  enCommande(articleId) {
    // Articles en commande non encore engagée qui vont réapprovisionner
    let total = 0;
    DB.state.commandes.forEach(c => {
      if (c.statut === 'engagée') return; // déjà pris en compte une fois livré
      (c.lignes || []).forEach(l => { if (l.articleId === articleId) total += l.qte; });
    });
    return total;
  },
  draw() {
    const st = this.state, s = DB.state;

    // Panneau gauche: projets → articles nécessaires
    const prjList = st.projetFilter ? s.projets.filter(p => p.id === st.projetFilter) : s.projets;
    const prjHtml = prjList.map(p => {
      const bom = p.bom || [];
      const canEdit = App.can('edit');
      const rows = bom.map(l => {
        const art = DB.stock(l.articleId);
        if (!art) return '';
        const rupture = art.quantite < l.quantite;
        const qteCell = canEdit
          ? `<input type="number" class="inline-edit" data-bom-qte="${p.id}:${l.articleId}" min="0" step="1" value="${l.quantite}"> <span class="muted small">${art.unite}</span>`
          : `${l.quantite} ${art.unite}`;
        return `<tr>
          <td class="mono">${art.ref}</td>
          <td>${art.nom}</td>
          <td class="right">${qteCell}</td>
          <td class="right ${rupture?'':'muted'}">${art.quantite} ${art.unite}</td>
          <td>${rupture?'<span class="badge bad">manque</span>':'<span class="badge good">OK</span>'}</td>
          <td>${canEdit ? `<button class="btn-ghost" data-rm="${p.id}:${l.articleId}" style="padding:2px 8px">✕</button>` : ''}</td>
        </tr>`;
      }).join('');
      return `<div style="margin-bottom:14px">
        <h3 style="display:flex;align-items:center;gap:8px;margin:0 0 6px 0">
          <span class="badge" style="background:${p.couleur}22;color:${p.couleur}">${p.code}</span> ${p.nom}
          <button class="btn-ghost" data-add-bom="${p.id}" style="padding:2px 10px;margin-left:auto">+ Article</button>
        </h3>
        ${bom.length ? `<table class="data"><thead><tr><th>Réf</th><th>Article</th><th class="right">Besoin</th><th class="right">Stock</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted small">Aucune ligne. Cliquer « + Article » pour ajouter.</p>'}
      </div>`;
    }).join('');
    document.getElementById('b-projets').innerHTML = prjHtml;

    // Panneau droit: articles avec besoins totaux
    let arts = s.stock.slice();
    arts = arts.map(a => {
      const besoin = this.totalBesoin(a.id);
      const cmd = this.enCommande(a.id);
      const dispo = a.quantite + cmd;
      const deficit = besoin - dispo;
      return { ...a, besoin, cmd, dispo, deficit };
    }).filter(a => a.besoin > 0);
    if (st.onlyRupture) arts = arts.filter(a => a.deficit > 0);
    arts.sort((a,b) => b.deficit - a.deficit);
    const artHtml = `<table class="data">
      <thead><tr><th>Réf</th><th>Article</th><th class="right">Stock</th><th class="right">En cmd</th><th class="right">Besoin</th><th class="right">Solde</th><th>Statut</th></tr></thead>
      <tbody>${arts.map(a => {
        const cls = a.deficit > 0 ? 'bad' : a.deficit > -5 ? 'warn' : 'good';
        const statut = a.deficit > 0 ? `<span class="badge bad">manque ${a.deficit}</span>` : a.deficit > -5 ? `<span class="badge warn">tendu</span>` : `<span class="badge good">OK</span>`;
        return `<tr>
          <td class="mono">${a.ref}</td>
          <td>${a.nom}</td>
          <td class="right">${a.quantite}</td>
          <td class="right muted">${a.cmd||'—'}</td>
          <td class="right">${a.besoin}</td>
          <td class="right"><strong class="${cls==='bad'?'':cls}">${-a.deficit}</strong></td>
          <td>${statut}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>${arts.length===0 ? '<p class="muted">Aucun besoin.</p>' : ''}`;
    document.getElementById('b-articles').innerHTML = artHtml;

    document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      const [pid, aid] = b.dataset.rm.split(':');
      const p = DB.projet(pid);
      p.bom = (p.bom||[]).filter(l => l.articleId !== aid);
      DB.save(); this.draw();
    });
    document.querySelectorAll('[data-add-bom]').forEach(b => b.onclick = () => this.addLigne(b.dataset.addBom));
    // Édition inline de la quantité BOM
    document.querySelectorAll('[data-bom-qte]').forEach(inp => {
      const commit = () => {
        const [pid, aid] = inp.dataset.bomQte.split(':');
        const p = DB.projet(pid);
        const line = (p.bom||[]).find(l => l.articleId === aid);
        if (!line) return;
        const v = +inp.value;
        if (v <= 0) {
          if (confirm('Quantité 0 → supprimer la ligne ?')) {
            p.bom = p.bom.filter(l => l.articleId !== aid);
            DB.save(); this.draw();
          } else {
            inp.value = line.quantite;
          }
          return;
        }
        if (line.quantite !== v) {
          line.quantite = v;
          DB.save();
          this.draw();
          App.toast('Quantité mise à jour', 'success');
        }
      };
      inp.onblur = commit;
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } };
    });
  },
  addLigne(projetId) {
    const p = DB.projet(projetId);
    const s = DB.state;
    const body = `
      <div class="field"><label>Article</label>
        <select id="bf-art">${s.stock.map(x => `<option value="${x.id}">${x.ref} — ${x.nom} (${x.quantite} ${x.unite} dispo)</option>`).join('')}</select>
      </div>
      <div class="field"><label>Quantité requise</label><input type="number" id="bf-qte" min="1" value="1"></div>
    `;
    App.openModal(`BOM · ${p.code}`, body, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Annuler</button>
      <button class="btn" id="bf-save">Ajouter</button>
    `);
    document.getElementById('bf-save').onclick = () => {
      const aid = document.getElementById('bf-art').value;
      const qte = +document.getElementById('bf-qte').value;
      if (!qte) { App.toast('Quantité invalide','error'); return; }
      p.bom = p.bom || [];
      const existing = p.bom.find(l => l.articleId === aid);
      if (existing) existing.quantite += qte; else p.bom.push({ articleId: aid, quantite: qte });
      DB.save(); App.closeModal(); this.draw();
    };
  },
  exportCSV() {
    const s = DB.state;
    const rows = [['Projet','Code','Réf article','Article','Besoin','Stock','Solde']];
    s.projets.forEach(p => (p.bom||[]).forEach(l => {
      const a = DB.stock(l.articleId);
      if (!a) return;
      rows.push([p.code, p.nom, a.ref, a.nom, l.quantite, a.quantite, a.quantite - l.quantite]);
    }));
    CSV.download('bom-' + D.today() + '.csv', rows);
    App.toast('Export CSV téléchargé','success');
  },
};
