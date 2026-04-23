App.views.deplacements = {
  render(root) {
    const s = DB.state;
    root.innerHTML = `
      <div class="toolbar">
        <strong>Déplacements</strong>
        <span class="spacer"></span>
        <input type="file" id="d-import-file" accept=".csv,.json" hidden>
        <button class="btn-ghost" id="d-tpl" data-perm="edit">⬇ Modèle</button>
        <button class="btn-ghost" id="d-import" data-perm="edit">⬆ Importer</button>
        <button class="btn-ghost" id="d-csv">⤓ Exporter CSV</button>
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
    document.getElementById('d-tpl').onclick = () => this.downloadTemplate();
    document.getElementById('d-import').onclick = () => document.getElementById('d-import-file').click();
    document.getElementById('d-import-file').onchange = e => { if (e.target.files[0]) this.importFile(e.target.files[0]); e.target.value = ''; };
    document.getElementById('d-csv').onclick = () => this.exportCSV();
    document.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => this.openForm(tr.dataset.id));
  },
  openForm(id) {
    const isNew = !id;
    const s = DB.state;
    if (!id && (!s.personnes.length || s.lieux.length < 2)) {
      App.toast('Il faut au moins une personne et deux lieux pour créer un déplacement.', 'error'); return;
    }
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

  exportCSV() {
    const s = DB.state;
    const rows = [['Date','Prénom','Nom','Origine','Destination','Motif','Durée','Projet']];
    s.deplacements.slice().sort((a,b) => a.date.localeCompare(b.date)).forEach(d => {
      const p = DB.personne(d.personneId);
      const o = DB.lieu(d.origineId), dest = DB.lieu(d.destinationId);
      const prj = DB.projet(d.projetId);
      rows.push([d.date, p?.prenom||'', p?.nom||'', o?.nom||'', dest?.nom||'', d.motif||'', d.duree||'', prj?.code||'']);
    });
    CSV.download('deplacements-' + D.today() + '.csv', rows);
    App.toast('Export CSV téléchargé', 'success');
  },

  downloadTemplate() {
    CSV.download('modele-import-deplacements.csv', [
      ['Date (YYYY-MM-DD)','Prénom','Nom','Lieu origine','Lieu destination','Motif','Durée','Projet (code)'],
      ['2026-06-02','Marie','Martin','Atelier 2A','Atelier 1A','Installation machine','2h','PRJ-A'],
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
        const parsed = rows.map(r => {
          const date = r['date (yyyy-mm-dd)'] || r['date'] || '';
          const prenom = r['prenom'] || r['prénom'] || '';
          const nomP = r['nom'] || '';
          const origNom = norm(r['lieu origine'] || r['origine'] || '');
          const destNom = norm(r['lieu destination'] || r['destination'] || '');
          const motif = r['motif'] || '';
          const duree = r['duree'] || r['durée'] || '1h';
          const pCode = norm(r['projet (code)'] || r['projet'] || '');
          const personne = s.personnes.find(p => norm(p.prenom) === norm(prenom) && norm(p.nom) === norm(nomP));
          const origine = s.lieux.find(l => norm(l.nom) === origNom);
          const dest = s.lieux.find(l => norm(l.nom) === destNom);
          const prj = pCode ? s.projets.find(p => norm(p.code) === pCode) : null;
          const errors = [];
          if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) errors.push('date invalide');
          if (!personne) errors.push('personne introuvable');
          if (!origine) errors.push('origine introuvable');
          if (!dest) errors.push('destination introuvable');
          return { date, prenom, nomP, personne, origine, dest, motif, duree, prj, errors };
        }).filter(r => r.date || r.prenom);
        if (!parsed.length) { App.toast('Aucun déplacement à importer','warn'); return; }
        const importable = parsed.filter(r => !r.errors.length);
        const body = `<p class="muted small">${importable.length} à créer · ${parsed.filter(r=>r.errors.length).length} erreur(s)</p>
          <table class="data"><thead><tr><th>Date</th><th>Personne</th><th>Origine → Destination</th><th>Motif</th><th>Statut</th></tr></thead><tbody>
          ${parsed.map(r => `<tr>
            <td>${r.date}</td><td>${r.prenom} ${r.nomP}</td>
            <td>${r.origine?r.origine.nom:'?'} → ${r.dest?r.dest.nom:'?'}</td>
            <td>${r.motif}</td>
            <td>${r.errors.length?`<span class="badge bad">${r.errors.join(', ')}</span>`:'<span class="badge good">nouveau</span>'}</td>
          </tr>`).join('')}
          </tbody></table>`;
        const foot = `<button class="btn btn-secondary" onclick="App.closeModal()">Annuler</button>
          <button class="btn" id="d-import-ok">Importer (${importable.length})</button>`;
        App.openModal('Aperçu import — Déplacements', body, foot);
        document.getElementById('d-import-ok').onclick = () => {
          importable.forEach(r => {
            const dep = { id: DB.uid('DEP'), date: r.date, personneId: r.personne.id, origineId: r.origine.id, destinationId: r.dest.id, motif: r.motif, duree: r.duree, projetId: r.prj?.id||null };
            s.deplacements.push(dep);
            DB.logAudit('create','deplacement',dep.id,r.prenom+' '+r.nomP+' (import)');
          });
          DB.save(); App.closeModal(); App.refresh();
          App.toast(`${importable.length} déplacement(s) importé(s)`, 'success');
        };
      } catch(err) { App.toast('Erreur : ' + err.message, 'error'); }
    };
    reader.readAsText(file, 'UTF-8');
  },
};
