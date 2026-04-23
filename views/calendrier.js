App.views.calendrier = {
  state: { cursor: null, mode:'mois', filterPersonne:'', filterLieu:'' },
  render(root) {
    const st = this.state;
    const today = D.today();
    if (!st.cursor) st.cursor = today.slice(0,7) + '-01';
    const s = DB.state;
    root.innerHTML = `
      <div class="toolbar">
        <strong>Calendrier</strong>
        <button class="btn-ghost" id="cal-prev">◀</button>
        <strong id="cal-month"></strong>
        <button class="btn-ghost" id="cal-next">▶</button>
        <button class="btn-ghost" id="cal-today">Aujourd'hui</button>
        <select id="cal-mode">
          <option value="mois">Vue mois</option>
          <option value="semaine">Vue semaine</option>
        </select>
        <select id="cal-pers"><option value="">Toutes personnes</option>${s.personnes.map(p=>`<option value="${p.id}">${App.personneLabel(p)}</option>`).join('')}</select>
        <select id="cal-lieu"><option value="">Tous lieux</option>${s.lieux.filter(l=>l.type==='production').map(l=>`<option value="${l.id}">${l.nom}</option>`).join('')}</select>
        <span class="spacer"></span>
      </div>
      <div class="card"><div id="cal-body"></div></div>
    `;
    document.getElementById('cal-mode').value = st.mode;
    document.getElementById('cal-prev').onclick = () => { this.shift(-1); };
    document.getElementById('cal-next').onclick = () => { this.shift(1); };
    document.getElementById('cal-today').onclick = () => { st.cursor = D.today(); this.draw(); };
    document.getElementById('cal-mode').onchange = e => { st.mode = e.target.value; this.draw(); };
    document.getElementById('cal-pers').onchange = e => { st.filterPersonne = e.target.value; this.draw(); };
    document.getElementById('cal-lieu').onchange = e => { st.filterLieu = e.target.value; this.draw(); };
    this.draw();
  },
  shift(n) {
    const st = this.state;
    if (st.mode === 'mois') {
      const d = D.parse(st.cursor);
      d.setUTCMonth(d.getUTCMonth() + n);
      st.cursor = D.iso(d);
    } else {
      st.cursor = D.addDays(st.cursor, 7*n);
    }
    this.draw();
  },
  draw() {
    const st = this.state, s = DB.state;
    const mois = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
    const cursor = D.parse(st.cursor);
    document.getElementById('cal-month').textContent = st.mode === 'mois'
      ? mois[cursor.getUTCMonth()] + ' ' + cursor.getUTCFullYear()
      : 'Semaine du ' + D.fmt(this.weekStart(st.cursor));

    let days;
    if (st.mode === 'mois') {
      const first = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
      const start = new Date(first);
      // recule jusqu'au lundi
      while (start.getUTCDay() !== 1) start.setUTCDate(start.getUTCDate() - 1);
      days = [];
      for (let i=0; i<42; i++) { days.push(D.iso(start)); start.setUTCDate(start.getUTCDate()+1); }
    } else {
      const weekStart = this.weekStart(st.cursor);
      days = [];
      for (let i=0; i<7; i++) days.push(D.addDays(weekStart, i));
    }

    const isInMonth = d => st.mode === 'semaine' || D.parse(d).getUTCMonth() === cursor.getUTCMonth();
    const today = D.today();

    const tasksOf = d => {
      let ts = s.taches.filter(t => t.debut <= d && t.fin >= d);
      if (st.filterPersonne) ts = ts.filter(t => (t.assignes||[]).includes(st.filterPersonne));
      if (st.filterLieu)     ts = ts.filter(t => t.lieuId === st.filterLieu);
      return ts;
    };
    const movesOf = d => {
      let ms = s.deplacements.filter(m => m.date === d);
      if (st.filterPersonne) ms = ms.filter(m => m.personneId === st.filterPersonne);
      return ms;
    };

    const head = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
    const cells = days.map(d => {
      const dt = D.parse(d);
      const ts = tasksOf(d), ms = movesOf(d);
      const outside = !isInMonth(d) ? 'outside' : '';
      const we = D.isWeekend(d) ? 'we' : '';
      const tday = d === today ? 'today' : '';
      const badges = ts.slice(0, 4).map(t => {
        const p = DB.projet(t.projetId);
        return `<div class="cal-event" style="background:${p?p.couleur+'22':''};color:${p?p.couleur:''};border-left:3px solid ${p?p.couleur:'#888'}" title="${t.nom} (${p?p.code:''})">${t.jalon?'◆ ':''}${t.nom}</div>`;
      }).join('');
      const more = ts.length > 4 ? `<div class="small muted">+${ts.length-4}</div>` : '';
      const moves = ms.length ? `<div class="small muted">🚚 ${ms.length}</div>` : '';
      return `<div class="cal-cell ${outside} ${we} ${tday}" data-date="${d}">
        <div class="cal-day">${dt.getUTCDate()}</div>
        ${badges}${more}${moves}
      </div>`;
    }).join('');
    document.getElementById('cal-body').innerHTML = `
      <div class="cal-grid">
        ${head.map(h=>`<div class="cal-head">${h}</div>`).join('')}
        ${cells}
      </div>
      <p class="muted small" style="margin-top:10px">Cliquer sur un jour pour voir le détail</p>
    `;
    document.querySelectorAll('.cal-cell').forEach(el => el.onclick = () => this.openDay(el.dataset.date));
  },
  weekStart(iso) {
    const d = D.parse(iso);
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1);
    return D.iso(d);
  },
  openDay(d) {
    const s = DB.state, st = this.state;
    let ts = s.taches.filter(t => t.debut <= d && t.fin >= d);
    let ms = s.deplacements.filter(m => m.date === d);
    if (st.filterPersonne) { ts = ts.filter(t => (t.assignes||[]).includes(st.filterPersonne)); ms = ms.filter(m => m.personneId === st.filterPersonne); }
    if (st.filterLieu)     { ts = ts.filter(t => t.lieuId === st.filterLieu); }
    const body = `
      <h3 style="margin-top:0">${D.fmt(d)} ${D.isWeekend(d)?'· week-end':''}</h3>
      ${ts.length ? `<h4>Tâches (${ts.length})</h4><ul class="list">${ts.map(t => {
        const p = DB.projet(t.projetId), l = DB.lieu(t.lieuId);
        const ass = (t.assignes||[]).map(id => App.personneLabel(DB.personne(id))).join(', ');
        return `<li style="cursor:pointer" data-tid="${t.id}"><div><strong>${t.nom}</strong> · <span class="muted small">${p?p.code:''}</span><div class="small muted">${l?l.nom:'—'} · ${ass||'—'}</div></div><span class="badge" style="background:${p?p.couleur+'22':''};color:${p?p.couleur:''}">${p?p.code:''}</span></li>`;
      }).join('')}</ul>` : '<p class="muted">Aucune tâche.</p>'}
      ${ms.length ? `<h4>Déplacements (${ms.length})</h4><ul class="list">${ms.map(m => {
        const p = DB.personne(m.personneId), o = DB.lieu(m.origineId), de = DB.lieu(m.destinationId);
        return `<li><div><strong>${App.personneLabel(p)}</strong> · ${m.motif}<div class="small muted">${o?o.nom:'—'} → ${de?de.nom:'—'} · ${m.duree}</div></div></li>`;
      }).join('')}</ul>` : ''}
    `;
    App.openModal(D.fmt(d), body, `<button class="btn btn-secondary" onclick="App.closeModal()">Fermer</button>`);
    document.querySelectorAll('[data-tid]').forEach(el => el.onclick = () => {
      App.closeModal();
      App.navigateToTarget({ view: 'gantt', tacheId: el.dataset.tid });
    });
  },
};
