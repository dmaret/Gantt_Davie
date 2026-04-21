App.views.deplacements = {
  render(root) {
    const s = DB.state;
    root.innerHTML = `
      <div class="toolbar">
        <strong>Déplacements</strong>
        <span class="spacer"></span>
        <button class="btn" id="d-add">+ Nouveau déplacement</button>
      </div>
      <div class="card">
        <table class="data">
          <thead><tr><th>Date</th><th>Personne</th><th>Origine</th><th>Destination</th><th>Motif</th><th>Projet</th><th>Durée</th></tr></thead>
          <tbody>
          ${s.deplacements.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(d => {
            const p = DB.personne(d.personneId), o = DB.lieu(d.origineId), dest = DB.lieu(d.destinationId);
            const prj = DB.projet(d.projetId);
            return `<tr data-id="${d.id}" style="cursor:pointer">
              <td class="mono">${D.fmt(d.date)}</td>
              <td>${App.personneLabel(p)}</td>
              <td>${o?o.nom:'—'}</td>
              <td>${dest?dest.nom:'—'}</td>
              <td>${d.motif}</td>
              <td>${prj?`<span class="badge" style="background:${prj.couleur}22;color:${prj.couleur}">${prj.code}</span>`:'<span class="muted small">—</span>'}</td>
              <td>${d.duree}</td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>
    `;
    document.getElementById('d-add').onclick = () => this.openForm(null);
    document.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => this.openForm(tr.dataset.id));
  },
  openForm(id) {
    const isNew = !id;
    const s = DB.state;
    const d = id ? s.deplacements.find(x => x.id === id) : {
      id: DB.uid('DEP'), date: D.today(), personneId: s.personnes[0].id, origineId: s.lieux[0].id,
      destinationId: s.lieux[1].id, motif:'', projetId:null, duree:'1h'
    };
    const optLieux = s.lieux.map(l => `<option value="${l.id}">${l.nom}</option>`).join('');
    const optPers = s.personnes.map(p => `<option value="${p.id}">${App.personneLabel(p)}</option>`).join('');
    const optProj = s.projets.map(p => `<option value="${p.id}">${p.code} — ${p.nom}</option>`).join('');
    const body = `
      <div class="row">
        <div class="field"><label>Date</label><input type="date" id="df-date" value="${d.date}"></div>
        <div class="field"><label>Durée</label><input id="df-duree" value="${d.duree}"></div>
      </div>
      <div class="field"><label>Personne</label><select id="df-pers">${optPers}</select></div>
      <div class="row">
        <div class="field"><label>Origine</label><select id="df-o">${optLieux}</select></div>
        <div class="field"><label>Destination</label><select id="df-d">${optLieux}</select></div>
      </div>
      <div class="field"><label>Motif</label><input id="df-motif" value="${d.motif||''}"></div>
      <div class="field"><label>Projet lié (optionnel)</label>
        <select id="df-prj"><option value="">—</option>${optProj}</select>
      </div>
    `;
    const foot = `${!isNew?'<button class="btn btn-danger" id="df-del">Supprimer</button>':''}<span class="spacer" style="flex:1"></span>
      <button class="btn btn-secondary" id="df-cancel">Annuler</button>
      <button class="btn" id="df-save">${isNew?'Créer':'Enregistrer'}</button>`;
    App.openModal(isNew?'Nouveau déplacement':'Déplacement', body, foot);
    document.getElementById('df-pers').value = d.personneId;
    document.getElementById('df-o').value = d.origineId;
    document.getElementById('df-d').value = d.destinationId;
    document.getElementById('df-prj').value = d.projetId || '';
    document.getElementById('df-cancel').onclick = () => App.closeModal();
    document.getElementById('df-save').onclick = () => {
      d.date = document.getElementById('df-date').value;
      d.duree = document.getElementById('df-duree').value;
      d.personneId = document.getElementById('df-pers').value;
      d.origineId = document.getElementById('df-o').value;
      d.destinationId = document.getElementById('df-d').value;
      d.motif = document.getElementById('df-motif').value;
      d.projetId = document.getElementById('df-prj').value || null;
      if (!d.motif) { App.toast('Motif requis','error'); return; }
      if (isNew) s.deplacements.push(d);
      DB.save(); App.closeModal(); App.refresh();
    };
    if (!isNew) document.getElementById('df-del').onclick = () => {
      if (!confirm('Supprimer ?')) return;
      s.deplacements = s.deplacements.filter(x => x.id !== d.id);
      DB.save(); App.closeModal(); App.refresh();
    };
  },
};
