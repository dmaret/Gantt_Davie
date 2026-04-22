// Vue Équipes : cartographie par activité, slots de compétences, affectation auto
App.views.equipes = {
  render(root) {
    const s = DB.state;
    root.innerHTML = `
      <div class="toolbar">
        <strong>Équipes</strong>
        <span class="muted small">Définir les équipes de production avec leurs slots de compétences</span>
        <span class="spacer"></span>
        <button class="btn ${App.can('edit')?'':'hidden'}" id="eq-add" ${App.can('edit')?'':'style="display:none"'}>+ Nouvelle équipe</button>
      </div>
      <div class="grid grid-3" id="eq-cards"></div>
    `;
    const addBtn = document.getElementById('eq-add');
    if (addBtn) addBtn.onclick = () => this.openForm(null);
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

  openForm(id) {
    if (!App.can('edit')) { App.toast("Lecture seule pour ton groupe", 'error'); return; }
    const s = DB.state;
    const isNew = !id;
    const eq = id ? s.equipes.find(x => x.id === id) : { id: DB.uid('EQ'), nom:'', couleur:'#2c5fb3', slots:[] };
    const allComps = [...new Set(s.personnes.flatMap(p => p.competences||[]))].sort();
    const slotsHtml = (eq.slots||[]).map((sl,i) => this.slotRow(sl, i, allComps)).join('');
    const body = `
      <div class="row">
        <div class="field"><label>Nom</label><input id="ef-nom" value="${eq.nom||''}"></div>
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

    const slotsEl = document.getElementById('ef-slots');
    document.getElementById('ef-add-slot').onclick = () => {
      const newSl = { competence: allComps[0]||'', n: 1 };
      eq.slots = eq.slots || [];
      eq.slots.push(newSl);
      slotsEl.insertAdjacentHTML('beforeend', this.slotRow(newSl, eq.slots.length-1, allComps));
    };
    document.getElementById('ef-cancel').onclick = () => App.closeModal();
    document.getElementById('ef-save').onclick = () => {
      eq.nom = document.getElementById('ef-nom').value.trim();
      eq.couleur = document.getElementById('ef-color').value;
      if (!eq.nom) { App.toast('Nom requis','error'); return; }
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
          // Dispo sur la période ? Au moins une demi-journée travaillée sur [debut, fin]
          const h = p.horaires || defaultHoraires();
          let dispoDJ = 0;
          let cur = tacheDebut;
          while (cur <= tacheFin) {
            const dow = JOURS_SEMAINE[(D.parse(cur).getUTCDay()+6)%7];
            if (h[dow]?.matin) dispoDJ++;
            if (h[dow]?.aprem) dispoDJ++;
            cur = D.addDays(cur, 1);
          }
          // Déjà occupé·e sur d'autres tâches ?
          const conflicts = s.taches.filter(t => (t.assignes||[]).includes(p.id) && t.fin >= tacheDebut && t.debut <= tacheFin).length;
          const libre = conflicts === 0;
          const score = (libre ? 100 : 0) + dispoDJ * 2 - conflicts * 10;
          return { p, score, dispoDJ, libre, conflicts };
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
