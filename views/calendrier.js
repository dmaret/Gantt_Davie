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
        <button class="btn-ghost" id="cal-print" title="Imprimer le calendrier">⎙ Imprimer</button>
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
    document.getElementById('cal-print').onclick = () => this._printCal();
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
        return `<div class="cal-event" style="background:${p?App.safeColor(p.couleur)+'22':''};color:${p?App.safeColor(p.couleur):''};border-left:3px solid ${p?App.safeColor(p.couleur):'#888'}" title="${App.escapeHTML(t.nom)} (${p?App.escapeHTML(p.code):''})">${t.jalon?'◆ ':''}${App.escapeHTML(t.nom)}</div>`;
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
  _printCal() {
    const st = this.state, s = DB.state;
    const today = D.today();
    const esc = v => App.escapeHTML(String(v || ''));
    const sc = c => App.safeColor(c);
    const mois = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
    const cursor = D.parse(st.cursor);
    let title, days;
    if (st.mode === 'mois') {
      title = mois[cursor.getUTCMonth()] + ' ' + cursor.getUTCFullYear();
      const last = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
      days = [];
      const d = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
      while (D.iso(d) <= D.iso(last)) { days.push(D.iso(d)); d.setUTCDate(d.getUTCDate() + 1); }
    } else {
      const ws = this.weekStart(st.cursor);
      title = 'Semaine du ' + D.fmt(ws);
      days = Array.from({length:7}, (_, i) => D.addDays(ws, i));
    }

    const personneFilter = s.personnes.find(p => p.id === st.filterPersonne);
    const lieuFilter = s.lieux.find(l => l.id === st.filterLieu);
    const subtitle = [personneFilter ? `Personne : ${App.personneLabel(personneFilter)}` : '', lieuFilter ? `Lieu : ${lieuFilter.nom}` : ''].filter(Boolean).join(' · ') || 'Toutes personnes · Tous lieux';

    const css = `body{font-family:system-ui,sans-serif;margin:20px;font-size:11px;color:#222}h1{font-size:15px;margin:0 0 2px}h2{font-size:12px;margin:10px 0 3px;padding:3px 8px;background:#f0f0f0;border-radius:3px}.sub{color:#777;font-size:9px;margin:0 0 10px}table{width:100%;border-collapse:collapse;margin-bottom:8px}th,td{padding:3px 7px;border:1px solid #ddd;text-align:left;font-size:10px}th{background:#f5f5f5;font-weight:600}tr:nth-child(even)td{background:#fafafa}.b{display:inline-block;padding:1px 4px;border-radius:3px;font-size:9px;font-weight:600}.we{color:#999}@media print{@page{size:A4 portrait;margin:10mm}}`;

    let body = `<h1>Calendrier — ${esc(title)}</h1><p class="sub">${esc(subtitle)}</p>`;

    const daysWithContent = days.filter(d => {
      let ts = s.taches.filter(t => t.debut <= d && t.fin >= d);
      if (st.filterPersonne) ts = ts.filter(t => (t.assignes||[]).includes(st.filterPersonne));
      if (st.filterLieu) ts = ts.filter(t => t.lieuId === st.filterLieu);
      let ms = s.deplacements.filter(m => m.date === d);
      if (st.filterPersonne) ms = ms.filter(m => m.personneId === st.filterPersonne);
      return ts.length > 0 || ms.length > 0;
    });

    if (!daysWithContent.length) {
      body += `<p style="color:#999">Aucune tâche ni déplacement sur cette période.</p>`;
    } else {
      daysWithContent.forEach(d => {
        let ts = s.taches.filter(t => t.debut <= d && t.fin >= d);
        if (st.filterPersonne) ts = ts.filter(t => (t.assignes||[]).includes(st.filterPersonne));
        if (st.filterLieu) ts = ts.filter(t => t.lieuId === st.filterLieu);
        let ms = s.deplacements.filter(m => m.date === d);
        if (st.filterPersonne) ms = ms.filter(m => m.personneId === st.filterPersonne);
        const dt = D.parse(d);
        const isWE = dt.getUTCDay() === 0 || dt.getUTCDay() === 6;
        const isToday = d === today;
        body += `<h2><span${isWE?' class="we"':''}${isToday?' style="font-weight:700;color:#2563eb"':''}>${D.fmt(d)}</span>${isToday?'  <span style="font-size:9px;color:#2563eb">Aujourd\'hui</span>':''}${isWE?' <span style="font-size:9px;color:#999">Week-end</span>':''}</h2>`;
        if (ts.length) {
          body += `<table><thead><tr><th>Tâche</th><th>Projet</th><th>Lieu</th><th>Assignés</th><th>Av.</th></tr></thead><tbody>`;
          ts.forEach(t => {
            const prj = DB.projet(t.projetId);
            const lieu = DB.lieu(t.lieuId);
            const ass = (t.assignes||[]).map(pid => DB.personne(pid)).filter(Boolean).map(p => App.personneLabel(p)).join(', ') || '—';
            const av = t.avancement || 0;
            const col = sc(prj?.couleur || '#888');
            body += `<tr><td>${esc(t.nom)}</td><td><span class="b" style="background:${col}22;color:${col}">${esc(prj?.code||'—')}</span></td><td>${esc(lieu?.nom||'—')}</td><td>${esc(ass)}</td><td>${av}%</td></tr>`;
          });
          body += `</tbody></table>`;
        }
        ms.forEach(m => {
          const p = DB.personne(m.personneId);
          const o = DB.lieu(m.origineId);
          const de = DB.lieu(m.destinationId);
          body += `<p style="margin:2px 0 4px;font-size:10px">🚚 ${esc(App.personneLabel(p))} · ${esc(m.motif||'Déplacement')} · ${esc(o?.nom||'—')} → ${esc(de?.nom||'—')}</p>`;
        });
      });
    }

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Calendrier ${esc(title)}</title><style>${css}</style></head><body>${body}<script>setTimeout(()=>window.print(),400)<\/script></body></html>`);
    w.document.close();
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
        return `<li style="cursor:pointer" data-tid="${t.id}"><div><strong>${App.escapeHTML(t.nom)}</strong> · <span class="muted small">${p?App.escapeHTML(p.code):''}</span><div class="small muted">${l?App.escapeHTML(l.nom):'—'} · ${ass||'—'}</div></div><span class="badge" style="background:${p?App.safeColor(p.couleur)+'22':''};color:${p?App.safeColor(p.couleur):''}">${p?App.escapeHTML(p.code):''}</span></li>`;
      }).join('')}</ul>` : '<p class="muted">Aucune tâche.</p>'}
      ${ms.length ? `<h4>Déplacements (${ms.length})</h4><ul class="list">${ms.map(m => {
        const p = DB.personne(m.personneId), o = DB.lieu(m.origineId), de = DB.lieu(m.destinationId);
        return `<li><div><strong>${App.personneLabel(p)}</strong> · ${App.escapeHTML(m.motif)}<div class="small muted">${o?App.escapeHTML(o.nom):'—'} → ${de?App.escapeHTML(de.nom):'—'} · ${m.duree}</div></div></li>`;
      }).join('')}</ul>` : ''}
    `;
    App.openModal(D.fmt(d), body, `<button class="btn btn-secondary" onclick="App.closeModal()">Fermer</button>`);
    document.querySelectorAll('[data-tid]').forEach(el => el.onclick = () => {
      App.closeModal();
      App.navigateToTarget({ view: 'gantt', tacheId: el.dataset.tid });
    });
  },
};
