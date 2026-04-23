// Vue Équipes : cartographie par activité, slots de compétences, affectation auto
App.views.equipes = {
  render(root) {
    const s = DB.state;
    root.innerHTML = `
      <div class="toolbar">
        <strong>Équipes</strong>
        <span class="muted small">Définir les équipes de production avec leurs slots de compétences</span>
        <span class="spacer"></span>
        <input type="file" id="eq-import-file" accept=".csv,.json" hidden>
        <button class="btn-ghost" id="eq-tpl" data-perm="edit">⬇ Modèle</button>
        <button class="btn-ghost" id="eq-import" data-perm="edit">⬆ Importer</button>
        <button class="btn-ghost" id="eq-csv">⤓ Exporter CSV</button>
        <button class="btn ${App.can('edit')?'':'hidden'}" id="eq-add" ${App.can('edit')?'':'style="display:none"'}>+ Nouvelle équipe</button>
      </div>
      <div class="grid grid-3" id="eq-cards"></div>
    `;
    const addBtn = document.getElementById('eq-add');
    if (addBtn) addBtn.onclick = () => this.openForm(null);
    document.getElementById('eq-csv').onclick = () => this.exportCSV();
    document.getElementById('eq-tpl').onclick = () => this.downloadTemplate();
    document.getElementById('eq-import').onclick = () => document.getElementById('eq-import-file').click();
    document.getElementById('eq-import-file').onchange = e => { if (e.target.files[0]) this.importFile(e.target.files[0]); e.target.value = ''; };
    this.draw();
  },

  draw() {
    const s = DB.state;
    const eqs = s.equipes || [];
    const cards = eqs.map(eq => {
      const total = (eq.slots||[]).reduce((n,sl) => n + sl.n, 0);
      const slotsHtml = (eq.slots||[]).map(sl => {
        const candidats = s.personnes.filter(p => (p.competences||[]).includes(sl.competence));
        return `<div class="eq-slot">
          <span class="eq-slot-count">×${sl.n}</span>
          <strong>${sl.competence}</strong>
          <span class="muted small"> · ${candidats.length} personne(s) avec cette compétence</span>
        </div>`;
      }).join('');
      return `<div class="card eq-card" data-id="${eq.id}" style="cursor:pointer;border-left:4px solid ${eq.couleur||'#888'}">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div>
            <h3 style="margin:0">${eq.nom}</h3>
            <div class="muted small">${total} personne(s) · ${(eq.slots||[]).length} compétence(s)</div>
          </div>
          <span class="badge" style="background:${eq.couleur}22;color:${eq.couleur}">${eq.id}</span>
        </div>
        <div style="margin-top:10px">${slotsHtml || '<span class="muted small">Aucun slot défini.</span>'}</div>
      </div>`;
    }).join('');
    document.getElementById('eq-cards').innerHTML = cards || '<p class="muted">Aucune équipe. Clic sur « + Nouvelle équipe » pour commencer.</p>';
    document.querySelectorAll('.eq-card').forEach(c => c.onclick = () => this.openForm(c.dataset.id));
  },

  exportCSV() {
    const rows = [['Nom équipe','Couleur (#hex)','Compétence','Nombre']];
    (DB.state.equipes||[]).forEach(eq => {
      if (!(eq.slots||[]).length) { rows.push([eq.nom, eq.couleur||'', '', '']); return; }
      eq.slots.forEach(sl => rows.push([eq.nom, eq.couleur||'', sl.competence, sl.n]));
    });
    CSV.download('equipes-' + D.today() + '.csv', rows);
    App.toast('Export CSV téléchargé','success');
  },

  downloadTemplate() {
    CSV.download('modele-import-equipes.csv', [
      ['Nom équipe','Couleur (#hex)','Compétence','Nombre'],
      ['Ligne 3','#2c5fb3','Montage','6'],
      ['Ligne 3','#2c5fb3','Contrôle','1'],
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
        // Regrouper par nom d'équipe
        const byNom = {};
        rows.forEach(r => {
          const nom = r['nom equipe'] || r['nom équipe'] || r['nom'] || '';
          if (!nom) return;
          if (!byNom[nom]) byNom[nom] = { nom, couleur: r['couleur (#hex)'] || r['couleur'] || '#888', slots: [] };
          const comp = r['competence'] || r['compétence'] || '';
          const n = parseInt(r['nombre'] || r['n'] || 1) || 1;
          if (comp) byNom[nom].slots.push({ competence: comp, n });
        });
        const s = DB.state;
        const parsed = Object.values(byNom).map(eq => ({
          ...eq,
          existing: (s.equipes||[]).find(x => x.nom.toLowerCase() === eq.nom.toLowerCase())
        }));
        if (!parsed.length) { App.toast('Aucune équipe à importer','warn'); return; }
        const body = `<p class="muted small">${parsed.filter(r=>!r.existing).length} à créer · ${parsed.filter(r=>r.existing).length} à mettre à jour</p>
          <table class="data"><thead><tr><th>Équipe</th><th>Slots</th><th>Statut</th></tr></thead><tbody>
          ${parsed.map(eq => `<tr>
            <td><span class="badge" style="background:${eq.couleur}22;color:${eq.couleur}">${eq.nom}</span></td>
            <td>${eq.slots.map(sl=>`×${sl.n} ${sl.competence}`).join(', ')||'—'}</td>
            <td><span class="badge ${eq.existing?'warn':'good'}">${eq.existing?'màj':'nouveau'}</span></td>
          </tr>`).join('')}
          </tbody></table>`;
        const foot = `<button class="btn btn-secondary" onclick="App.closeModal()">Annuler</button>
          <button class="btn" id="eq-import-ok">Importer (${parsed.length})</button>`;
        App.openModal('Aperçu import — Équipes', body, foot);
        document.getElementById('eq-import-ok').onclick = () => {
          if (!s.equipes) s.equipes = [];
          let created = 0, updated = 0;
          parsed.forEach(eq => {
            if (eq.existing) {
              eq.existing.couleur = eq.couleur; eq.existing.slots = eq.slots; updated++;
            } else {
              s.equipes.push({ id: DB.uid('EQ'), nom: eq.nom, couleur: eq.couleur, slots: eq.slots });
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
    if (!App.can('edit')) { App.toast("Lecture seule pour ton groupe", 'error'); return; }
    const s = DB.state;
    const isNew = !id;
    const eq = id ? s.equipes.find(x => x.id === id) : { id: DB.uid('EQ'), nom:'', couleur:'#2c5fb3', slots:[] };
    const allComps = [...new Set(s.personnes.flatMap(p => p.competences||[]))].sort();
    const slotsHtml = (eq.slots||[]).map((sl,i) => this.slotRow(sl, i, allComps)).join('');
    const suggestedNames = [
      'Ligne 1','Ligne 2','Ligne 3','Ligne 4',
      'Valmont','Valmont A','Valmont B',
      'Logistique 1','Logistique 2','Logistique 3',
      'Assemblage','Assemblage A','Assemblage B',
      'Montage','Peinture','Soudure',
      'Contrôle qualité','Maintenance','Emballage','Expédition',
      'Prototypage','Atelier matières','Réception',
    ];
    const existingNames = new Set((s.equipes||[]).filter(x => x.id !== eq.id).map(x => x.nom.toLowerCase()));
    const body = `
      <div class="row">
        <div class="field"><label>Nom</label>
          <input id="ef-nom" list="ef-nom-suggestions" value="${eq.nom||''}" placeholder="Ligne 1, Logistique 2, Assemblage…">
          <datalist id="ef-nom-suggestions">
            ${suggestedNames.filter(n => !existingNames.has(n.toLowerCase())).map(n => `<option value="${n}">`).join('')}
          </datalist>
          <div id="ef-nom-hint" class="muted small" style="margin-top:4px"></div>
        </div>
        <div class="field"><label>Couleur</label><input type="color" id="ef-color" value="${eq.couleur||'#2c5fb3'}"></div>
      </div>
      <h3 style="margin-top:14px">Slots (compétence × nombre)</h3>
      <div id="ef-slots">${slotsHtml}</div>
      <button class="btn btn-secondary" id="ef-add-slot" style="margin-top:6px">+ Slot</button>
      <p class="muted small" style="margin-top:10px">Chaque slot représente N personnes d'une compétence donnée.</p>
    `;
    const foot = `${!isNew?'<button class="btn btn-danger" id="ef-del">Supprimer</button>':''}<span class="spacer" style="flex:1"></span>
      <button class="btn btn-secondary" id="ef-cancel">Annuler</button>
      <button class="btn" id="ef-save">${isNew?'Créer':'Enregistrer'}</button>`;
    App.openModal(isNew?'Nouvelle équipe':eq.nom, body, foot);

    // Alerte si le nom existe déjà
    const nomInput = document.getElementById('ef-nom');
    const hint = document.getElementById('ef-nom-hint');
    const checkNom = () => {
      const v = nomInput.value.trim().toLowerCase();
      if (v && existingNames.has(v)) {
        hint.innerHTML = '<span class="badge warn">⚠ Nom déjà utilisé par une autre équipe</span>';
      } else {
        hint.innerHTML = '';
      }
    };
    nomInput.oninput = checkNom;
    checkNom();

    const slotsEl = document.getElementById('ef-slots');
    document.getElementById('ef-add-slot').onclick = () => {
      // ⚠ Ne pas muter eq.slots ici — ef-save reconstruit depuis le DOM.
      // Sinon, un Annuler laisserait des slots fantômes dans l'objet state.
      const newSl = { competence: allComps[0]||'', n: 1 };
      slotsEl.insertAdjacentHTML('beforeend', this.slotRow(newSl, -1, allComps));
    };
    document.getElementById('ef-cancel').onclick = () => App.closeModal();
    document.getElementById('ef-save').onclick = () => {
      eq.nom = document.getElementById('ef-nom').value.trim();
      eq.couleur = document.getElementById('ef-color').value;
      if (!eq.nom) { App.toast('Nom requis','error'); return; }
      if (existingNames.has(eq.nom.toLowerCase())) {
        if (!confirm('Une autre équipe porte déjà ce nom. Continuer quand même ?')) return;
      }
      const slots = [];
      document.querySelectorAll('.eq-slot-row').forEach(row => {
        const c = row.querySelector('[data-k="comp"]').value;
        const n = +row.querySelector('[data-k="n"]').value;
        if (c && n > 0) slots.push({ competence: c, n });
      });
      eq.slots = slots;
      if (isNew) s.equipes.push(eq);
      DB.save(); App.closeModal(); App.toast('Équipe enregistrée','success'); App.refresh();
    };
    if (!isNew) document.getElementById('ef-del').onclick = () => {
      if (!confirm('Supprimer ' + eq.nom + ' ?')) return;
      s.equipes = s.equipes.filter(x => x.id !== eq.id);
      DB.save(); App.closeModal(); App.toast('Équipe supprimée','info'); App.refresh();
    };
  },

  slotRow(sl, i, allComps) {
    return `<div class="eq-slot-row row" style="align-items:end;margin-bottom:6px">
      <div class="field" style="flex:3"><label>Compétence</label>
        <select data-k="comp">${allComps.map(c => `<option value="${c}" ${c===sl.competence?'selected':''}>${c}</option>`).join('')}</select>
      </div>
      <div class="field" style="flex:1"><label>Nombre</label><input type="number" data-k="n" min="1" value="${sl.n||1}"></div>
      <button class="btn-ghost" onclick="this.parentElement.remove()" style="margin-bottom:10px">✕</button>
    </div>`;
  },

  // Sélectionne des personnes candidates pour une équipe à une date donnée
  // Retourne { slots: [{ competence, n, candidats:[{p, score, dispo, libre, charge}] }] }
  proposerAffectation(equipeId, tacheDebut, tacheFin) {
    const s = DB.state;
    const eq = s.equipes.find(e => e.id === equipeId);
    if (!eq) return null;
    const usedIds = new Set();
    const slots = (eq.slots||[]).map(sl => {
      let cands = s.personnes
        .filter(p => (p.competences||[]).includes(sl.competence))
        .filter(p => !usedIds.has(p.id))
        .map(p => {
          // Dispo sur la période ? Au moins une demi-journée travaillée sur [debut, fin] (hors absences)
          const h = p.horaires || defaultHoraires();
          let dispoDJ = 0;
          let joursAbsent = 0;
          let cur = tacheDebut;
          while (cur <= tacheFin) {
            const dow = JOURS_SEMAINE[(D.parse(cur).getUTCDay()+6)%7];
            const absent = DB.personneAbsenteLe(p.id, cur);
            if (absent) joursAbsent++;
            else {
              if (h[dow]?.matin) dispoDJ++;
              if (h[dow]?.aprem) dispoDJ++;
            }
            cur = D.addDays(cur, 1);
          }
          // Déjà occupé·e sur d'autres tâches ?
          const conflicts = s.taches.filter(t => (t.assignes||[]).includes(p.id) && t.fin >= tacheDebut && t.debut <= tacheFin).length;
          const libre = conflicts === 0 && joursAbsent === 0;
          const score = (libre ? 100 : 0) + dispoDJ * 2 - conflicts * 10 - joursAbsent * 20;
          return { p, score, dispoDJ, libre, conflicts, joursAbsent };
        })
        .sort((a,b) => b.score - a.score)
        .slice(0, Math.max(sl.n * 2, sl.n + 2)); // garde un peu plus de candidats
      // Pré-sélectionne les n meilleurs
      const selected = cands.slice(0, sl.n);
      selected.forEach(c => usedIds.add(c.p.id));
      return { competence: sl.competence, n: sl.n, candidats: cands, selected };
    });
    return { equipe: eq, slots };
  },
};
