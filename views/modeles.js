// Vue Modèles de tâches récurrentes
// Un modèle = template de tâche qu'on instancie rapidement (durée, type, machine, lieu, compétences requises)
App.views.modeles = {
  render(root) {
    const s = DB.state;
    const modeles = s.modeles || [];
    const canEdit = App.can('edit');
    root.innerHTML = `
      <div class="toolbar">
        <strong>🔁 Modèles de tâches récurrentes</strong>
        <span class="muted small">Créer un modèle qu'on duplique en 1 clic (préparation commandes, réception, nettoyage…)</span>
        <span class="spacer"></span>
        ${canEdit ? '<button class="btn" id="mod-add">+ Nouveau modèle</button>' : ''}
      </div>
      <div class="grid grid-3">
        ${modeles.length ? modeles.map(m => this.renderCard(m)).join('') : '<p class="muted">Aucun modèle. Clic sur « + Nouveau modèle » pour commencer.</p>'}
      </div>
    `;
    const addBtn = document.getElementById('mod-add');
    if (addBtn) addBtn.onclick = () => this.openForm(null);
    document.querySelectorAll('.mod-edit').forEach(b => b.onclick = () => this.openForm(b.dataset.id));
    document.querySelectorAll('.mod-use').forEach(b => b.onclick = () => this.instancier(b.dataset.id));
  },

  renderCard(m) {
    const s = DB.state;
    const machine = DB.machine(m.machineId), lieu = DB.lieu(m.lieuId);
    return `<div class="card" style="border-left:4px solid ${m.couleur||'#888'}">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <h3 style="margin:0">${m.nom}</h3>
          <div class="muted small">${m.type||''} · ${m.duree||1} j · ${lieu?lieu.nom:'—'}${machine?' · '+machine.nom:''}</div>
        </div>
        <span class="badge muted">${(m.competences||[]).length} compétence(s)</span>
      </div>
      ${m.notes ? `<div class="small muted" style="margin-top:8px">📝 ${m.notes}</div>` : ''}
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
        ${(m.competences||[]).map(c => `<span class="chip small">${c}</span>`).join('')}
      </div>
      <div style="margin-top:10px;display:flex;gap:6px">
        <button class="btn btn-secondary mod-use" data-id="${m.id}">➕ Utiliser</button>
        ${App.can('edit') ? `<button class="btn-ghost mod-edit" data-id="${m.id}">✎ Éditer</button>` : ''}
      </div>
    </div>`;
  },

  openForm(id) {
    if (!App.can('edit')) { App.toast("Lecture seule",'error'); return; }
    const s = DB.state;
    const isNew = !id;
    const m = id ? s.modeles.find(x => x.id === id) : {
      id: DB.uid('MOD'), nom:'', type:'prod', duree:1, machineId:null, lieuId:null,
      competences:[], notes:'', couleur:'#2c5fb3'
    };
    const allComps = [...new Set(s.personnes.flatMap(p => p.competences||[]))].sort();
    const body = `
      <div class="row">
        <div class="field"><label>Nom du modèle</label><input id="mf-nom" value="${m.nom||''}" placeholder="Préparation commandes matin…"></div>
        <div class="field"><label>Couleur</label><input type="color" id="mf-col" value="${m.couleur||'#2c5fb3'}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Type</label>
          <select id="mf-type">${['etude','appro','prod','livraison','jalon'].map(x=>`<option ${x===m.type?'selected':''}>${x}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Durée (jours)</label><input type="number" id="mf-duree" min="1" value="${m.duree||1}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Machine (optionnel)</label>
          <select id="mf-mach"><option value="">—</option>${s.machines.map(mc => `<option value="${mc.id}" ${mc.id===m.machineId?'selected':''}>${mc.nom}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Lieu (optionnel)</label>
          <select id="mf-lieu"><option value="">—</option>${s.lieux.map(l => `<option value="${l.id}" ${l.id===m.lieuId?'selected':''}>${l.nom}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field"><label>Compétences requises</label>
        <select id="mf-comps" multiple size="5">
          ${allComps.map(c => `<option value="${c}" ${(m.competences||[]).includes(c)?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Notes / consignes</label>
        <textarea id="mf-notes" rows="3" placeholder="Instructions d'exécution récurrentes…">${m.notes||''}</textarea>
      </div>
    `;
    const foot = `${!isNew?'<button class="btn btn-danger" id="mf-del">Supprimer</button>':''}<span class="spacer" style="flex:1"></span>
      <button class="btn btn-secondary" onclick="App.closeModal()">Annuler</button>
      <button class="btn" id="mf-save">${isNew?'Créer':'Enregistrer'}</button>`;
    App.openModal(isNew?'Nouveau modèle':m.nom, body, foot);
    document.getElementById('mf-save').onclick = () => {
      m.nom = document.getElementById('mf-nom').value.trim();
      m.couleur = document.getElementById('mf-col').value;
      m.type = document.getElementById('mf-type').value;
      m.duree = +document.getElementById('mf-duree').value || 1;
      m.machineId = document.getElementById('mf-mach').value || null;
      m.lieuId = document.getElementById('mf-lieu').value || null;
      m.competences = Array.from(document.getElementById('mf-comps').selectedOptions).map(o => o.value);
      m.notes = document.getElementById('mf-notes').value;
      if (!m.nom) { App.toast('Nom requis','error'); return; }
      if (isNew) { s.modeles.push(m); DB.logAudit('create','modele',m.id,m.nom); }
      else DB.logAudit('update','modele',m.id,m.nom);
      DB.save(); App.closeModal(); App.refresh(); App.toast('Modèle enregistré','success');
    };
    const delBtn = document.getElementById('mf-del');
    if (delBtn) delBtn.onclick = () => {
      if (!confirm('Supprimer ce modèle ?')) return;
      s.modeles = s.modeles.filter(x => x.id !== m.id);
      DB.logAudit('delete','modele',m.id,m.nom);
      DB.save(); App.closeModal(); App.refresh(); App.toast('Modèle supprimé','info');
    };
  },

  // Instancier un modèle = ouvrir le formulaire tâche avec les champs pré-remplis
  instancier(id) {
    if (!App.can('edit')) { App.toast("Lecture seule",'error'); return; }
    const s = DB.state;
    const m = s.modeles.find(x => x.id === id);
    if (!m) return;
    if (!s.projets.length) { App.toast('Créer d\'abord un projet','error'); App.navigate('projets'); return; }

    const lastFinOfProject = pid => {
      const fins = s.taches.filter(t => t.projetId === pid && !t.jalon).map(t => t.fin);
      return fins.length ? fins.sort()[fins.length - 1] : null;
    };
    const suggestDebut = pid => {
      const last = lastFinOfProject(pid);
      return last ? D.nextWorkday(D.addDays(last, 1)) : D.nextWorkday(D.today());
    };
    const firstPid = s.projets[0]?.id;

    const body = `
      <div class="field"><label>Projet d'affectation</label>
        <select id="inst-prj">${s.projets.map(p => `<option value="${p.id}">${p.code} — ${p.nom}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label>Date de début</label>
        <input type="date" id="inst-debut" value="${suggestDebut(firstPid)}">
        <div id="inst-hint" class="muted small" style="margin-top:4px"></div>
      </div>
      <p class="muted small">La tâche sera créée avec durée <strong>${m.duree} j.o.</strong> (jours ouvrés, week-ends exclus), type <strong>${m.type}</strong>, les mêmes machine/lieu/notes. Tu pourras ensuite la modifier dans le Gantt.</p>
    `;
    const foot = `<button class="btn btn-secondary" onclick="App.closeModal()">Annuler</button><span class="spacer" style="flex:1"></span><button class="btn" id="inst-ok">Créer la tâche</button>`;
    App.openModal(`Instancier : ${m.nom}`, body, foot);

    const updateHint = pid => {
      const last = lastFinOfProject(pid);
      const hint = document.getElementById('inst-hint');
      if (hint) hint.textContent = last
        ? `Dernière tâche du projet se termine le ${D.fmt(last)} — début suggéré : ${D.fmt(D.nextWorkday(D.addDays(last, 1)))}`
        : 'Aucune tâche dans ce projet encore.';
    };
    updateHint(firstPid);
    document.getElementById('inst-prj').onchange = e => {
      const pid = e.target.value;
      document.getElementById('inst-debut').value = suggestDebut(pid);
      updateHint(pid);
    };

    document.getElementById('inst-ok').onclick = () => {
      const pid = document.getElementById('inst-prj').value;
      const debut = D.nextWorkday(document.getElementById('inst-debut').value);
      const fin = D.addWorkdays(debut, m.duree - 1);
      const t = {
        id: DB.uid('T'), projetId: pid, nom: m.nom,
        debut, fin, assignes:[], machineId: m.machineId || null, lieuId: m.lieuId || null,
        type: m.type, avancement: 0, jalon: false, dependances: [], notes: m.notes || '',
      };
      s.taches.push(t);
      DB.logAudit('create','tache',t.id,`${m.nom} (via modèle)`);
      DB.save(); App.closeModal(); App.toast('Tâche créée depuis le modèle','success');
      App.navigateToTarget({ view:'gantt', tacheId: t.id });
    };
  },
};
