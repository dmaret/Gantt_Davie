App.views.personnes = {
  state: { search:'', roleFilter:'', lieuFilter:'' },
  render(root) {
    const s = DB.state;
    root.innerHTML = `
      <div class="toolbar">
        <input type="search" id="p-search" placeholder="Rechercher nom, rôle, compétence...">
        <select id="p-role"><option value="">Tous rôles</option>${[...new Set(s.personnes.map(p=>p.role))].map(r=>`<option>${r}</option>`).join('')}</select>
        <select id="p-lieu"><option value="">Tous lieux</option>${s.lieux.filter(l=>l.type==='production').map(l=>`<option value="${l.id}">${l.nom}</option>`).join('')}</select>
        <span class="spacer"></span>
        <button class="btn" id="p-add">+ Ajouter une personne</button>
      </div>
      <div class="card"><div id="p-table"></div></div>
    `;
    document.getElementById('p-search').oninput = e => { this.state.search = e.target.value.toLowerCase(); this.draw(); };
    document.getElementById('p-role').onchange = e => { this.state.roleFilter = e.target.value; this.draw(); };
    document.getElementById('p-lieu').onchange = e => { this.state.lieuFilter = e.target.value; this.draw(); };
    document.getElementById('p-add').onclick = () => this.openForm(null);
    this.draw();
  },
  draw() {
    const st = this.state, s = DB.state;
    let list = s.personnes.slice();
    if (st.search) list = list.filter(p => (p.prenom+' '+p.nom+' '+p.role+' '+(p.competences||[]).join(' ')).toLowerCase().includes(st.search));
    if (st.roleFilter) list = list.filter(p => p.role === st.roleFilter);
    if (st.lieuFilter) list = list.filter(p => p.lieuPrincipalId === st.lieuFilter);

    const today = D.today();
    // Charge sur 4 semaines glissantes
    const weeks = [];
    let weekStart = today;
    for (let w=0; w<4; w++) {
      const weekEnd = D.addWorkdays(weekStart, 4);
      weeks.push({ start: weekStart, end: weekEnd });
      weekStart = D.addWorkdays(weekEnd, 1);
    }
    const rows = list.map(p => {
      const ts = s.taches.filter(t => (t.assignes||[]).includes(p.id));
      const perWeek = weeks.map(w => {
        const inW = ts.filter(t => t.fin >= w.start && t.debut <= w.end);
        const h = inW.reduce((n,t) => n + (D.weekdaysBetween(t.debut > w.start ? t.debut : w.start, t.fin < w.end ? t.fin : w.end)) * 7, 0);
        const pct = Math.min(100, Math.round(h / p.capaciteHebdo * 100));
        return { h, pct };
      });
      const totalH = perWeek.reduce((n,w) => n + w.h, 0);
      const avgPct = Math.round(perWeek.reduce((n,w) => n + w.pct, 0) / weeks.length);
      const tsNow = ts.filter(t => t.fin >= today && t.debut <= D.addWorkdays(today, 4));
      const cells = perWeek.map(w => {
        const cls = w.pct > 95 ? 'bad' : w.pct > 80 ? 'warn' : '';
        return `<div class="bar-inline ${cls}" title="${w.h}h"><div class="fill" style="width:${w.pct}%"></div></div>`;
      }).join('');
      const avgCls = avgPct > 95 ? 'bad' : avgPct > 80 ? 'warn' : '';
      const h = p.horaires || defaultHoraires();
      const canEdit = App.can('edit');
      const hMini = `<div class="horaires-mini" title="${canEdit?'Clic pour basculer matin/après-midi':'Profil de travail hebdomadaire'}">${JOURS_SEMAINE.map((j,i) => {
        const atts = (slot) => canEdit ? `data-pid="${p.id}" data-jour="${j}" data-slot="${slot}"` : '';
        const cls = (on) => `h-slot ${on?'on':''} ${canEdit?'clickable':''}`;
        return `<div class="h-day"><div class="h-label">${JOURS_COURT[i]}</div><div class="${cls(h[j]?.matin)}" ${atts('matin')} title="${j} matin"></div><div class="${cls(h[j]?.aprem)}" ${atts('aprem')} title="${j} après-midi"></div></div>`;
      }).join('')}</div>`;
      return `<tr data-id="${p.id}">
        <td><strong class="p-name" style="cursor:pointer">${App.personneLabel(p)}</strong></td>
        <td>${p.role}</td>
        <td><span class="muted">${DB.lieu(p.lieuPrincipalId)?.nom || '—'}</span></td>
        <td>${(p.competences||[]).map(c => `<span class="chip">${c}</span>`).join('')}</td>
        <td>${hMini}</td>
        <td>${tsNow.length}</td>
        <td><div style="display:flex;gap:3px">${cells}</div></td>
        <td class="right"><span class="badge ${avgCls==='bad'?'bad':avgCls==='warn'?'warn':'good'}">${avgPct}%</span></td>
        <td><button class="btn-ghost p-semaine" data-id="${p.id}" title="Ma semaine">📅</button></td>
      </tr>`;
    }).join('');

    document.getElementById('p-table').innerHTML = `
      <table class="data">
        <thead><tr><th>Personne</th><th>Rôle</th><th>Lieu principal</th><th>Compétences</th><th title="Profil hebdo (L M M J V S D × matin/aprem)">Horaires</th><th>Tâches 7j</th><th>Charge 4 semaines</th><th class="right">Moy.</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="muted small" style="margin-top:10px">${list.length} personne(s) · carrés pleins = dispo · 📅 = planning personnel</p>
    `;
    document.querySelectorAll('#p-table tbody .p-name').forEach(el => el.onclick = () => this.openForm(el.closest('tr').dataset.id));
    document.querySelectorAll('#p-table tbody .p-semaine').forEach(b => b.onclick = e => { e.stopPropagation(); this.openSemaine(b.dataset.id); });
    document.querySelectorAll('#p-table tbody .h-slot.clickable').forEach(el => {
      el.onclick = e => {
        e.stopPropagation();
        const p = DB.personne(el.dataset.pid);
        if (!p) return;
        if (!p.horaires) p.horaires = defaultHoraires();
        const j = el.dataset.jour, sl = el.dataset.slot;
        if (!p.horaires[j]) p.horaires[j] = { matin:false, aprem:false };
        p.horaires[j][sl] = !p.horaires[j][sl];
        DB.save();
        el.classList.toggle('on');
      };
    });
  },

  openSemaine(id) {
    const p = DB.personne(id);
    if (!p) return;
    const s = DB.state;
    const today = D.today();
    const weekEnd = D.addWorkdays(today, 4);
    const nextWeekStart = D.addWorkdays(weekEnd, 1);
    const nextWeekEnd = D.addWorkdays(nextWeekStart, 4);

    const mkRange = (a, b) => {
      const ts = s.taches.filter(t => (t.assignes||[]).includes(p.id) && t.fin >= a && t.debut <= b)
        .sort((x,y) => x.debut.localeCompare(y.debut));
      const deps = s.deplacements.filter(d => d.personneId === p.id && d.date >= a && d.date <= b)
        .sort((x,y) => x.date.localeCompare(y.date));
      const heures = ts.reduce((n,t) => n + D.workdaysBetween(t.debut > a ? t.debut : a, t.fin < b ? t.fin : b) * 7, 0);
      return { ts, deps, heures };
    };
    const cette = mkRange(today, weekEnd);
    const prochaine = mkRange(nextWeekStart, nextWeekEnd);

    const renderBloc = (label, a, b, r) => {
      const pct = Math.min(100, Math.round(r.heures / p.capaciteHebdo * 100));
      const cls = pct > 95 ? 'bad' : pct > 80 ? 'warn' : 'good';
      const tItems = r.ts.length ? r.ts.map(t => {
        const prj = DB.projet(t.projetId);
        const lieu = DB.lieu(t.lieuId);
        return `<li><span class="badge" style="background:${prj?prj.couleur+'33':''};color:${prj?prj.couleur:''}">${prj?prj.code:''}</span> <strong>${t.nom}</strong> <span class="muted small">· ${D.fmt(t.debut)}→${D.fmt(t.fin)} · ${lieu?lieu.nom:'—'}</span></li>`;
      }).join('') : '<li class="muted">Aucune tâche.</li>';
      const dItems = r.deps.length ? r.deps.map(d => {
        const o = DB.lieu(d.origineId), de = DB.lieu(d.destinationId);
        return `<li>🚚 ${D.fmt(d.date)} · ${d.motif} · ${o?o.nom:'—'} → ${de?de.nom:'—'} · ${d.duree}</li>`;
      }).join('') : '';
      return `<div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <h3 style="margin:0">${label}</h3>
          <div style="display:flex;gap:8px;align-items:center">
            <span class="muted small">${D.fmt(a)} → ${D.fmt(b)}</span>
            <span class="badge ${cls}">${r.heures}h / ${p.capaciteHebdo}h (${pct}%)</span>
          </div>
        </div>
        <div class="bar-inline ${cls}"><div class="fill" style="width:${pct}%"></div></div>
        <h4 style="margin:10px 0 4px 0">Tâches (${r.ts.length})</h4>
        <ul class="list">${tItems}</ul>
        ${r.deps.length ? `<h4 style="margin:10px 0 4px 0">Déplacements (${r.deps.length})</h4><ul class="list">${dItems}</ul>` : ''}
      </div>`;
    };

    const body = `
      <div class="muted small" style="margin-bottom:10px">${p.role} · ${DB.lieu(p.lieuPrincipalId)?.nom || '—'} · Capacité ${p.capaciteHebdo}h/sem · Compétences : ${(p.competences||[]).join(', ')||'—'}</div>
      ${renderBloc('Cette semaine', today, weekEnd, cette)}
      ${renderBloc('Semaine prochaine', nextWeekStart, nextWeekEnd, prochaine)}
    `;
    const foot = `<button class="btn btn-secondary" onclick="window.print()">⎙ Imprimer</button><span class="spacer" style="flex:1"></span><button class="btn" onclick="App.closeModal()">Fermer</button>`;
    App.openModal('Ma semaine — ' + App.personneLabel(p), body, foot);
  },
  openForm(id) {
    const isNew = !id;
    const s = DB.state;
    const firstProdLieu = s.lieux.find(l => l.type === 'production') || s.lieux[0];
    const p = id ? DB.personne(id) : {
      id: DB.uid('P'), prenom:'', nom:'', role:'Technicien·ne', lieuPrincipalId: firstProdLieu?.id, competences:[], capaciteHebdo:35, couleur:'#2c5fb3', horaires: defaultHoraires(),
    };
    if (!p.horaires) p.horaires = defaultHoraires();
    const allComps = ['CNC','Laser','Pliage','Soudure','Peinture','Montage','Contrôle','Élec','CAO','Logistique','Management','Qualité'];
    const horairesGrid = `
      <table class="horaires-editor">
        <thead><tr><th></th>${JOURS_SEMAINE.map((j,i) => `<th>${j.slice(0,3)}</th>`).join('')}</tr></thead>
        <tbody>
          <tr><td class="right muted small">Matin</td>${JOURS_SEMAINE.map(j => `<td><label class="h-tog"><input type="checkbox" data-jour="${j}" data-slot="matin" ${p.horaires[j]?.matin?'checked':''}></label></td>`).join('')}</tr>
          <tr><td class="right muted small">Après-midi</td>${JOURS_SEMAINE.map(j => `<td><label class="h-tog"><input type="checkbox" data-jour="${j}" data-slot="aprem" ${p.horaires[j]?.aprem?'checked':''}></label></td>`).join('')}</tr>
        </tbody>
      </table>
      <div class="muted small" style="margin-top:4px">Cocher = travaille sur cette demi-journée. Total : <span id="pf-dj">${horairesDemiJournees(p.horaires)}</span> demi-journées/semaine.</div>
    `;
    const body = `
      <div class="row">
        <div class="field"><label>Prénom</label><input id="pf-prenom" value="${p.prenom||''}"></div>
        <div class="field"><label>Nom</label><input id="pf-nom" value="${p.nom||''}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Rôle</label><input id="pf-role" value="${p.role||''}"></div>
        <div class="field"><label>Capacité hebdo (h)</label><input type="number" id="pf-capa" value="${p.capaciteHebdo||35}"></div>
      </div>
      <div class="field"><label>Lieu principal</label>
        <select id="pf-lieu">${s.lieux.filter(l=>l.type==='production').map(l=>`<option value="${l.id}" ${l.id===p.lieuPrincipalId?'selected':''}>${l.nom}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Compétences (Ctrl/Cmd)</label>
        <select id="pf-comps" multiple size="6">
          ${allComps.map(c => `<option value="${c}" ${(p.competences||[]).includes(c)?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Profil de travail hebdomadaire</label>${horairesGrid}</div>
    `;
    const foot = `
      ${!isNew?'<button class="btn btn-danger" id="pf-del">Supprimer</button>':''}
      <span class="spacer" style="flex:1"></span>
      <button class="btn btn-secondary" id="pf-cancel">Annuler</button>
      <button class="btn" id="pf-save">${isNew?'Créer':'Enregistrer'}</button>
    `;
    App.openModal(isNew?'Nouvelle personne':App.personneLabel(p), body, foot);
    document.getElementById('pf-cancel').onclick = () => App.closeModal();
    // Live recount des demi-journées
    document.querySelectorAll('.horaires-editor input[data-jour]').forEach(cb => cb.onchange = () => {
      const h = {};
      JOURS_SEMAINE.forEach(j => h[j] = { matin:false, aprem:false });
      document.querySelectorAll('.horaires-editor input[data-jour]').forEach(x => { if (x.checked) h[x.dataset.jour][x.dataset.slot] = true; });
      document.getElementById('pf-dj').textContent = horairesDemiJournees(h);
    });
    document.getElementById('pf-save').onclick = () => {
      p.prenom = document.getElementById('pf-prenom').value.trim();
      p.nom    = document.getElementById('pf-nom').value.trim();
      p.role   = document.getElementById('pf-role').value.trim();
      p.capaciteHebdo = +document.getElementById('pf-capa').value;
      p.lieuPrincipalId = document.getElementById('pf-lieu').value;
      p.competences = Array.from(document.getElementById('pf-comps').selectedOptions).map(o=>o.value);
      const horaires = {};
      JOURS_SEMAINE.forEach(j => horaires[j] = { matin:false, aprem:false });
      document.querySelectorAll('.horaires-editor input[data-jour]').forEach(cb => { if (cb.checked) horaires[cb.dataset.jour][cb.dataset.slot] = true; });
      p.horaires = horaires;
      if (!p.prenom || !p.nom) { App.toast('Prénom et nom requis','error'); return; }
      if (isNew) s.personnes.push(p);
      DB.save(); App.closeModal(); App.toast('Enregistré','success'); App.refresh();
    };
    if (!isNew) {
      document.getElementById('pf-del').onclick = () => {
        if (!confirm('Supprimer cette personne ? Ses affectations de tâches seront retirées.')) return;
        s.personnes = s.personnes.filter(x => x.id !== p.id);
        s.taches.forEach(t => t.assignes = (t.assignes||[]).filter(a => a !== p.id));
        DB.save(); App.closeModal(); App.toast('Supprimée','info'); App.refresh();
      };
    }
  },
};
