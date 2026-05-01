// Vue Absences & congés — saisie et impact sur dispos
App.views.absences = {
  state: { filterPersonne:'', filterMotif:'', showPast:false },

  render(root) {
    const s = DB.state;
    const today = D.today();
    const st = this.state;
    const motifs = ['Vacances','Maladie','Formation','Récup','Autre'];
    const all = [];
    s.personnes.forEach(p => (p.absences||[]).forEach(a => all.push({ ...a, personneId: p.id, p })));
    let list = all;
    if (st.filterPersonne) list = list.filter(a => a.personneId === st.filterPersonne);
    if (st.filterMotif) list = list.filter(a => a.motif === st.filterMotif);
    if (!st.showPast) list = list.filter(a => a.fin >= today);
    list.sort((a,b) => a.debut.localeCompare(b.debut));

    const canEdit = App.can('edit');
    const weekStart = today, weekEnd = D.addWorkdays(today, 4);
    const nextWeekEnd = D.addWorkdays(today, 9);
    const absentsAjd = s.personnes.filter(p => (p.absences||[]).some(a => a.debut <= today && a.fin >= today));
    const absentsSem = s.personnes.filter(p => (p.absences||[]).some(a => a.debut <= weekEnd && a.fin >= weekStart));
    const absents2Sem = s.personnes.filter(p => (p.absences||[]).some(a => a.debut <= nextWeekEnd && a.fin >= weekStart));

    root.innerHTML = `
      <div class="toolbar">
        <strong>🏖 Absences & congés</strong>
        <span class="spacer"></span>
        <select id="ab-p"><option value="">Toutes personnes</option>${s.personnes.map(p => `<option value="${p.id}" ${st.filterPersonne===p.id?'selected':''}>${App.personneLabel(p)}</option>`).join('')}</select>
        <select id="ab-m"><option value="">Tous motifs</option>${motifs.map(m => `<option ${st.filterMotif===m?'selected':''}>${m}</option>`).join('')}</select>
        <label class="small"><input type="checkbox" id="ab-past" ${st.showPast?'checked':''}> Inclure passées</label>
        <button class="btn-ghost" id="ab-csv">⤓ Exporter CSV</button>
        ${App.can('admin') ? `<input type="file" id="ab-import-file" accept=".csv,.json" hidden>
        <button class="btn-ghost" id="ab-tpl">⬇ Modèle</button>
        <button class="btn-ghost" id="ab-import">⬆ Importer</button>` : ''}
        ${canEdit ? `<button class="btn" id="ab-add">+ Nouvelle absence</button>` : ''}
      </div>

      <div class="grid grid-3" style="margin-bottom:14px">
        <div class="card"><div class="muted small">Absents aujourd'hui</div><div style="font-size:28px;font-weight:700">${absentsAjd.length}</div>
          <div class="small muted">${absentsAjd.slice(0,6).map(p => App.personneLabel(p)).join(', ')||'—'}</div></div>
        <div class="card"><div class="muted small">Cette semaine (L→V)</div><div style="font-size:28px;font-weight:700">${absentsSem.length}</div>
          <div class="small muted">Personnes avec au moins 1 j. d'absence</div></div>
        <div class="card"><div class="muted small">2 semaines à venir</div><div style="font-size:28px;font-weight:700">${absents2Sem.length}</div>
          <div class="small muted">Anticipation — contacter les équipes</div></div>
      </div>

      <div class="card">
        ${list.length ? `
          <table class="data">
            <thead><tr><th>Personne</th><th>Début</th><th>Fin</th><th class="right">Durée</th><th>Motif</th><th>Note</th><th></th></tr></thead>
            <tbody>${list.map(a => {
              const dur = D.diffDays(a.debut, a.fin) + 1;
              const cls = a.fin < today ? 'muted' : (a.debut <= today && a.fin >= today ? 'bad' : 'warn');
              return `<tr>
                <td><strong>${App.personneLabel(a.p)}</strong> <span class="muted small">${a.p.role||''}</span></td>
                <td>${D.fmt(a.debut)}</td>
                <td>${D.fmt(a.fin)}</td>
                <td class="right">${dur} j</td>
                <td><span class="badge ${cls}">${App.escapeHTML(a.motif)}</span></td>
                <td class="small muted">${App.escapeHTML(a.note||'—')}</td>
                <td>${canEdit ? `<button class="btn-ghost small ab-edit" data-pid="${a.personneId}" data-aid="${a.id}">✎</button> <button class="btn-ghost small ab-del" data-pid="${a.personneId}" data-aid="${a.id}">🗑</button>` : ''}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        ` : '<p class="muted">Aucune absence enregistrée avec ces filtres.</p>'}
      </div>
    `;
    document.getElementById('ab-p').onchange = e => { st.filterPersonne = e.target.value; App.refresh(); };
    document.getElementById('ab-m').onchange = e => { st.filterMotif = e.target.value; App.refresh(); };
    document.getElementById('ab-past').onchange = e => { st.showPast = e.target.checked; App.refresh(); };
    document.getElementById('ab-csv').onclick = () => this.exportCSV();
    const addBtn = document.getElementById('ab-add');
    if (addBtn) addBtn.onclick = () => this.openForm(null, null);
    const tplBtn = document.getElementById('ab-tpl');
    if (tplBtn) tplBtn.onclick = () => this.downloadTemplate();
    const impBtn = document.getElementById('ab-import');
    if (impBtn) impBtn.onclick = () => document.getElementById('ab-import-file').click();
    const impFile = document.getElementById('ab-import-file');
    if (impFile) impFile.onchange = e => { if (e.target.files[0]) this.importFile(e.target.files[0]); e.target.value = ''; };
    document.querySelectorAll('.ab-edit').forEach(b => b.onclick = () => this.openForm(b.dataset.pid, b.dataset.aid));
    document.querySelectorAll('.ab-del').forEach(b => b.onclick = () => {
      if (!confirm('Supprimer cette absence ?')) return;
      const p = DB.personne(b.dataset.pid);
      if (!p) return;
      p.absences = (p.absences||[]).filter(x => x.id !== b.dataset.aid);
      DB.logAudit('delete','absence',b.dataset.aid,App.personneLabel(p));
      DB.save(); App.refresh(); App.toast('Absence supprimée','info');
    });
  },

  openForm(personneId, absenceId) {
    if (!App.can('edit')) { App.toast("Lecture seule",'error'); return; }
    const s = DB.state;
    const isNew = !absenceId;
    let p = personneId ? DB.personne(personneId) : null;
    let a = null;
    if (!isNew && p) a = (p.absences||[]).find(x => x.id === absenceId);
    if (!a) a = { id: DB.uid('ABS'), debut: D.today(), fin: D.today(), motif:'Vacances', note:'' };
    const motifs = ['Vacances','Maladie','Formation','Récup','Autre'];
    const body = `
      <div class="field"><label>Personne</label>
        <select id="ab-pid" ${isNew?'':'disabled'}>
          ${s.personnes.map(x => `<option value="${x.id}" ${x.id===(p?p.id:'')?'selected':''}>${App.personneLabel(x)}</option>`).join('')}
        </select>
      </div>
      <div class="row">
        <div class="field"><label>Début</label><input type="date" id="ab-debut" value="${a.debut}"></div>
        <div class="field"><label>Fin</label><input type="date" id="ab-fin" value="${a.fin}"></div>
      </div>
      <div class="field"><label>Motif</label>
        <select id="ab-motif">${motifs.map(m => `<option ${m===a.motif?'selected':''}>${m}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Note (optionnelle)</label><input id="ab-note" value="${App.escapeHTML(a.note||'')}" placeholder="Précision, référence dossier…"></div>
    `;
    const foot = `${!isNew?'<button class="btn btn-danger" id="ab-fdel">Supprimer</button>':''}<span class="spacer" style="flex:1"></span>
      <button class="btn btn-secondary" onclick="App.closeModal()">Annuler</button>
      <button class="btn" id="ab-save">${isNew?'Créer':'Enregistrer'}</button>`;
    App.openModal(isNew?'Nouvelle absence':'Modifier absence', body, foot);
    document.getElementById('ab-save').onclick = () => {
      const pid = document.getElementById('ab-pid').value;
      const pers = DB.personne(pid);
      if (!pers) { App.toast('Personne introuvable','error'); return; }
      a.debut = document.getElementById('ab-debut').value;
      a.fin = document.getElementById('ab-fin').value;
      a.motif = document.getElementById('ab-motif').value;
      a.note = document.getElementById('ab-note').value;
      if (a.fin < a.debut) { App.toast('Date de fin invalide','error'); return; }
      pers.absences = pers.absences || [];
      if (isNew) { pers.absences.push(a); DB.logAudit('create','absence',a.id,`${App.personneLabel(pers)} · ${a.motif} · ${a.debut}→${a.fin}`); }
      else DB.logAudit('update','absence',a.id,`${App.personneLabel(pers)} · ${a.motif}`);
      DB.save(); App.closeModal(); App.refresh(); App.toast('Absence enregistrée','success');
    };
    const delBtn = document.getElementById('ab-fdel');
    if (delBtn) delBtn.onclick = () => {
      if (!confirm('Supprimer cette absence ?')) return;
      p.absences = (p.absences||[]).filter(x => x.id !== a.id);
      DB.logAudit('delete','absence',a.id,App.personneLabel(p));
      DB.save(); App.closeModal(); App.refresh(); App.toast('Absence supprimée','info');
    };
  },

  exportCSV() {
    const s = DB.state;
    const rows = [['Prénom','Nom','Début','Fin','Durée (j. ouvrés)','Motif','Note']];
    s.personnes.forEach(p => (p.absences||[]).forEach(a => {
      const duree = D.workdaysBetween(a.debut, a.fin) + 1;
      rows.push([p.prenom, p.nom, a.debut, a.fin, duree, a.motif||'', a.note||'']);
    }));
    CSV.download('absences-' + D.today() + '.csv', rows);
    App.toast('Export CSV téléchargé', 'success');
  },

  downloadTemplate() {
    CSV.download('modele-import-absences.csv', [
      ['Prénom','Nom','Début (YYYY-MM-DD)','Fin (YYYY-MM-DD)','Motif','Note'],
      ['Marie','Martin','2026-06-01','2026-06-07','Vacances',''],
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
        const toISO = raw => { const s = (raw||'').trim().replace(/["']/g,''); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const m = s.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : s; };
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const hdrs = lines[0].split(sep).map(h => norm(h.replace(/^"|"$/g,'')));
        const rows = lines.slice(1).map(l => {
          const v = l.split(sep).map(c => c.trim().replace(/^"|"$/g,''));
          const o = {}; hdrs.forEach((h,i) => o[h] = v[i]||''); return o;
        }).filter(r => Object.values(r).some(v => v));
        const s = DB.state;
        const parsed = rows.map(r => {
          const prenom = r['prenom'] || r['prénom'] || '';
          const nomP = r['nom'] || '';
          const debut = toISO(r['debut (yyyy-mm-dd)'] || r['debut'] || r['début'] || '');
          const fin   = toISO(r['fin (yyyy-mm-dd)']   || r['fin'] || '');
          const motif = r['motif'] || 'Autre';
          const note = r['note'] || '';
          const personne = s.personnes.find(p => norm(p.prenom) === norm(prenom) && norm(p.nom) === norm(nomP));
          const errors = [];
          if (!debut.match(/^\d{4}-\d{2}-\d{2}$/)) errors.push('date début invalide');
          if (!fin.match(/^\d{4}-\d{2}-\d{2}$/)) errors.push('date fin invalide');
          const unknown = !personne && !errors.length;
          const duplicate = personne && (personne.absences||[]).some(a => a.debut === debut && a.fin === fin);
          return { prenom, nomP, debut, fin, motif, note, personne, errors, unknown, duplicate };
        }).filter(r => r.prenom || r.nomP);
        if (!parsed.length) { App.toast('Aucune absence à importer','warn'); return; }
        const importable = parsed.filter(r => !r.errors.length && !r.unknown && !r.duplicate);
        const unknownRows = parsed.filter(r => r.unknown);
        const dups = parsed.filter(r => r.duplicate).length;
        const errs = parsed.filter(r => r.errors.length).length;
        const body = `
          <p class="muted small" id="ab-import-summary">${importable.length} à créer · ${unknownRows.length > 0 ? `<span style="color:#c47800">${unknownRows.length} personne(s) inconnue(s) — cocher pour créer</span> · ` : ''}${dups} doublon(s) ignoré(s) · ${errs} erreur(s)</p>
          <table class="data"><thead><tr><th>Personne</th><th>Début</th><th>Fin</th><th>Motif</th><th>Statut</th></tr></thead><tbody>
          ${parsed.map((r, i) => {
            const rowStyle = r.unknown ? 'background:#fff8ed;' : r.errors.length ? 'background:#fef2f2;' : '';
            const status = r.errors.length
              ? `<span class="badge bad">${r.errors.join(', ')}</span>`
              : r.duplicate
              ? '<span class="badge muted">doublon</span>'
              : r.unknown
              ? `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap"><input type="checkbox" class="ab-unknown-cb" data-idx="${i}"> <span class="badge warn">inconnu · créer ?</span></label>`
              : '<span class="badge good">nouveau</span>';
            return `<tr style="${rowStyle}"><td>${App.escapeHTML(r.prenom)} ${App.escapeHTML(r.nomP)}</td><td>${r.debut}</td><td>${r.fin}</td><td>${App.escapeHTML(r.motif)}</td><td>${status}</td></tr>`;
          }).join('')}
          </tbody></table>`;
        const foot = `<button class="btn btn-secondary" onclick="App.closeModal()">Annuler</button>
          <button class="btn" id="ab-import-ok">Importer (${importable.length})</button>`;
        App.openModal('Aperçu import — Absences', body, foot);
        const updateCount = () => {
          const checked = document.querySelectorAll('.ab-unknown-cb:checked').length;
          const btn = document.getElementById('ab-import-ok');
          if (btn) btn.textContent = `Importer (${importable.length + checked})`;
        };
        document.querySelectorAll('.ab-unknown-cb').forEach(cb => cb.onchange = updateCount);
        document.getElementById('ab-import-ok').onclick = () => {
          importable.forEach(r => {
            const abs = { id: DB.uid('ABS'), debut: r.debut, fin: r.fin, motif: r.motif, note: r.note };
            if (!r.personne.absences) r.personne.absences = [];
            r.personne.absences.push(abs);
            DB.logAudit('create','absence',abs.id,r.prenom+' '+r.nomP+' (import)');
          });
          let newPersonsCount = 0;
          document.querySelectorAll('.ab-unknown-cb:checked').forEach(cb => {
            const r = parsed[+cb.dataset.idx];
            const newPers = {
              id: DB.uid('P'), prenom: r.prenom, nom: r.nomP, role: '—',
              competences: [], capaciteHebdo: 35, couleur: '#888',
              horaires: defaultHoraires(), pendingValidation: true,
            };
            s.personnes.push(newPers);
            const abs = { id: DB.uid('ABS'), debut: r.debut, fin: r.fin, motif: r.motif, note: r.note };
            newPers.absences = [abs];
            DB.logAudit('create','absence',abs.id, r.prenom+' '+r.nomP+' (import — à valider)');
            newPersonsCount++;
          });
          DB.save(); App.closeModal(); App.refresh();
          App.toast(`${importable.length} absence(s) importée(s)${newPersonsCount ? ` · ${newPersonsCount} personne(s) créée(s) — À valider` : ''}`, 'success');
        };
      } catch(err) { App.toast('Erreur : ' + err.message, 'error'); }
    };
    reader.readAsText(file, 'UTF-8');
  },
};
