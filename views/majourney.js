// Vue "Ma journée" — planning personnel + planning équipe
App.views.majourney = {
  state: { selectedPersonneId: null, weekOffset: 0, mode: 'personal', nbJours: 20 },

  _resolvePersonne() {
    const s = DB.state;
    const u = App.currentUser();
    if (!u || !u.nom) return null;
    const parts = u.nom.trim().split(/\s+/);
    if (parts.length < 2) return null;
    const prenom = parts[0].toLowerCase();
    const nom = parts.slice(1).join(' ').toLowerCase();
    return s.personnes.find(p =>
      p.prenom && p.nom &&
      p.prenom.toLowerCase() === prenom &&
      p.nom.toLowerCase() === nom
    ) || null;
  },

  _weekBounds(offset) {
    const today = D.today();
    const base = offset === 0 ? today : D.addWorkdays(today, offset * 5);
    return { start: base, end: D.addWorkdays(base, 4) };
  },

  // Génère la liste des N prochains jours ouvrés à partir de today
  _workingDays(n, fromDate) {
    const days = [];
    let cur = fromDate || D.today();
    while (days.length < n) {
      if (!D.isWeekend(cur)) days.push(cur);
      cur = D.addDays(cur, 1);
    }
    return days;
  },

  render(root) {
    const s = DB.state;
    const today = D.today();
    const st = this.state;

    const autoPersonne = this._resolvePersonne();
    if (!autoPersonne && !st.selectedPersonneId && s.personnes.length) {
      st.selectedPersonneId = s.personnes[0].id;
    }
    const personne = autoPersonne || s.personnes.find(p => p.id === st.selectedPersonneId) || null;
    const showSelector = !autoPersonne;

    const userLabel = personne ? App.personneLabel(personne) : 'Inconnu';

    root.innerHTML = `
      <div class="toolbar">
        <strong>🗓 Ma journée</strong>
        <span class="spacer"></span>
        <div class="btn-group" style="display:flex;gap:2px">
          <button class="btn-ghost${st.mode==='personal'?' active':''}" id="mj-mode-personal">👤 Ma journée</button>
          <button class="btn-ghost${st.mode==='equipe'?' active':''}" id="mj-mode-equipe">👥 Planning équipe</button>
        </div>
      </div>
      <div id="mj-content"></div>
    `;

    document.getElementById('mj-mode-personal').onclick = () => { st.mode = 'personal'; App.refresh(); };
    document.getElementById('mj-mode-equipe').onclick  = () => { st.mode = 'equipe';   App.refresh(); };

    if (st.mode === 'equipe') {
      this._renderEquipeMode(document.getElementById('mj-content'));
    } else {
      this._renderPersonalMode(document.getElementById('mj-content'), personne, userLabel, showSelector, today);
    }
  },

  // ─── MODE PERSONNEL ───────────────────────────────────────────────────────

  _renderPersonalMode(root, personne, userLabel, showSelector, today) {
    const s = DB.state;
    const st = this.state;

    const { start: weekStart, end: weekEnd } = this._weekBounds(st.weekOffset);
    const isCurrentWeek = st.weekOffset === 0;
    const weekLabel = isCurrentWeek ? 'Cette semaine' : st.weekOffset === 1 ? 'Semaine prochaine' : st.weekOffset < 0 ? `Semaine ${st.weekOffset}` : `Semaine +${st.weekOffset}`;

    const mesTaches = personne
      ? s.taches.filter(t => !t.jalon && (t.assignes || []).includes(personne.id))
      : [];

    const tachesActives  = mesTaches.filter(t => t.debut <= today && t.fin >= today);
    const tachesSemaine  = mesTaches.filter(t => t.fin >= weekStart && t.debut <= weekEnd);
    const heuresSemaine  = tachesSemaine.reduce((n, t) => {
      const a = t.debut < weekStart ? weekStart : t.debut;
      const b = t.fin   > weekEnd   ? weekEnd   : t.fin;
      return n + D.workdaysBetween(a, b) * 7;
    }, 0);
    const avancementMoyen = tachesActives.length
      ? Math.round(tachesActives.reduce((n, t) => n + (t.avancement || 0), 0) / tachesActives.length) : 0;

    const horizon30 = D.addDays(today, 30);
    const mesAbsences = personne
      ? (personne.absences || []).filter(a => a.fin >= today && a.debut <= horizon30)
          .slice().sort((a, b) => a.debut.localeCompare(b.debut)) : [];
    const horizon7 = D.addDays(today, 7);
    const mesDeplacements = personne
      ? s.deplacements.filter(d => d.personneId === personne.id && d.date >= today && d.date <= horizon7)
          .slice().sort((a, b) => a.date.localeCompare(b.date)) : [];

    root.innerHTML = `
      <div class="toolbar" style="margin-top:8px">
        <strong class="muted">${userLabel}</strong>
        <span class="muted small">${D.fmt(today)}</span>
        <span class="spacer"></span>
        ${showSelector ? `<select id="mj-personne-sel">${s.personnes.map(p => `<option value="${p.id}" ${p.id===(personne&&personne.id)?'selected':''}>${App.personneLabel(p)}</option>`).join('')}</select>` : ''}
        <button class="btn-ghost" id="mj-prev">‹</button>
        <button class="btn-ghost${st.weekOffset===0?' active':''}" id="mj-today" style="font-size:12px">Aujourd'hui</button>
        <button class="btn-ghost" id="mj-next">›</button>
        <button class="btn-ghost" id="mj-print" title="Imprimer les tâches de la semaine">⎙ Imprimer</button>
      </div>

      <div class="grid grid-3" style="margin-bottom:14px">
        <div class="card">
          <div class="muted small">Tâches actives aujourd'hui</div>
          <div style="font-size:28px;font-weight:700">${tachesActives.length}</div>
          <div class="small muted">${tachesActives.length ? tachesActives.map(t=>App.escapeHTML(t.nom)).join(', ').substring(0,60)+(tachesActives.map(t=>App.escapeHTML(t.nom)).join(', ').length>60?'…':'') : 'Aucune'}</div>
        </div>
        <div class="card">
          <div class="muted small">Heures estimées — ${weekLabel}</div>
          <div style="font-size:28px;font-weight:700">${heuresSemaine}<span class="small muted"> h</span></div>
          <div class="small muted">${tachesSemaine.length} tâche(s) · capacité ${personne&&personne.capaciteHebdo?personne.capaciteHebdo:35} h</div>
        </div>
        <div class="card">
          <div class="muted small">Avancement moyen (actives)</div>
          <div style="font-size:28px;font-weight:700">${avancementMoyen}<span class="small muted"> %</span></div>
          <div class="bar-inline" style="margin-top:6px"><div class="fill" style="width:${avancementMoyen}%"></div></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h2>Aujourd'hui</h2>
        ${this._renderAujourdhui(tachesActives)}
      </div>
      <div class="card" style="margin-bottom:14px">
        <h2>${weekLabel} <span class="muted small">(${D.fmt(weekStart)} → ${D.fmt(weekEnd)})</span></h2>
        ${this._renderSemaine(tachesSemaine)}
      </div>
      <div class="card" style="margin-bottom:14px">
        <h2>Mes absences <span class="muted small">(30 prochains jours)</span></h2>
        ${this._renderAbsences(mesAbsences)}
      </div>
      <div class="card" style="margin-bottom:14px">
        <h2>Mes déplacements <span class="muted small">(7 prochains jours)</span></h2>
        ${this._renderDeplacements(mesDeplacements)}
      </div>
    `;

    document.getElementById('mj-prev').onclick   = () => { st.weekOffset--; App.refresh(); };
    document.getElementById('mj-next').onclick   = () => { st.weekOffset++; App.refresh(); };
    document.getElementById('mj-today').onclick  = () => { st.weekOffset = 0; App.refresh(); };
    document.getElementById('mj-print').onclick  = () => this._printPersonal(personne, tachesSemaine, weekStart, weekEnd, today);
    if (showSelector) {
      const sel = document.getElementById('mj-personne-sel');
      if (sel) sel.onchange = e => { st.selectedPersonneId = e.target.value; App.refresh(); };
    }
    document.querySelectorAll('[data-tache-id]').forEach(el => {
      el.addEventListener('click', () => App.navigateToTarget({ view:'gantt', tacheId: el.dataset.tacheId }));
      el.style.cursor = 'pointer';
    });
  },

  // ─── MODE ÉQUIPE ──────────────────────────────────────────────────────────

  _renderEquipeMode(root) {
    const s = DB.state;
    const st = this.state;
    const today = D.today();
    const nb = st.nbJours || 20;
    const days = this._workingDays(nb);

    const personnes = (s.personnes || []).slice().sort((a,b) =>
      (a.nom||'').localeCompare(b.nom||'')
    );

    // Tâches indexées par personne → jour
    const tasksByPersonDay = {};
    personnes.forEach(p => {
      tasksByPersonDay[p.id] = {};
      days.forEach(day => { tasksByPersonDay[p.id][day] = []; });
    });
    s.taches.forEach(t => {
      if (t.jalon) return;
      (t.assignes || []).forEach(pid => {
        if (!tasksByPersonDay[pid]) return;
        days.forEach(day => {
          if (t.debut <= day && t.fin >= day) tasksByPersonDay[pid][day].push(t);
        });
      });
    });

    const DAY_ABBR = ['Di','Lu','Ma','Me','Je','Ve','Sa'];

    // Calcul d'occupation par personne (pour l'ordre / colorisation)
    const busyCount = pid => days.filter(d => tasksByPersonDay[pid] && tasksByPersonDay[pid][d] && tasksByPersonDay[pid][d].length > 0).length;

    root.innerHTML = `
      <div class="toolbar" style="margin-top:8px">
        <span class="muted small">Prochains jours ouvrés à partir du ${D.fmt(today)}</span>
        <span class="spacer"></span>
        <label class="muted small" style="display:flex;align-items:center;gap:6px">
          Jours : <select id="mj-nb-jours" style="width:70px">
            ${[10,15,20,25,30].map(n=>`<option value="${n}" ${n===nb?'selected':''}>${n}</option>`).join('')}
          </select>
        </label>
        <button class="btn-ghost" id="mj-print-equipe">⎙ Imprimer</button>
      </div>

      <div style="overflow-x:auto;margin-top:8px">
        <table style="border-collapse:collapse;font-size:11px;white-space:nowrap;width:100%">
          <thead>
            <tr>
              <th style="position:sticky;left:0;z-index:2;background:var(--surface);padding:5px 10px;text-align:left;border-bottom:2px solid var(--border);min-width:130px;font-size:11px">Personne</th>
              ${days.map(day => {
                const isToday = day === today;
                const abbr = DAY_ABBR[D.parse(day).getUTCDay()];
                const num  = D.fmt(day).slice(0, 5); // "26 avr"
                return `<th style="min-width:46px;max-width:60px;text-align:center;padding:3px 2px;border-bottom:2px solid var(--border);font-weight:${isToday?'700':'500'};color:${isToday?'var(--primary)':'var(--text-muted)'};font-size:10px;${isToday?'background:var(--primary-weak);border-radius:4px 4px 0 0':''}">
                  <div>${abbr}</div><div>${num}</div>
                </th>`;
              }).join('')}
            </tr>
          </thead>
          <tbody>
            ${personnes.map((p, ri) => {
              const initials = ((p.prenom||'').charAt(0)+(p.nom||'').charAt(0)).toUpperCase();
              const occupied = busyCount(p.id);
              const rowBg = ri % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)';
              return `<tr style="background:${rowBg}">
                <td style="position:sticky;left:0;z-index:1;background:${rowBg};padding:4px 8px;border-bottom:1px solid var(--border);font-size:11px">
                  <div style="display:flex;align-items:center;gap:6px">
                    <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--primary-weak);color:var(--primary);font-size:9px;font-weight:700;flex-shrink:0">${initials}</span>
                    <span>${App.personneLabel(p)}</span>
                    ${occupied ? `<span class="badge muted" style="font-size:9px">${occupied}j</span>` : ''}
                  </div>
                </td>
                ${days.map(day => {
                  const tasks = (tasksByPersonDay[p.id]||{})[day] || [];
                  const isToday = day === today;
                  const cellBg = isToday ? 'rgba(44,95,179,0.06)' : '';
                  if (!tasks.length) return `<td style="border-bottom:1px solid var(--border);border-right:1px solid var(--border-light,#eee);padding:2px;min-width:46px;height:30px;${cellBg?'background:'+cellBg:''}"></td>`;
                  return `<td style="border-bottom:1px solid var(--border);border-right:1px solid var(--border-light,#eee);padding:2px;vertical-align:top;${cellBg?'background:'+cellBg:''}">
                    ${tasks.map(t => {
                      const prj = DB.projet(t.projetId);
                      const col = prj ? prj.couleur : '#888';
                      return `<div title="${App.escapeHTML(t.nom)}${prj?' · '+App.escapeHTML(prj.nom):''}" style="background:${App.safeColor(col)}20;border-left:3px solid ${App.safeColor(col)};padding:1px 3px;font-size:9px;margin-bottom:1px;overflow:hidden;border-radius:0 2px 2px 0;line-height:1.3;cursor:pointer" data-tache-id="${t.id}">${prj?App.escapeHTML(prj.code):'—'}</div>`;
                    }).join('')}
                  </td>`;
                }).join('')}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Légende projets -->
      <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <span class="muted small">Légende :</span>
        ${s.projets.filter(p=>p.statut!=='clos').map(p=>`
          <span style="display:flex;align-items:center;gap:4px;font-size:10px">
            <span style="width:10px;height:10px;border-radius:2px;background:${App.safeColor(p.couleur)};flex-shrink:0"></span>
            ${App.escapeHTML(p.code)}
          </span>`).join('')}
      </div>
    `;

    // Bindings
    document.getElementById('mj-nb-jours').onchange = e => { st.nbJours = +e.target.value; App.refresh(); };
    document.getElementById('mj-print-equipe').onclick = () => this._printEquipe(personnes, days, tasksByPersonDay, DAY_ABBR, today);

    root.querySelectorAll('[data-tache-id]').forEach(el => {
      el.addEventListener('click', e => { e.stopPropagation(); App.navigateToTarget({ view:'gantt', tacheId: el.dataset.tacheId }); });
    });
  },

  // ─── IMPRESSION PLANNING ÉQUIPE ───────────────────────────────────────────

  _printEquipe(personnes, days, tasksByPersonDay, DAY_ABBR, today) {
    const s = DB.state;
    const user = App.currentUser();
    const debut = D.fmt(days[0]);
    const fin   = D.fmt(days[days.length - 1]);

    const rowsHtml = personnes.map(p => {
      const initials = ((p.prenom||'').charAt(0)+(p.nom||'').charAt(0)).toUpperCase();
      return `<tr>
        <td class="pname">
          <span class="av">${initials}</span>
          ${App.personneLabel(p)}
        </td>
        ${days.map(day => {
          const tasks = (tasksByPersonDay[p.id]||{})[day] || [];
          const isToday = day === today;
          if (!tasks.length) return `<td class="${isToday?'today':''}"></td>`;
          return `<td class="${isToday?'today':''}">
            ${tasks.map(t => {
              const prj = DB.projet(t.projetId);
              const col = prj ? prj.couleur : '#888';
              return `<div class="pill" style="border-left:3px solid ${App.safeColor(col)};background:${App.safeColor(col)}18" title="${App.escapeHTML(t.nom)}">${prj?App.escapeHTML(prj.code):'—'}</div>`;
            }).join('')}
          </td>`;
        }).join('')}
      </tr>`;
    }).join('');

    const legendHtml = s.projets.filter(p=>p.statut!=='clos').map(p=>
      `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px">
        <span style="width:10px;height:10px;border-radius:2px;background:${App.safeColor(p.couleur)};display:inline-block"></span>
        <strong>${App.escapeHTML(p.code)}</strong> ${App.escapeHTML(p.nom)}
      </span>`
    ).join('');

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
      <title>Planning équipe — ${debut} → ${fin}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 0; color: #222; font-size: 10px; }
        h1 { font-size: 15px; margin: 0 0 4px; border-bottom: 2px solid #2c5fb3; padding-bottom: 4px; color: #2c5fb3; }
        .meta { font-size: 9px; color: #888; margin-bottom: 10px; }
        table { border-collapse: collapse; width: 100%; table-layout: fixed; }
        th { font-size: 9px; font-weight: 600; color: #666; text-align: center; padding: 2px 1px; border-bottom: 2px solid #ddd; }
        th.today-h { color: #2c5fb3; font-weight: 700; background: #e8f0fb; }
        td { border-bottom: 1px solid #eee; border-right: 1px solid #f2f2f2; padding: 2px 1px; vertical-align: top; min-height: 22px; }
        td.today { background: #f0f6ff; }
        td.pname { text-align: left; padding: 3px 6px; white-space: nowrap; font-size: 10px; font-weight: 500; border-right: 2px solid #ddd; width: 110px; background: #fafafa; }
        .av { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; background: #e8f0fb; color: #2c5fb3; font-size: 8px; font-weight: 700; margin-right: 4px; }
        .pill { background: #eee; border-left: 3px solid #888; padding: 1px 2px; font-size: 8px; margin-bottom: 1px; border-radius: 0 2px 2px 0; overflow: hidden; white-space: nowrap; }
        .legend { margin-top: 10px; font-size: 9px; border-top: 1px solid #ddd; padding-top: 6px; }
        .footer { margin-top: 8px; font-size: 8px; color: #bbb; text-align: center; border-top: 1px solid #eee; padding-top: 4px; }
        tr:nth-child(even) td { background: #fafafa; }
        tr:nth-child(even) td.today { background: #edf4ff; }
        tr:nth-child(even) td.pname { background: #f2f2f2; }
        @media print {
          @page { size: A3 landscape; margin: 8mm; }
          body { margin: 0; }
        }
      </style></head><body>
      <h1>Planning équipe</h1>
      <div class="meta">Du ${debut} au ${fin} · Généré le ${D.fmt(today)} par ${App.escapeHTML(user ? user.nom : '—')} · Atelier · Planification</div>
      <table>
        <thead>
          <tr>
            <th style="text-align:left;padding-left:6px;width:110px">Personne</th>
            ${days.map(day => {
              const isToday = day === today;
              const abbr = DAY_ABBR[D.parse(day).getUTCDay()];
              const num  = D.fmt(day).slice(0,5);
              return `<th class="${isToday?'today-h':''}"><div>${abbr}</div><div>${num}</div></th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="legend"><strong>Légende :</strong> ${legendHtml}</div>
      <div class="footer">Atelier · Planification — ${D.fmt(today)}</div>
      <script>setTimeout(() => window.print(), 400);</script>
    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { App.toast('Pop-up bloqué — autoriser les pop-ups', 'error'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  },

  // ─── RENDUS PERSONNELS ────────────────────────────────────────────────────

  _renderAujourdhui(taches) {
    if (!taches.length) return `<p class="muted">Aucune tâche active aujourd'hui.</p>`;
    return `<ul class="list list-clickable">${taches.map(t => {
      const prj  = DB.projet(t.projetId);
      const lieu = DB.lieu(t.lieuId);
      const assigns = (t.assignes || []).map(id => App.personneLabel(DB.personne(id))).filter(Boolean).join(', ');
      const pct  = t.avancement || 0;
      const barCls = pct >= 100 ? 'good' : pct >= 50 ? '' : 'warn';
      return `<li class="alert-row" data-tache-id="${t.id}" role="button" tabindex="0">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <strong>${App.escapeHTML(t.nom)}</strong>
            ${prj ? `<span class="badge" style="background:${App.safeColor(prj.couleur)}22;color:${App.safeColor(prj.couleur)}">${App.escapeHTML(prj.code)}</span>` : ''}
            ${lieu ? `<span class="badge muted">${App.escapeHTML(lieu.nom)}</span>` : ''}
          </div>
          <div class="small muted" style="margin-bottom:6px">${D.fmt(t.debut)} → ${D.fmt(t.fin)} · ${assigns || '—'}</div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="bar-inline ${barCls}" style="flex:1"><div class="fill" style="width:${pct}%"></div></div>
            <span class="small muted" style="white-space:nowrap">${pct}%</span>
          </div>
        </div>
        <span class="alert-arrow">→ Gantt</span>
      </li>`;
    }).join('')}</ul>`;
  },

  _renderSemaine(taches) {
    if (!taches.length) return `<p class="muted">Aucune tâche cette semaine.</p>`;
    const today = D.today();
    return `<table class="data">
      <thead>
        <tr><th>Tâche</th><th>Projet</th><th>Personnes assignées</th><th>Début</th><th>Fin</th><th>Avancement</th><th></th></tr>
      </thead>
      <tbody>
        ${taches.map(t => {
          const prj  = DB.projet(t.projetId);
          const pct  = t.avancement || 0;
          const isLate = t.fin < today && pct < 100;
          const barCls = isLate ? 'bad' : pct >= 100 ? 'good' : '';
          const assignes = (t.assignes || []).map(id => DB.personne(id)).filter(Boolean).map(p => {
            const initials = ((p.prenom||'').charAt(0)+(p.nom||'').charAt(0)).toUpperCase();
            return `<span title="${App.personneLabel(p)}" style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--primary-weak);color:var(--primary);font-size:9px;font-weight:700;border:1px solid var(--primary)">${initials}</span>`;
          }).join('');
          return `<tr data-tache-id="${t.id}" role="button" tabindex="0">
            <td><strong>${App.escapeHTML(t.nom)}</strong>${isLate?'<span class="badge bad" style="font-size:9px;margin-left:4px">retard</span>':''}</td>
            <td>${prj?`<span class="badge" style="background:${App.safeColor(prj.couleur)}22;color:${App.safeColor(prj.couleur)}">${App.escapeHTML(prj.code)}</span>`:'<span class="muted">—</span>'}</td>
            <td><div style="display:flex;gap:3px;flex-wrap:wrap">${assignes||'<span class="muted small">—</span>'}</div></td>
            <td class="mono">${D.fmt(t.debut)}</td>
            <td class="mono">${D.fmt(t.fin)}</td>
            <td style="min-width:120px">
              <div style="display:flex;align-items:center;gap:6px">
                <div class="bar-inline ${barCls}" style="flex:1"><div class="fill" style="width:${pct}%"></div></div>
                <span class="small muted">${pct}%</span>
              </div>
            </td>
            <td><button class="btn-ghost small" data-tache-id="${t.id}">→ Gantt</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  },

  _renderAbsences(absences) {
    if (!absences.length) return `<p class="muted">Aucune absence dans les 30 prochains jours.</p>`;
    const today = D.today();
    return `<ul class="list">${absences.map(a => {
      const encours = a.debut <= today && a.fin >= today;
      const nbJours = D.workdaysBetween(a.debut, a.fin) + 1;
      return `<li class="alert-row" onclick="App.navigate('absences')" role="button" tabindex="0" style="cursor:pointer">
        <div>
          <strong>${App.escapeHTML(a.motif)}</strong>${a.note?`<span class="muted small"> · ${App.escapeHTML(a.note)}</span>`:''}
          <div class="small muted">${D.fmt(a.debut)} → ${D.fmt(a.fin)} · ${nbJours} j. ouvré(s)</div>
        </div>
        <span class="badge ${encours?'bad':'warn'}">${encours?'en cours':'à venir'}</span>
        <span class="alert-arrow">›</span>
      </li>`;
    }).join('')}</ul>`;
  },

  _renderDeplacements(deplacements) {
    if (!deplacements.length) return `<p class="muted">Aucun déplacement dans les 7 prochains jours.</p>`;
    return `<ul class="list">${deplacements.map(d => {
      const origine = DB.lieu(d.origineId), dest = DB.lieu(d.destinationId), prj = DB.projet(d.projetId);
      return `<li class="alert-row" onclick="App.navigate('deplacements')" role="button" tabindex="0" style="cursor:pointer">
        <div>
          <strong>${App.escapeHTML(d.motif)}</strong>${prj?`<span class="badge" style="background:${App.safeColor(prj.couleur)}22;color:${App.safeColor(prj.couleur)};margin-left:6px">${App.escapeHTML(prj.code)}</span>`:''}
          <div class="small muted">${D.fmt(d.date)} · ${origine?App.escapeHTML(origine.nom):'—'} → ${dest?App.escapeHTML(dest.nom):'—'} · ${d.duree}</div>
        </div>
        <span class="alert-arrow">›</span>
      </li>`;
    }).join('')}</ul>`;
  },

  _printPersonal(personne, tachesSemaine, weekStart, weekEnd, today) {
    const s = DB.state;
    const esc = v => App.escapeHTML(String(v || ''));
    const sc = c => App.safeColor(c);
    const label = personne ? App.personneLabel(personne) : 'Inconnu';

    const css = `body{font-family:system-ui,sans-serif;margin:20px;font-size:11px;color:#222}h1{font-size:15px;margin:0 0 2px}h2{font-size:12px;margin:10px 0 3px;padding:3px 8px;background:#f0f0f0;border-radius:3px}.sub{color:#777;font-size:9px;margin:0 0 10px}table{width:100%;border-collapse:collapse;margin-bottom:8px}th,td{padding:3px 7px;border:1px solid #ddd;text-align:left;font-size:10px}th{background:#f5f5f5;font-weight:600}tr:nth-child(even)td{background:#fafafa}.b{display:inline-block;padding:1px 4px;border-radius:3px;font-size:9px;font-weight:600}.ret{color:#dc2626}@media print{@page{size:A4 portrait;margin:10mm}}`;

    let body = `<h1>Ma journée — ${esc(label)}</h1><p class="sub">${D.fmt(weekStart)} → ${D.fmt(weekEnd)} · Généré le ${D.fmt(today)}</p>`;

    body += `<h2>Tâches de la semaine (${tachesSemaine.length})</h2>`;
    if (tachesSemaine.length) {
      body += `<table><thead><tr><th>Tâche</th><th>Projet</th><th>Début</th><th>Fin</th><th>Lieu</th><th>Av.</th></tr></thead><tbody>`;
      tachesSemaine.slice().sort((a,b) => a.debut.localeCompare(b.debut)).forEach(t => {
        const prj = DB.projet(t.projetId);
        const lieu = DB.lieu(t.lieuId);
        const av = t.avancement || 0;
        const col = sc(prj?.couleur || '#888');
        const retard = t.fin < today && av < 100;
        body += `<tr${retard?' class="ret"':''}><td>${esc(t.nom)}${av===100?' ✓':''}</td><td><span class="b" style="background:${col}22;color:${col}">${esc(prj?.code||'—')}</span></td><td>${D.fmt(t.debut)}</td><td>${D.fmt(t.fin)}</td><td>${esc(lieu?.nom||'—')}</td><td>${av}%</td></tr>`;
      });
      body += `</tbody></table>`;
    } else {
      body += `<p style="color:#999">Aucune tâche sur cette semaine.</p>`;
    }

    if (personne) {
      const absences = (personne.absences||[]).filter(a => a.debut <= weekEnd && a.fin >= weekStart);
      if (absences.length) {
        body += `<h2>Absences</h2><table><thead><tr><th>Motif</th><th>Début</th><th>Fin</th></tr></thead><tbody>`;
        absences.forEach(a => { body += `<tr><td>${esc(a.motif||'Absence')}</td><td>${D.fmt(a.debut)}</td><td>${D.fmt(a.fin)}</td></tr>`; });
        body += `</tbody></table>`;
      }
    }

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Ma journée — ${esc(label)}</title><style>${css}</style></head><body>${body}<script>setTimeout(()=>window.print(),400)<\/script></body></html>`);
    w.document.close();
  },

  draw() {},
};
