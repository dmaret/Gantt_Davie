App.views.machines = {
  state: { search:'', typeFilter:'', lieuFilter:'', onlyConflicts:false },
  render(root) {
    const s = DB.state;
    const types = Array.from(new Set(s.machines.map(m => m.type))).sort();
    const lieuxProd = s.lieux.filter(l => l.type === 'production');
    root.innerHTML = `
      <div class="toolbar">
        <input type="search" id="m-search" placeholder="Rechercher machine...">
        <select id="m-type"><option value="">Tous types</option>${types.map(t=>`<option value="${t}">${t}</option>`).join('')}</select>
        <select id="m-lieu"><option value="">Tous lieux</option>${lieuxProd.map(l=>`<option value="${l.id}">${l.nom}</option>`).join('')}</select>
        <label class="small"><input type="checkbox" id="m-conf"> Seulement conflits</label>
        <span class="spacer"></span>
        <input type="file" id="m-import-file" accept=".csv,.json" hidden>
        <button class="btn-ghost" id="m-tpl" data-perm="admin">⬇ Modèle</button>
        <button class="btn-ghost" id="m-import" data-perm="admin">⬆ Importer</button>
        <button class="btn-ghost" id="m-csv">⤓ Exporter CSV</button>
        <button class="btn" id="m-add">+ Ajouter une machine</button>
      </div>
      <div class="card"><div id="m-table"></div></div>
    `;
    document.getElementById('m-search').oninput = e => { this.state.search = e.target.value.toLowerCase(); this.draw(); };
    document.getElementById('m-type').onchange = e => { this.state.typeFilter = e.target.value; this.draw(); };
    document.getElementById('m-lieu').onchange = e => { this.state.lieuFilter = e.target.value; this.draw(); };
    document.getElementById('m-conf').onchange = e => { this.state.onlyConflicts = e.target.checked; this.draw(); };
    document.getElementById('m-add').onclick = () => this.openForm(null);
    document.getElementById('m-tpl').onclick = () => this.downloadTemplate();
    document.getElementById('m-import').onclick = () => document.getElementById('m-import-file').click();
    document.getElementById('m-import-file').onchange = e => { if (e.target.files[0]) this.importFile(e.target.files[0]); e.target.value = ''; };
    document.getElementById('m-csv').onclick = () => {
      const conflicts = App.detectConflicts();
      const conflSet = new Set(conflicts.machines.map(c => c.machineId));
      const head = ['Nom','Type','Lieu de production','Capacité (h/j)','Tâches 7j','Charge j-h','Capacité j-h','Utilisation %','Conflit'];
      const rows = [head];
      const today = D.today();
      const end = D.addWorkdays(today, 6);
      DB.state.machines.forEach(m => {
        const lieu = DB.lieu(m.lieuId);
        const tasks = DB.state.taches.filter(t => t.machineId === m.id && t.fin >= today && t.debut <= end);
        const jours = tasks.reduce((n,t) => {
          const a = t.debut < today ? today : t.debut;
          const b = t.fin > end ? end : t.fin;
          return n + D.workdaysBetween(a, b);
        }, 0);
        const capa = m.capaciteJour ? (m.capaciteJour/8) * 7 : 7;
        const pct = capa ? Math.min(999, Math.round(jours / capa * 100)) : 0;
        rows.push([m.nom, m.type, lieu?lieu.nom:'', m.capaciteJour, tasks.length, jours, Math.round(capa*10)/10, pct, conflSet.has(m.id)?'OUI':'']);
      });
      CSV.download('machines-' + D.today() + '.csv', rows);
      App.toast('Export CSV téléchargé','success');
    };
    this.draw();
  },
  draw() {
    const st = this.state, s = DB.state;
    const conflicts = App.detectConflicts();
    const conflSet = new Set(conflicts.machines.map(c => c.machineId));
    const today = D.today();
    const end = D.addWorkdays(today, 6); // 7 jours ouvrés (j0 + 6)

    let list = s.machines.slice();
    if (st.search) list = list.filter(m => (m.nom + ' ' + m.type).toLowerCase().includes(st.search));
    if (st.typeFilter) list = list.filter(m => m.type === st.typeFilter);
    if (st.lieuFilter) list = list.filter(m => m.lieuId === st.lieuFilter);
    if (st.onlyConflicts) list = list.filter(m => conflSet.has(m.id));

    const rows = list.map(m => {
      const lieu = DB.lieu(m.lieuId);
      const tasks = s.taches.filter(t => t.machineId === m.id && t.fin >= today && t.debut <= end)
                            .sort((a,b) => a.debut.localeCompare(b.debut));
      const jours = tasks.reduce((n,t) => {
        const a = t.debut < today ? today : t.debut;
        const b = t.fin > end ? end : t.fin;
        return n + D.workdaysBetween(a, b);
      }, 0);
      const capa = m.capaciteJour ? (m.capaciteJour/8) * 7 : 7; // en jours-homme sur 7 jours ouvrés
      const pct = capa ? Math.min(100, Math.round(jours / capa * 100)) : 0;
      const cls = pct > 90 ? 'bad' : pct > 70 ? 'warn' : '';
      const projChips = Array.from(new Set(tasks.map(t => t.projetId))).map(pid => {
        const p = DB.projet(pid); return p ? `<span class="chip" style="background:${p.couleur}22;color:${p.couleur}">${p.code}</span>` : '';
      }).join('');
      const confBadge = conflSet.has(m.id) ? '<span class="badge bad">conflit</span>' : '';
      return `<tr data-id="${m.id}" style="cursor:pointer">
        <td><strong>${m.nom}</strong> ${confBadge}</td>
        <td>${m.type}</td>
        <td>${lieu?lieu.nom:'—'} <span class="muted small">${lieu?'· '+lieu.etage:''}</span></td>
        <td class="right">${m.capaciteJour} j-h/j</td>
        <td class="right">${tasks.length}</td>
        <td><div class="bar-inline ${cls}"><div class="fill" style="width:${pct}%"></div></div></td>
        <td class="right">${pct}%</td>
        <td>${projChips || '<span class="muted small">—</span>'}</td>
      </tr>`;
    }).join('');
    document.getElementById('m-table').innerHTML = `
      <table class="data">
        <thead><tr><th>Machine</th><th>Type</th><th>Lieu</th><th class="right">Capacité</th><th class="right">Tâches 7j</th><th>Charge</th><th class="right">%</th><th>Projets</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="muted small" style="margin-top:10px">${list.length} machine(s) · charge calculée sur 7 jours ouvrés</p>
    `;
    document.querySelectorAll('#m-table tbody tr').forEach(tr => tr.onclick = () => this.openForm(tr.dataset.id));
  },
  downloadTemplate() {
    CSV.download('modele-import-machines.csv', [
      ['Nom','Type','Lieu de production','Capacité (h/j)'],
      ['CNC 3','CNC','Atelier 2A','8'],
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
          const nom = r['nom'] || '';
          const type = r['type'] || '';
          const capa = parseFloat(r['capacite (h/j)'] || r['capacite'] || r['capacité (h/j)'] || 8);
          const lieuNom = norm(r['lieu de production'] || r['lieu'] || '');
          const lieu = s.lieux.find(l => l.type === 'production' && norm(l.nom) === lieuNom);
          const existing = s.machines.find(m => norm(m.nom) === norm(nom));
          return { nom, type, capa, lieuId: lieu?.id || null, lieuNom, existing };
        }).filter(r => r.nom);
        if (!parsed.length) { App.toast('Aucune machine à importer','warn'); return; }
        const creates = parsed.filter(r => !r.existing).length;
        const updates = parsed.filter(r => r.existing).length;
        const body = `<p class="muted small">${creates} à créer · ${updates} à mettre à jour</p>
          <table class="data"><thead><tr><th>Nom</th><th>Type</th><th>Lieu</th><th>Cap.</th><th>Statut</th></tr></thead><tbody>
          ${parsed.map(r => `<tr><td>${r.nom}</td><td>${r.type}</td>
            <td class="${r.lieuId?'':'warn'}">${r.lieuNom||'—'}${r.lieuId?'':' ⚠'}</td>
            <td>${r.capa}h/j</td>
            <td><span class="badge ${r.existing?'warn':'good'}">${r.existing?'màj':'nouveau'}</span></td></tr>`).join('')}
          </tbody></table>`;
        const foot = `<button class="btn btn-secondary" onclick="App.closeModal()">Annuler</button>
          <button class="btn" id="m-import-ok">Importer (${parsed.length})</button>`;
        App.openModal('Aperçu import — Machines', body, foot);
        document.getElementById('m-import-ok').onclick = () => {
          let created = 0, updated = 0;
          parsed.forEach(r => {
            if (r.existing) {
              if (r.type) r.existing.type = r.type;
              r.existing.capaciteJour = r.capa;
              if (r.lieuId) r.existing.lieuId = r.lieuId;
              updated++;
            } else {
              const m = { id: DB.uid('M'), nom: r.nom, type: r.type, capaciteJour: r.capa, lieuId: r.lieuId || s.lieux.find(l=>l.type==='production')?.id };
              s.machines.push(m);
              created++;
            }
          });
          DB.save(); App.closeModal(); App.refresh();
          App.toast(`${created} créée(s) · ${updated} mise(s) à jour`, 'success');
        };
      } catch(err) { App.toast('Erreur : ' + err.message, 'error'); }
    };
    reader.readAsText(file, 'UTF-8');
  },

  openForm(id) {
    const isNew = !id;
    const s = DB.state;
    const m = id ? DB.machine(id) : { id: DB.uid('M'), nom:'', type:'', lieuId: s.lieux.find(l=>l.type==='production').id, capaciteJour:8 };
    const lieuxProd = s.lieux.filter(l => l.type === 'production');

    // Conflits éventuels pour cette machine
    const conflictsAll = isNew ? [] : App.detectConflicts().machines.filter(c => c.machineId === id);
    const conflictTids = new Set(conflictsAll.flatMap(c => [c.t1, c.t2]));

    const tachesMachine = id ? s.taches.filter(t => t.machineId === id).sort((a,b) => a.debut.localeCompare(b.debut)) : [];

    // Autres machines disponibles (pour réaffectation)
    const autresMachines = s.machines.filter(x => x.id !== id);

    // Bloc conflits
    const conflictsHTML = conflictsAll.length ? `
      <div class="field">
        <label style="color:var(--danger)">⚠ ${conflictsAll.length} conflit(s) détecté(s)</label>
        <ul class="list" style="margin:4px 0 0 0;gap:8px">
          ${conflictsAll.map((c, ci) => {
            const t1 = DB.tache(c.t1), t2 = DB.tache(c.t2);
            const p1 = t1 && DB.projet(t1.projetId), p2 = t2 && DB.projet(t2.projetId);
            const dur = t => D.workdaysBetween(t.debut, t.fin);
            const machOpts = autresMachines.map(x => `<option value="${x.id}">${x.nom} (${x.type})</option>`).join('');
            const taskRow = (t, p, idx) => t ? `
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:4px 0">
                <div style="flex:1;min-width:0">
                  <strong>${t.nom}</strong> <span class="muted small">${p?p.code:''}</span>
                  <span class="small muted"> · ${D.fmt(t.debut)} → ${D.fmt(t.fin)} · ${dur(t)} j. ouvrés</span>
                </div>
                <button class="btn btn-secondary conf-shift" data-tid="${t.id}" data-ci="${ci}" data-other="${idx===0?c.t2:c.t1}" style="white-space:nowrap;font-size:11px;padding:3px 8px" title="Décaler cette tâche juste après l'autre">⏩ Décaler</button>
                <select class="conf-machine-sel" data-tid="${t.id}" style="font-size:12px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface)">
                  <option value="">— changer machine —</option>
                  ${machOpts}
                </select>
              </div>` : '';
            return `<li style="background:var(--danger-bg,#fff5f5);border-radius:6px;padding:8px 12px;flex-direction:column;align-items:stretch">
              ${taskRow(t1, p1, 0)}
              <div class="muted small" style="text-align:center;padding:2px 0;border-top:1px dashed var(--border);border-bottom:1px dashed var(--border);margin:2px 0">↕ chevauchement</div>
              ${taskRow(t2, p2, 1)}
            </li>`;
          }).join('')}
        </ul>
      </div>` : '';

    const nonConflictTaches = tachesMachine.filter(t => !conflictTids.has(t.id));
    const tachesHTML = nonConflictTaches.length ? `
      <div class="field"><label>Autres tâches affectées (${nonConflictTaches.length})</label>
        <ul class="list" style="max-height:140px;overflow:auto">
          ${nonConflictTaches.map(t => {
            const p = DB.projet(t.projetId);
            return `<li><div><strong>${t.nom}</strong> · <span class="muted small">${p?p.code:''}</span>
              <div class="small muted">${D.fmt(t.debut)} → ${D.fmt(t.fin)}</div></div></li>`;
          }).join('')}
        </ul>
      </div>` : '';

    const body = `
      <div class="field"><label>Nom</label><input id="mf-nom" value="${m.nom||''}"></div>
      <div class="row">
        <div class="field"><label>Type</label><input id="mf-type" value="${m.type||''}" placeholder="CNC, Laser, Soudure..."></div>
        <div class="field"><label>Capacité (heures/jour)</label><input type="number" id="mf-capa" value="${m.capaciteJour||8}"></div>
      </div>
      <div class="field"><label>Lieu de production</label>
        <select id="mf-lieu">${lieuxProd.map(l=>`<option value="${l.id}" ${l.id===m.lieuId?'selected':''}>${l.nom}</option>`).join('')}</select>
      </div>
      ${conflictsHTML}
      ${tachesHTML}
    `;
    const foot = `${!isNew?'<button class="btn btn-danger" id="mf-del">Supprimer</button>':''}<span class="spacer" style="flex:1"></span>
      <button class="btn btn-secondary" id="mf-cancel">Annuler</button>
      <button class="btn" id="mf-save">${isNew?'Créer':'Enregistrer'}</button>`;
    App.openModal(isNew?'Nouvelle machine':m.nom, body, foot);

    // ⏩ Décaler : déplace la tâche pour qu'elle commence juste après l'autre
    document.querySelectorAll('.conf-shift').forEach(btn => {
      if (!App.can('edit')) { btn.disabled = true; return; }
      btn.onclick = () => {
        const t = DB.tache(btn.dataset.tid);
        const other = DB.tache(btn.dataset.other);
        if (!t || !other) return;
        // La tâche à décaler démarre le jour ouvré après la fin de l'autre
        const newDebut = D.addWorkdays(other.fin, 1);
        const dur = D.workdaysBetween(t.debut, t.fin);
        t.debut = newDebut;
        t.fin   = D.addWorkdays(newDebut, Math.max(0, dur - 1));
        DB.logAudit('update','tache',t.id,t.nom+' (décalée — résolution conflit machine)');
        DB.save();
        App.toast(`"${t.nom}" décalée au ${D.fmt(t.debut)}`, 'success');
        App.closeModal();
        this.openForm(id); // rouvre la modale mise à jour
      };
    });

    // Changement de machine
    document.querySelectorAll('.conf-machine-sel').forEach(sel => {
      if (!App.can('edit')) { sel.disabled = true; return; }
      sel.onchange = () => {
        if (!sel.value) return;
        const t = DB.tache(sel.dataset.tid);
        if (!t) return;
        const newMach = DB.machine(sel.value);
        if (!confirm(`Réaffecter "${t.nom}" vers "${newMach?.nom}" ?`)) { sel.value = ''; return; }
        t.machineId = sel.value;
        DB.logAudit('update','tache',t.id,t.nom+' (machine changée — résolution conflit)');
        DB.save();
        App.toast(`Machine de "${t.nom}" changée vers ${newMach?.nom}`, 'success');
        App.closeModal();
        this.openForm(id); // rouvre la modale mise à jour
      };
    });

    document.getElementById('mf-cancel').onclick = () => App.closeModal();
    document.getElementById('mf-save').onclick = () => {
      m.nom = document.getElementById('mf-nom').value.trim();
      m.type = document.getElementById('mf-type').value.trim();
      m.capaciteJour = +document.getElementById('mf-capa').value;
      m.lieuId = document.getElementById('mf-lieu').value;
      if (!m.nom || !m.type) { App.toast('Nom et type requis','error'); return; }
      if (isNew) s.machines.push(m);
      DB.save(); App.closeModal(); App.refresh();
    };
    if (!isNew) document.getElementById('mf-del').onclick = () => {
      const nbTaches = s.taches.filter(t => t.machineId === m.id).length;
      const warn = nbTaches ? ` ${nbTaches} tâche(s) perdront leur machine.` : '';
      if (!confirm('Supprimer cette machine ?' + warn)) return;
      s.machines = s.machines.filter(y => y.id !== m.id);
      s.taches.forEach(t => { if (t.machineId === m.id) t.machineId = null; });
      DB.save(); App.closeModal(); App.refresh();
    };
  },
};
