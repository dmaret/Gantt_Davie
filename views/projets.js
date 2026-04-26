App.views.projets = {
  render(root) {
    const s = DB.state;
    root.innerHTML = `
      <div class="toolbar">
        <strong>Projets</strong>
        <span class="spacer"></span>
        <input type="file" id="prj-import-file" accept=".csv,.json" hidden>
        <button class="btn-ghost" id="prj-tpl" data-perm="edit">⬇ Modèle</button>
        <button class="btn-ghost" id="prj-import" data-perm="edit">⬆ Importer</button>
        <button class="btn-ghost" id="prj-csv">⤓ Exporter CSV</button>
        <button class="btn" id="prj-add">+ Nouveau projet</button>
      </div>
      <div class="grid grid-3">
        ${s.projets.map(p => this.renderProjectCard(p)).join('')}
      </div>
    `;
    document.getElementById('prj-add').onclick = () => this.openForm(null);
    document.getElementById('prj-tpl').onclick = () => this.downloadTemplate();
    document.getElementById('prj-import').onclick = () => document.getElementById('prj-import-file').click();
    document.getElementById('prj-import-file').onchange = e => { if (e.target.files[0]) this.importFile(e.target.files[0]); e.target.value = ''; };
    document.getElementById('prj-csv').onclick = () => this.exportCSV();
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
          ${p.sequencementStrict ? '<span class="badge" title="Séquencement strict activé : les dates des tâches sont validées par rapport aux dépendances" style="background:#7c3aed22;color:#7c3aed;border:1px solid #7c3aed44">⛓ strict</span>' : ''}
          <span style="flex:1"></span>
          <button class="btn-ghost prj-report" data-id="${p.id}" title="Rapport PDF">⎙ Rapport</button>
        </div>
      </div>
    `;
  },
  exportCSV() {
    const s = DB.state;
    const rows = [['Code','Nom','Client','Couleur','Début','Fin','Étage','Priorité','Statut']];
    s.projets.forEach(p => rows.push([p.code, p.nom, p.client||'', p.couleur||'', p.debut, p.fin, p.etage||'', p.priorite||'', p.statut||'']));
    CSV.download('projets-' + D.today() + '.csv', rows);
    App.toast('Export CSV téléchargé', 'success');
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
    const canEdit = App.can('edit');
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
      <div class="field" style="margin-top:4px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:normal">
          <input type="checkbox" id="pf-strict" ${p.sequencementStrict?'checked':''}>
          <span>⛓ Séquencement strict</span>
        </label>
        <div class="muted small" style="margin-top:3px;padding-left:24px">Si activé : à l'enregistrement d'une tâche, les dates sont vérifiées par rapport à ses dépendances — avec proposition d'auto-correction.</div>
      </div>
      ${!isNew ? `
        <div style="display:flex;align-items:center;gap:8px;margin-top:14px;flex-wrap:wrap">
          <h3 style="margin:0;flex:1">👥 Tâches & ressources (${taches.length})</h3>
          <button class="btn-ghost pf-open-gantt" data-pid="${p.id}" title="Ouvrir le Gantt filtré sur ce projet">📅 Gantt →</button>
          <button class="btn-ghost" id="pf-export-csv" title="Exporter les tâches de ce projet en CSV (ouvrable dans Excel)">⬇ CSV</button>
          ${canEdit && (s.equipes||[]).length ? `
            <select id="pf-equipe-sel" class="small">
              <option value="">— choisir une équipe —</option>
              ${(s.equipes||[]).map(eq => `<option value="${eq.id}">${eq.nom}</option>`).join('')}
            </select>
            <button class="btn-ghost" id="pf-apply-eq" title="Affecter automatiquement l'équipe sélectionnée à toutes les tâches de ce projet">🎯 Auto-affecter équipe</button>
          ` : ''}
        </div>
        <div id="pf-tasks-wrap">${this.renderTasksList(p.id, canEdit)}</div>
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
      p.sequencementStrict = document.getElementById('pf-strict').checked;
      if (!p.nom || !p.code) { App.toast('Code et nom requis','error'); return; }
      if (isNew) { s.projets.push(p); DB.logAudit('create','projet',p.id,`${p.code} · ${p.nom}`); }
      else DB.logAudit('update','projet',p.id,`${p.code} · ${p.nom}`);
      DB.save(); App.closeModal(); App.refresh();
    };
    if (!isNew) {
      document.getElementById('pf-del').onclick = () => {
        if (!confirm('Supprimer ce projet et toutes ses tâches ?')) return;
        s.projets = s.projets.filter(x => x.id !== p.id);
        s.taches = s.taches.filter(t => t.projetId !== p.id);
        DB.logAudit('delete','projet',p.id,`${p.code} · ${p.nom}`);
        DB.save(); App.closeModal(); App.refresh();
      };
      this.bindTasksList(p.id, canEdit);
      const applyBtn = document.getElementById('pf-apply-eq');
      if (applyBtn) applyBtn.onclick = () => this.applyEquipeToProject(p.id);
      const csvBtn = document.getElementById('pf-export-csv');
      if (csvBtn) csvBtn.onclick = () => this.exportTachesCSV(p.id);
      document.querySelectorAll('.pf-open-gantt').forEach(btn => {
        btn.onclick = () => {
          App.closeModal();
          App.views.gantt.state.projetFilter = btn.dataset.pid;
          App.navigate('gantt');
        };
      });
    }
  },

  exportTachesCSV(projetId) {
    const p = DB.projet(projetId);
    if (!p) return;
    const tasks = DB.tachesDuProjet(projetId).sort((a,b) => a.debut.localeCompare(b.debut));
    const rows = [['Code','Projet','Tâche','Type','Début','Fin','Durée (j)','Avancement (%)','Jalon','Machine','Lieu','Personnes','Dépendances','Notes']];
    tasks.forEach(t => {
      const m = DB.machine(t.machineId), l = DB.lieu(t.lieuId);
      const persons = (t.assignes||[]).map(id => App.personneLabel(DB.personne(id))).join(' | ');
      const deps = (t.dependances||[]).map(id => DB.tache(id)?.nom).filter(Boolean).join(' | ');
      rows.push([
        p.code, p.nom, t.nom, t.type||'',
        D.fmt(t.debut), D.fmt(t.fin), D.diffDays(t.debut, t.fin),
        t.avancement||0, t.jalon?'oui':'',
        m?m.nom:'', l?l.nom:'', persons, deps, t.notes||'',
      ]);
    });
    CSV.download(`${p.code}-taches-${D.iso(new Date())}.csv`, rows);
    App.toast('Tâches exportées en CSV','success');
  },

  renderTasksList(projetId, canEdit) {
    const s = DB.state;
    const taches = DB.tachesDuProjet(projetId).sort((a,b) => a.debut.localeCompare(b.debut));
    if (!taches.length) return `
      <div style="text-align:center;padding:20px 0">
        <p class="muted small" style="margin:0 0 12px">Aucune tâche pour ce projet.</p>
        <button class="btn pf-open-gantt" data-pid="${projetId}">📅 Créer des tâches dans le Gantt →</button>
      </div>`;
    return taches.map(t => this.renderTaskRow(t, canEdit)).join('');
  },

  renderTaskRow(t, canEdit) {
    const s = DB.state;
    const assignes = (t.assignes||[]).map(id => DB.personne(id)).filter(Boolean);
    const chips = assignes.map(p => `
      <span class="chip-person" style="background:${(p.couleur||'#2c5fb3')}22;color:${p.couleur||'#2c5fb3'};border:1px solid ${p.couleur||'#2c5fb3'}55">
        <span class="chip-dot" style="background:${p.couleur||'#2c5fb3'}"></span>
        ${p.prenom} ${p.nom}
        ${canEdit ? `<button class="chip-x" data-task="${t.id}" data-pid="${p.id}" title="Retirer">×</button>` : ''}
      </span>`).join('');
    const assignedSet = new Set(t.assignes||[]);
    const disponibles = s.personnes.filter(p => !assignedSet.has(p.id));
    const addSelect = canEdit ? `
      <select class="pf-add-person" data-task="${t.id}">
        <option value="">+ Ajouter personne…</option>
        ${disponibles.map(p => `<option value="${p.id}">${p.prenom} ${p.nom} · ${p.role||''}</option>`).join('')}
      </select>
      <button class="btn-ghost small pf-suggest" data-task="${t.id}" title="Suggérer les meilleures personnes (compétence + charge)">💡 Suggérer</button>
    ` : '';
    return `
      <div class="pf-task-row" data-task="${t.id}">
        <div class="pf-task-head">
          <div>
            <strong>${t.nom}</strong> ${t.jalon?'<span class="badge">jalon</span>':''}
            <span class="badge muted">${t.type||''}</span>
          </div>
          <div class="small muted">${D.fmt(t.debut)} → ${D.fmt(t.fin)} · ${t.avancement||0}%</div>
        </div>
        <div class="pf-task-chips">
          ${chips || '<span class="muted small">Aucune personne affectée</span>'}
        </div>
        ${addSelect ? `<div class="pf-task-actions">${addSelect}</div>` : ''}
      </div>`;
  },

  bindTasksList(projetId, canEdit) {
    if (!canEdit) return;
    const wrap = document.getElementById('pf-tasks-wrap');
    if (!wrap) return;
    wrap.onclick = (e) => {
      const x = e.target.closest('.chip-x');
      if (x) {
        const t = DB.tache(x.dataset.task);
        if (!t) return;
        t.assignes = (t.assignes||[]).filter(id => id !== x.dataset.pid);
        DB.save();
        this.refreshTaskRow(t.id, canEdit);
        return;
      }
      const sug = e.target.closest('.pf-suggest');
      if (sug) {
        this.openSuggestPopup(sug.dataset.task, canEdit);
        return;
      }
    };
    wrap.onchange = (e) => {
      const sel = e.target.closest('.pf-add-person');
      if (!sel || !sel.value) return;
      const t = DB.tache(sel.dataset.task);
      if (!t) return;
      t.assignes = t.assignes || [];
      if (!t.assignes.includes(sel.value)) t.assignes.push(sel.value);
      DB.save();
      this.refreshTaskRow(t.id, canEdit);
    };
  },

  refreshTaskRow(tacheId, canEdit) {
    const t = DB.tache(tacheId);
    if (!t) return;
    const row = document.querySelector(`.pf-task-row[data-task="${tacheId}"]`);
    if (!row) return;
    row.outerHTML = this.renderTaskRow(t, canEdit);
  },

  openSuggestPopup(tacheId, canEdit) {
    const t = DB.tache(tacheId);
    if (!t) return;
    const suggestions = App.suggestAssignees(t, 5);
    const body = `
      <p class="muted small">Top 5 pour <strong>${t.nom}</strong> (score : compétence +100, lieu +10, charge −5/j).</p>
      <ul class="list">
        ${suggestions.map(sg => `
          <li>
            <div>
              <strong>${sg.p.prenom} ${sg.p.nom}</strong>
              <span class="badge muted">${sg.p.role||''}</span>
              ${sg.compMatch ? '<span class="badge good">compétence ✓</span>' : ''}
              <div class="small muted">charge période : ${sg.charge} j · score ${sg.score}</div>
            </div>
            <button class="btn btn-secondary small pf-affect-one" data-task="${t.id}" data-pid="${sg.p.id}" ${((t.assignes||[]).includes(sg.p.id))?'disabled':''}>
              ${((t.assignes||[]).includes(sg.p.id))?'Déjà affecté·e':'Affecter'}
            </button>
          </li>`).join('')}
      </ul>`;
    const foot = `<span class="spacer" style="flex:1"></span><button class="btn btn-secondary" id="sg-close">Fermer</button>`;
    App.openOverlay('Suggestions — ' + t.nom, body, foot);
    document.getElementById('sg-close').onclick = () => App.closeOverlay();
    document.querySelectorAll('.pf-affect-one').forEach(b => b.onclick = () => {
      const task = DB.tache(b.dataset.task);
      if (!task) return;
      task.assignes = task.assignes || [];
      if (!task.assignes.includes(b.dataset.pid)) task.assignes.push(b.dataset.pid);
      DB.save();
      b.disabled = true; b.textContent = 'Déjà affecté·e';
      this.refreshTaskRow(task.id, canEdit);
    });
  },

  applyEquipeToProject(projetId) {
    const s = DB.state;
    const sel = document.getElementById('pf-equipe-sel');
    if (!sel || !sel.value) { App.toast('Choisir une équipe','warn'); return; }
    const eq = s.equipes.find(e => e.id === sel.value);
    if (!eq) { App.toast('Équipe introuvable','error'); return; }
    const taches = DB.tachesDuProjet(projetId).filter(t => !t.jalon);
    if (!taches.length) { App.toast('Aucune tâche à affecter','warn'); return; }
    if (!confirm(`Auto-affecter l'équipe « ${eq.nom} » à ${taches.length} tâche(s) ?\n(Les personnes déjà affectées sont conservées, les nouvelles sont ajoutées selon compétence + dispo.)`)) return;
    let touched = 0;
    taches.forEach(t => {
      const prop = App.views.equipes.proposerAffectation(eq.id, t.debut, t.fin);
      if (!prop) return;
      t.assignes = t.assignes || [];
      let changed = false;
      prop.slots.forEach(sl => {
        (sl.selected||[]).forEach(c => {
          if (!t.assignes.includes(c.p.id)) { t.assignes.push(c.p.id); changed = true; }
        });
      });
      if (changed) touched++;
    });
    DB.save();
    App.toast(`${touched} tâche(s) enrichie(s) avec l'équipe ${eq.nom}`, 'success');
    // Re-render toute la liste de tâches
    const wrap = document.getElementById('pf-tasks-wrap');
    if (wrap) wrap.innerHTML = this.renderTasksList(projetId, App.can('edit'));
    this.bindTasksList(projetId, App.can('edit'));
  },

  downloadTemplate() {
    CSV.download('modele-import-projets.csv', [
      ['Code','Nom','Client','Couleur (#hex)','Début (YYYY-MM-DD)','Fin (YYYY-MM-DD)','Étage','Priorité (haute/moyenne/basse)','Statut (planifié/en-cours/terminé/annulé)'],
      ['PRJ-G','Nouveau projet G','Client SA','#2563eb','2026-06-01','2026-09-30','2e','haute','planifié'],
    ]);
  },

  importFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        let text = e.target.result;
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const sep = text.includes(';') ? ';' : ',';
        const norm = s => (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const hdrs = lines[0].split(sep).map(h => norm(h.replace(/^"|"$/g,'')));
        const rows = lines.slice(1).map(l => {
          const v = l.split(sep).map(c => c.trim().replace(/^"|"$/g,''));
          const o = {}; hdrs.forEach((h,i) => o[h] = v[i]||''); return o;
        }).filter(r => Object.values(r).some(v => v));
        const s = DB.state;
        const validStatuts = ['planifié','en-cours','terminé','annulé'];
        const validPrios = ['haute','moyenne','basse'];
        const parsed = rows.map(r => {
          const code = r['code'] || '';
          const nom = r['nom'] || '';
          const client = r['client'] || '';
          const couleur = r['couleur (#hex)'] || r['couleur'] || '#2563eb';
          const debut = r['debut (yyyy-mm-dd)'] || r['debut'] || r['début'] || '';
          const fin = r['fin (yyyy-mm-dd)'] || r['fin'] || '';
          const etage = r['etage'] || r['étage'] || '';
          const priorite = validPrios.includes(norm(r['priorite (haute/moyenne/basse)'] || r['priorite'] || r['priorité'])) ? norm(r['priorite (haute/moyenne/basse)'] || r['priorite'] || r['priorité']) : 'moyenne';
          const statut = validStatuts.includes(norm(r['statut (planifie/en-cours/termine/annule)'] || r['statut'] || '')) ? norm(r['statut (planifie/en-cours/termine/annule)'] || r['statut'] || '') : 'planifié';
          const existing = s.projets.find(p => p.code === code);
          const errors = [];
          if (!code) errors.push('code manquant');
          if (!nom) errors.push('nom manquant');
          if (debut && !debut.match(/^\d{4}-\d{2}-\d{2}$/)) errors.push('date début invalide');
          if (fin && !fin.match(/^\d{4}-\d{2}-\d{2}$/)) errors.push('date fin invalide');
          return { code, nom, client, couleur, debut, fin, etage, priorite, statut, existing, errors };
        }).filter(r => r.code || r.nom);
        if (!parsed.length) { App.toast('Aucun projet à importer','warn'); return; }
        const body = `<p class="muted small">${parsed.filter(r=>!r.existing&&!r.errors.length).length} à créer · ${parsed.filter(r=>r.existing).length} à mettre à jour · ${parsed.filter(r=>r.errors.length).length} erreur(s)</p>
          <table class="data"><thead><tr><th>Code</th><th>Nom</th><th>Client</th><th>Début</th><th>Fin</th><th>Statut</th></tr></thead><tbody>
          ${parsed.map(r => `<tr>
            <td><span class="badge" style="background:${r.couleur}22;color:${r.couleur}">${r.code}</span></td>
            <td>${r.nom}</td><td class="muted small">${r.client}</td><td>${r.debut}</td><td>${r.fin}</td>
            <td>${r.errors.length?`<span class="badge bad">${r.errors.join(', ')}</span>`:r.existing?'<span class="badge warn">màj</span>':'<span class="badge good">nouveau</span>'}</td>
          </tr>`).join('')}
          </tbody></table>`;
        const importable = parsed.filter(r => !r.errors.length);
        const foot = `<button class="btn btn-secondary" onclick="App.closeModal()">Annuler</button>
          <button class="btn" id="prj-import-ok">Importer (${importable.length})</button>`;
        App.openModal('Aperçu import — Projets', body, foot);
        document.getElementById('prj-import-ok').onclick = () => {
          let created = 0, updated = 0;
          importable.forEach(r => {
            if (r.existing) {
              Object.assign(r.existing, { nom: r.nom||r.existing.nom, client: r.client||r.existing.client, couleur: r.couleur, priorite: r.priorite, statut: r.statut });
              if (r.debut) r.existing.debut = r.debut;
              if (r.fin) r.existing.fin = r.fin;
              if (r.etage) r.existing.etage = r.etage;
              DB.logAudit('update','projet',r.existing.id,r.code+' (import)');
              updated++;
            } else {
              const p = { id: DB.uid('PRJ'), code: r.code, nom: r.nom, client: r.client, couleur: r.couleur, debut: r.debut||D.today(), fin: r.fin||D.addWorkdays(D.today(),20), etage: r.etage||'1er', priorite: r.priorite, statut: r.statut, bom:[] };
              s.projets.push(p);
              DB.logAudit('create','projet',p.id,p.code+' (import)');
              created++;
            }
          });
          DB.save(); App.closeModal(); App.refresh();
          App.toast(`${created} créé(s) · ${updated} mis à jour`, 'success');
        };
      } catch(err) { App.toast('Erreur : ' + err.message, 'error'); }
    };
    reader.readAsText(file, 'UTF-8');
  },
};
