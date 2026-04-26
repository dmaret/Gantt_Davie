// Vue "Ma journée" — planning personnel filtré sur l'utilisateur connecté
App.views.majourney = {
  state: { selectedPersonneId: null },

  // Résout la personne courante depuis currentUser().nom (format "Prénom Nom")
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

  render(root) {
    const s = DB.state;
    const today = D.today();
    const st = this.state;

    // Résolution de la personne
    const autoPersonne = this._resolvePersonne();
    if (!autoPersonne && !st.selectedPersonneId && s.personnes.length) {
      st.selectedPersonneId = s.personnes[0].id;
    }
    const personne = autoPersonne || s.personnes.find(p => p.id === st.selectedPersonneId) || null;
    const showSelector = !autoPersonne;

    // Libellé de l'utilisateur
    const userLabel = personne ? App.personneLabel(personne) : 'Inconnu';

    // Limites de la semaine courante (L→V) et de la semaine prochaine
    const weekStart = today;
    const weekEnd   = D.addWorkdays(today, 4);
    const nextWeekStart = D.addWorkdays(today, 5);
    const nextWeekEnd   = D.addWorkdays(today, 9);

    // Tâches de la personne
    const mesTaches = personne
      ? s.taches.filter(t => !t.jalon && (t.assignes || []).includes(personne.id))
      : [];

    // ---- Statistiques rapides ----
    const tachesActives = mesTaches.filter(t => t.debut <= today && t.fin >= today);
    const tachesSemaine = mesTaches.filter(t => t.fin >= weekStart && t.debut <= weekEnd);
    const heuresSemaine = tachesSemaine.reduce((n, t) => {
      const a = t.debut < weekStart ? weekStart : t.debut;
      const b = t.fin   > weekEnd   ? weekEnd   : t.fin;
      return n + D.workdaysBetween(a, b) * 7;
    }, 0);
    const avancementMoyen = tachesActives.length
      ? Math.round(tachesActives.reduce((n, t) => n + (t.avancement || 0), 0) / tachesActives.length)
      : 0;

    // ---- Absences à venir (30 j) ----
    const horizon30 = D.addDays(today, 30);
    const mesAbsences = personne
      ? (personne.absences || []).filter(a => a.fin >= today && a.debut <= horizon30)
          .slice().sort((a, b) => a.debut.localeCompare(b.debut))
      : [];

    // ---- Déplacements à venir (7 j) ----
    const horizon7 = D.addDays(today, 7);
    const mesDeplacements = personne
      ? s.deplacements
          .filter(d => d.personneId === personne.id && d.date >= today && d.date <= horizon7)
          .slice().sort((a, b) => a.date.localeCompare(b.date))
      : [];

    // ---- Rendu ----
    root.innerHTML = `
      <div class="toolbar">
        <strong>🗓 Ma journée — ${userLabel}</strong>
        <span class="muted small">${D.fmt(today)}</span>
        <span class="spacer"></span>
        ${showSelector ? `
          <select id="mj-personne-sel" title="Choisir une personne">
            ${s.personnes.map(p => `<option value="${p.id}" ${p.id === (personne && personne.id) ? 'selected' : ''}>${App.personneLabel(p)}</option>`).join('')}
          </select>
        ` : ''}
        <button class="btn-ghost" id="mj-btn-week">📅 Cette semaine</button>
        <button class="btn-ghost" id="mj-btn-nextweek">📆 Semaine prochaine</button>
      </div>

      <!-- Statistiques rapides -->
      <div class="grid grid-3" style="margin-bottom:14px">
        <div class="card">
          <div class="muted small">Tâches actives aujourd'hui</div>
          <div style="font-size:28px;font-weight:700">${tachesActives.length}</div>
          <div class="small muted">${tachesActives.length ? tachesActives.map(t => t.nom).join(', ').substring(0, 60) + (tachesActives.map(t=>t.nom).join(', ').length > 60 ? '…' : '') : 'Aucune'}</div>
        </div>
        <div class="card">
          <div class="muted small">Heures estimées cette semaine</div>
          <div style="font-size:28px;font-weight:700">${heuresSemaine}<span class="small muted"> h</span></div>
          <div class="small muted">${tachesSemaine.length} tâche(s) · capacité ${personne && personne.capaciteHebdo ? personne.capaciteHebdo : 35} h</div>
        </div>
        <div class="card">
          <div class="muted small">Avancement moyen (actives)</div>
          <div style="font-size:28px;font-weight:700">${avancementMoyen}<span class="small muted"> %</span></div>
          <div class="bar-inline" style="margin-top:6px"><div class="fill" style="width:${avancementMoyen}%"></div></div>
        </div>
      </div>

      <!-- Section Aujourd'hui -->
      <div class="card" style="margin-bottom:14px">
        <h2>Aujourd'hui</h2>
        ${this._renderAujourdhui(tachesActives)}
      </div>

      <!-- Section Cette semaine -->
      <div class="card" style="margin-bottom:14px">
        <h2>Cette semaine <span class="muted small">(${D.fmt(weekStart)} → ${D.fmt(weekEnd)})</span></h2>
        ${this._renderSemaine(tachesSemaine)}
      </div>

      <!-- Section Mes absences -->
      <div class="card" style="margin-bottom:14px">
        <h2>Mes absences <span class="muted small">(30 prochains jours)</span></h2>
        ${this._renderAbsences(mesAbsences)}
      </div>

      <!-- Section Mes déplacements -->
      <div class="card" style="margin-bottom:14px">
        <h2>Mes déplacements <span class="muted small">(7 prochains jours)</span></h2>
        ${this._renderDeplacements(mesDeplacements)}
      </div>
    `;

    // Bindings
    if (showSelector) {
      const sel = document.getElementById('mj-personne-sel');
      if (sel) sel.onchange = e => { st.selectedPersonneId = e.target.value; App.refresh(); };
    }

    const btnWeek = document.getElementById('mj-btn-week');
    if (btnWeek) btnWeek.onclick = () => {
      App.navigate('calendrier');
    };

    const btnNextWeek = document.getElementById('mj-btn-nextweek');
    if (btnNextWeek) btnNextWeek.onclick = () => {
      App.navigate('gantt');
    };

    // Rendre chaque ligne de tâche cliquable
    document.querySelectorAll('[data-tache-id]').forEach(el => {
      el.addEventListener('click', () => {
        App.navigateToTarget({ view: 'gantt', tacheId: el.dataset.tacheId });
      });
      el.style.cursor = 'pointer';
    });
  },

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
            <strong>${t.nom}</strong>
            ${prj ? `<span class="badge" style="background:${prj.couleur}22;color:${prj.couleur}">${prj.code}</span>` : ''}
            ${lieu ? `<span class="badge muted">${lieu.nom}</span>` : ''}
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
    return `<table class="data">
      <thead>
        <tr>
          <th>Tâche</th>
          <th>Projet</th>
          <th>Début</th>
          <th>Fin</th>
          <th>Avancement</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${taches.map(t => {
          const prj  = DB.projet(t.projetId);
          const pct  = t.avancement || 0;
          const today = D.today();
          const isLate = t.fin < today && pct < 100;
          const barCls = isLate ? 'bad' : pct >= 100 ? 'good' : '';
          return `<tr data-tache-id="${t.id}" role="button" tabindex="0">
            <td>
              <strong>${t.nom}</strong>
              ${isLate ? '<span class="badge bad" style="font-size:9px;margin-left:4px">retard</span>' : ''}
            </td>
            <td>${prj ? `<span class="badge" style="background:${prj.couleur}22;color:${prj.couleur}">${prj.code}</span>` : '<span class="muted">—</span>'}</td>
            <td class="mono">${D.fmt(t.debut)}</td>
            <td class="mono">${D.fmt(t.fin)}</td>
            <td style="min-width:120px">
              <div style="display:flex;align-items:center;gap:6px">
                <div class="bar-inline ${barCls}" style="flex:1"><div class="fill" style="width:${pct}%"></div></div>
                <span class="small muted">${pct}%</span>
              </div>
            </td>
            <td>
              <button class="btn-ghost small mj-gantt-btn" data-tache-id="${t.id}" title="Voir dans le Gantt">→ Gantt</button>
            </td>
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
          <div>
            <strong>${a.motif}</strong>
            ${a.note ? `<span class="muted small"> · ${a.note}</span>` : ''}
          </div>
          <div class="small muted">${D.fmt(a.debut)} → ${D.fmt(a.fin)} · ${nbJours} j. ouvré(s)</div>
        </div>
        <span class="badge ${encours ? 'bad' : 'warn'}">${encours ? 'en cours' : 'à venir'}</span>
        <span class="alert-arrow">›</span>
      </li>`;
    }).join('')}</ul>`;
  },

  _renderDeplacements(deplacements) {
    if (!deplacements.length) return `<p class="muted">Aucun déplacement dans les 7 prochains jours.</p>`;
    return `<ul class="list">${deplacements.map(d => {
      const origine  = DB.lieu(d.origineId);
      const dest     = DB.lieu(d.destinationId);
      const prj      = DB.projet(d.projetId);
      return `<li class="alert-row" onclick="App.navigate('deplacements')" role="button" tabindex="0" style="cursor:pointer">
        <div>
          <div>
            <strong>${d.motif}</strong>
            ${prj ? `<span class="badge" style="background:${prj.couleur}22;color:${prj.couleur};margin-left:6px">${prj.code}</span>` : ''}
          </div>
          <div class="small muted">${D.fmt(d.date)} · ${origine ? origine.nom : '—'} → ${dest ? dest.nom : '—'} · ${d.duree}</div>
        </div>
        <span class="alert-arrow">›</span>
      </li>`;
    }).join('')}</ul>`;
  },

  draw() {
    // draw() vide — la vue ne fait pas de rendu canvas/SVG incrémental
  },
};
