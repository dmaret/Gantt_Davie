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
    document.querySelectorAll('.prj-card').forEach(c => c.onclick = () => this.openForm(c.dataset.id));
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
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
          <span class="badge muted">${total} tâches</span>
          <span class="badge muted">${jalons.length} jalons</span>
          <span class="badge ${p.statut==='en-cours'?'good':'muted'}">${p.statut}</span>
          ${retard ? '<span class="badge bad">retard</span>' : ''}
        </div>
      </div>
    `;
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
