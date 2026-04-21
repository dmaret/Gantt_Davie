App.views.projets = {
  render(root) {
    const s = DB.state;
    root.innerHTML = `
      <div class="toolbar">
        <strong>Projets</strong>
        <span class="spacer"></span>
        <button class="btn" id="prj-add">+ Nouveau projet</button>
      </div>
      <div class="grid grid-3">
        ${s.projets.map(p => this.renderProjectCard(p)).join('')}
      </div>
    `;
    document.getElementById('prj-add').onclick = () => this.openForm(null);
    document.querySelectorAll('.prj-card').forEach(c => c.onclick = e => {
      if (e.target.closest('.prj-report')) return;
      this.openForm(c.dataset.id);
    });
    document.querySelectorAll('.prj-report').forEach(b => b.onclick = e => {
      e.stopPropagation();
      this.exportReport(b.dataset.id);
    });
  },
  renderProjectCard(p) {
    const taches = DB.tachesDuProjet(p.id);
    const done = taches.filter(t => t.avancement === 100).length;
    const total = taches.length;
    const pct = total ? Math.round(done / total * 100) : 0;
    const jalons = taches.filter(t => t.jalon);
    const today = D.today();
    const retard = taches.some(t => t.fin < today && t.avancement < 100);
    return `
      <div class="card prj-card" data-id="${p.id}" style="cursor:pointer;border-left:4px solid ${p.couleur}">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div>
            <h3 style="margin:0">${p.code} · ${p.nom}</h3>
            <div class="muted small">${p.client} · étage ${p.etage}</div>
          </div>
          <span class="badge ${p.priorite==='haute'?'bad':p.priorite==='moyenne'?'warn':'muted'}">${p.priorite}</span>
        </div>
        <div class="small muted" style="margin-top:6px">${D.fmt(p.debut)} → ${D.fmt(p.fin)} · ${D.diffDays(p.debut,p.fin)} j</div>
        <div style="display:flex;gap:10px;align-items:center;margin-top:8px">
          <div class="bar-inline" style="flex:1;width:auto"><div class="fill" style="width:${pct}%;background:${p.couleur}"></div></div>
          <span class="small mono">${pct}%</span>
        </div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <span class="badge muted">${total} tâches</span>
          <span class="badge muted">${jalons.length} jalons</span>
          <span class="badge ${p.statut==='en-cours'?'good':'muted'}">${p.statut}</span>
          ${retard ? '<span class="badge bad">retard</span>' : ''}
          <span style="flex:1"></span>
          <button class="btn-ghost prj-report" data-id="${p.id}" title="Rapport PDF">⎙ Rapport</button>
        </div>
      </div>
    `;
  },
  exportReport(id) {
    const p = DB.projet(id);
    if (!p) return;
    const s = DB.state;
    const tasks = DB.tachesDuProjet(id).slice().sort((a,b) => a.debut.localeCompare(b.debut));
    const done = tasks.filter(t => t.avancement === 100).length;
    const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    const pr = App.predictProjectEnd(id);
    const cmds = s.commandes.filter(c => c.projetId === id);
    const htTotal = cmds.reduce((n,c) => n + (c.montantHT||0), 0);
    const ttcTotal = cmds.reduce((n,c) => n + Money.ttc(c.montantHT||0, c.tauxTVA||8.1), 0);
    const bom = p.bom || [];
    const today = D.today();

    // Gantt simplifié : barres horizontales à l'échelle temporelle
    const tmin = tasks.reduce((m,t) => t.debut < m ? t.debut : m, p.debut);
    const tmax = tasks.reduce((m,t) => t.fin > m ? t.fin : m, p.fin);
    const totalDays = Math.max(1, D.diffDays(tmin, tmax));
    const barsHtml = tasks.map(t => {
      const off = D.diffDays(tmin, t.debut) / totalDays * 100;
      const w = Math.max(1, D.diffDays(t.debut, t.fin) / totalDays * 100);
      const color = t.jalon ? '#000' : p.couleur;
      return `<tr>
        <td style="width:180px">${t.nom}${t.jalon?' ◆':''}</td>
        <td style="width:110px">${D.fmt(t.debut)} → ${D.fmt(t.fin)}</td>
        <td style="width:50px;text-align:right">${t.avancement||0}%</td>
        <td style="position:relative;background:#f6f6f6;height:14px;border-radius:3px">
          <div style="position:absolute;left:${off}%;width:${w}%;top:1px;bottom:1px;background:${color};border-radius:3px;opacity:.85"></div>
        </td>
      </tr>`;
    }).join('');

    const bomHtml = bom.length ? `
      <h2>Bill of Materials</h2>
      <table class="data">
        <thead><tr><th>Article</th><th class="right">Besoin</th><th class="right">Stock</th><th>Statut</th></tr></thead>
        <tbody>${bom.map(l => {
          const art = DB.stock(l.articleId);
          if (!art) return '';
          const manque = l.quantite - art.quantite;
          return `<tr><td>${art.ref} — ${art.nom}</td><td class="right">${l.quantite} ${art.unite}</td><td class="right">${art.quantite}</td><td>${manque>0?`<span style="color:#c43b3b">rupture -${manque}</span>`:'OK'}</td></tr>`;
        }).join('')}</tbody>
      </table>` : '';

    const cmdHtml = cmds.length ? `
      <h2>Commandes (${cmds.length})</h2>
      <table class="data">
        <thead><tr><th>Réf</th><th>Fournisseur</th><th class="right">HT</th><th class="right">TTC</th><th>Statut</th></tr></thead>
        <tbody>${cmds.map(c => `<tr><td>${c.ref}</td><td>${c.fournisseur}</td><td class="right">${Money.chf(c.montantHT||0)}</td><td class="right">${Money.chf(Money.ttc(c.montantHT||0, c.tauxTVA||8.1))}</td><td>${c.statut}</td></tr>`).join('')}
        <tr><td colspan="2"><strong>Total</strong></td><td class="right"><strong>${Money.chf(htTotal)}</strong></td><td class="right"><strong>${Money.chf(ttcTotal)}</strong></td><td></td></tr>
        </tbody>
      </table>` : '';

    const predHtml = pr && pr.predEnd ? `
      <p><strong>Fin planifiée :</strong> ${D.fmt(p.fin)} · <strong>Fin prédite :</strong> ${D.fmt(pr.predEnd)}
      <span style="color:${pr.delayDays>=3?'#c43b3b':pr.delayDays>=1?'#c47800':'#1f8a4c'}">(${pr.delayDays>0?'+':''}${pr.delayDays} j · vitesse ${pr.vitesse}×)</span></p>` : '';

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Rapport ${p.code}</title>
      <style>
        body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 24px; color: #222; }
        h1 { border-bottom: 3px solid ${p.couleur}; padding-bottom: 6px; margin: 0 0 8px 0; }
        h2 { margin-top: 20px; color: ${p.couleur}; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        table.data { width: 100%; border-collapse: collapse; font-size: 12px; }
        table.data th, table.data td { border-bottom: 1px solid #eee; padding: 4px 6px; text-align: left; }
        table.data th { background: #f6f6f6; }
        .right { text-align: right; }
        .kpis { display: flex; gap: 14px; margin: 12px 0 4px 0; }
        .kpi { flex: 1; background: #f6f6f6; padding: 10px; border-radius: 6px; border-left: 4px solid ${p.couleur}; }
        .kpi .label { font-size: 10px; color: #777; text-transform: uppercase; }
        .kpi .value { font-size: 22px; font-weight: 600; }
        .small { font-size: 11px; color: #666; }
        .footer { margin-top: 24px; color: #888; font-size: 10px; text-align: center; border-top: 1px solid #ddd; padding-top: 6px; }
        @media print { @page { size: A4 landscape; margin: 12mm; } body { margin: 0; } }
      </style></head><body>
      <h1>${p.code} — ${p.nom}</h1>
      <p class="small">Client : <strong>${p.client||'—'}</strong> · Étage ${p.etage} · Priorité ${p.priorite} · Statut ${p.statut}</p>
      <div class="kpis">
        <div class="kpi"><div class="label">Avancement</div><div class="value">${pct} %</div></div>
        <div class="kpi"><div class="label">Tâches</div><div class="value">${tasks.length}</div></div>
        <div class="kpi"><div class="label">Budget HT</div><div class="value">${Money.chf(htTotal)}</div></div>
        <div class="kpi"><div class="label">Budget TTC</div><div class="value">${Money.chf(ttcTotal)}</div></div>
      </div>
      ${predHtml}
      <h2>Planning</h2>
      <table class="data">${barsHtml}</table>
      ${bomHtml}
      ${cmdHtml}
      <div class="footer">Généré le ${D.fmt(today)} par ${App.currentUser().nom} · Atelier · Planification</div>
      <script>setTimeout(() => window.print(), 400);</script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { App.toast('Pop-up bloqué — autoriser les pop-ups','error'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  },
  openForm(id) {
    const isNew = !id;
    const s = DB.state;
    const p = id ? DB.projet(id) : {
      id: DB.uid('PRJ'), code:'PRJ-'+ (s.projets.length+1), nom:'', client:'', couleur:'#2c5fb3',
      debut:D.today(), fin:D.addDays(D.today(),30), etage:'1er', priorite:'moyenne', statut:'planifié'
    };
    const taches = id ? DB.tachesDuProjet(id) : [];
    const body = `
      <div class="row">
        <div class="field"><label>Code</label><input id="pf-code" value="${p.code||''}"></div>
        <div class="field"><label>Couleur</label><input type="color" id="pf-color" value="${p.couleur}"></div>
      </div>
      <div class="field"><label>Nom</label><input id="pf-nom" value="${p.nom||''}"></div>
      <div class="row">
        <div class="field"><label>Client</label><input id="pf-client" value="${p.client||''}"></div>
        <div class="field"><label>Étage</label>
          <select id="pf-etage">${['Rez','S-sol','1er','2e','3e'].map(e=>`<option ${e===p.etage?'selected':''}>${e}</option>`).join('')}</select>
        </div>
      </div>
      <div class="row">
        <div class="field"><label>Début</label><input type="date" id="pf-debut" value="${p.debut}"></div>
        <div class="field"><label>Fin</label><input type="date" id="pf-fin" value="${p.fin}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Priorité</label>
          <select id="pf-prio">${['basse','moyenne','haute'].map(x=>`<option ${x===p.priorite?'selected':''}>${x}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Statut</label>
          <select id="pf-statut">${['planifié','en-cours','suspendu','clos'].map(x=>`<option ${x===p.statut?'selected':''}>${x}</option>`).join('')}</select>
        </div>
      </div>
      ${!isNew ? `
        <h3 style="margin-top:14px">Tâches du projet (${taches.length})</h3>
        <ul class="list">
          ${taches.sort((a,b)=>a.debut.localeCompare(b.debut)).map(t => `
            <li>
              <div>
                <strong>${t.nom}</strong> ${t.jalon?'<span class="badge">jalon</span>':''}
                <div class="small muted">${D.fmt(t.debut)} → ${D.fmt(t.fin)} · ${(t.assignes||[]).length} personne(s) · ${t.avancement}%</div>
              </div>
              <span class="badge muted">${t.type}</span>
            </li>`).join('')}
        </ul>
      ` : ''}
    `;
    const foot = `${!isNew?'<button class="btn btn-danger" id="pf-del">Supprimer</button>':''}<span class="spacer" style="flex:1"></span>
      <button class="btn btn-secondary" id="pf-cancel">Annuler</button>
      <button class="btn" id="pf-save">${isNew?'Créer':'Enregistrer'}</button>`;
    App.openModal(isNew?'Nouveau projet':p.code+' — '+p.nom, body, foot);
    document.getElementById('pf-cancel').onclick = () => App.closeModal();
    document.getElementById('pf-save').onclick = () => {
      p.code = document.getElementById('pf-code').value.trim();
      p.nom = document.getElementById('pf-nom').value.trim();
      p.client = document.getElementById('pf-client').value.trim();
      p.couleur = document.getElementById('pf-color').value;
      p.etage = document.getElementById('pf-etage').value;
      p.debut = document.getElementById('pf-debut').value;
      p.fin = document.getElementById('pf-fin').value;
      p.priorite = document.getElementById('pf-prio').value;
      p.statut = document.getElementById('pf-statut').value;
      if (!p.nom || !p.code) { App.toast('Code et nom requis','error'); return; }
      if (isNew) s.projets.push(p);
      DB.save(); App.closeModal(); App.refresh();
    };
    if (!isNew) document.getElementById('pf-del').onclick = () => {
      if (!confirm('Supprimer ce projet et toutes ses tâches ?')) return;
      s.projets = s.projets.filter(x => x.id !== p.id);
      s.taches = s.taches.filter(t => t.projetId !== p.id);
      DB.save(); App.closeModal(); App.refresh();
    };
  },
};
