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
        <input type="file" id="p-import-file" accept=".csv,.json" hidden>
        <button class="btn-ghost" id="p-import" data-perm="edit" title="Importer des personnes depuis un fichier CSV ou JSON">⬆ Importer</button>
        <button class="btn-ghost" id="p-tpl" title="Télécharger un modèle CSV pour importer des personnes">⬇ Modèle</button>
        <button class="btn-ghost" id="p-csv" title="Exporter la liste des personnes en CSV">⤓ Exporter CSV</button>
        <button class="btn-ghost" id="p-export" title="Exporter le planning hebdomadaire en CSV (ouvrable dans Excel)">⬇ Planning CSV</button>
        <button class="btn" id="p-add">+ Ajouter une personne</button>
      </div>
      <div class="card"><div id="p-table"></div></div>
    `;
    document.getElementById('p-search').oninput = e => { this.state.search = e.target.value.toLowerCase(); this.draw(); };
    document.getElementById('p-role').onchange = e => { this.state.roleFilter = e.target.value; this.draw(); };
    document.getElementById('p-lieu').onchange = e => { this.state.lieuFilter = e.target.value; this.draw(); };
    document.getElementById('p-add').onclick = () => this.openForm(null);
    document.getElementById('p-tpl').onclick = () => this.downloadPersonnesTemplate();
    document.getElementById('p-csv').onclick = () => this.exportPersonnesCSV();
    document.getElementById('p-export').onclick = () => this.exportPlanningCSV();
    document.getElementById('p-import').onclick = () => document.getElementById('p-import-file').click();
    document.getElementById('p-import-file').onchange = e => {
      this.importPersonnesFile(e.target.files[0]);
      e.target.value = '';
    };
    this.draw();
  },
  draw() {
    const st = this.state, s = DB.state;
    let list = s.personnes.slice();
    if (st.search) list = list.filter(p => (p.prenom+' '+p.nom+' '+p.role+' '+(p.competences||[]).join(' ')).toLowerCase().includes(st.search));
    if (st.roleFilter) list = list.filter(p => p.role === st.roleFilter);
    if (st.lieuFilter) list = list.filter(p => p.lieuPrincipalId === st.lieuFilter);

    const today = D.today();
    const isoWeek = s => { const d = D.parse(s); const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - (d.getUTCDay() || 7))); return Math.ceil(((thu - new Date(Date.UTC(thu.getUTCFullYear(), 0, 1))) / 864e5 + 1) / 7); };
    // Charge sur 4 semaines glissantes
    const weeks = [];
    let weekStart = today;
    for (let w=0; w<4; w++) {
      const weekEnd = D.addWorkdays(weekStart, 4);
      weeks.push({ start: weekStart, end: weekEnd, num: isoWeek(weekStart) });
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
      const cells = perWeek.map((w, wi) => {
        const cls = w.pct > 95 ? 'bad' : w.pct > 80 ? 'warn' : '';
        const jours = w.h / 7;
        const jLbl = jours > 0 ? (Number.isInteger(jours) ? jours + 'j' : jours.toFixed(1) + 'j') : '—';
        const tooltip = `S${weeks[wi].num} · ${w.h}h assignées · ${jLbl} · capacité ${p.capaciteHebdo}h · ${w.pct}%${w.pct > 95 ? ' ⚠ surcharge — cliquer pour voir les tâches' : w.pct > 80 ? ' — cliquer pour voir les tâches' : ''}`;
        const wNumColor = w.pct > 95 ? 'var(--error,#c43b3b)' : w.pct > 80 ? 'var(--warning,#c47800)' : 'var(--text-muted)';
        const hasLoad = w.h > 0;
        return `<div class="week-cell${cls ? ' week-cell-clickable' : (hasLoad ? ' week-cell-clickable' : '')}" data-pid="${p.id}" data-wi="${wi}" style="text-align:center;cursor:${hasLoad||cls?'pointer':'default'};border-radius:4px;padding:1px 2px" title="${tooltip}">`
          + `<div style="font-size:9px;font-weight:600;color:${wNumColor};line-height:1;margin-bottom:2px">S${weeks[wi].num}</div>`
          + `<div class="bar-inline ${cls}" style="width:28px"><div class="fill" style="width:${w.pct}%"></div></div>`
          + `<div style="font-size:9px;color:${cls==='bad'?'var(--error,#c43b3b)':cls==='warn'?'var(--warning,#c47800)':'var(--text-muted)'};margin-top:1px;line-height:1;font-weight:${cls?'600':'400'}">${jLbl}</div>`
          + '</div>';
      }).join('');
      const avgCls = avgPct > 95 ? 'bad' : avgPct > 80 ? 'warn' : '';
      const h = p.horaires || defaultHoraires();
      const canEdit = App.can('edit');
      // N'afficher que les jours ouvrés (lun-ven) dans la mini cartographie
      const joursAffichage = JOURS_SEMAINE.slice(0, 5);
      const hMini = `<div class="horaires-mini" title="${canEdit?'Clic pour basculer matin/après-midi':'Profil de travail hebdomadaire'}">${joursAffichage.map((j,i) => {
        const atts = (slot) => canEdit ? `data-pid="${p.id}" data-jour="${j}" data-slot="${slot}"` : '';
        const cls = (on) => `h-slot ${on?'on':''} ${canEdit?'clickable':''}`;
        return `<div class="h-day"><div class="h-label">${JOURS_COURT[i]}</div><div class="${cls(h[j]?.matin)}" ${atts('matin')} title="${j} matin"></div><div class="${cls(h[j]?.aprem)}" ${atts('aprem')} title="${j} après-midi"></div></div>`;
      }).join('')}</div>`;
      return `<tr data-id="${p.id}"${p.pendingValidation ? ' style="background:#fff8ed;"' : ''}>
        <td><strong class="p-name" style="cursor:pointer">${App.personneLabel(p)}</strong>${p.pendingValidation ? ' <span class="badge warn" title="Importé automatiquement — à valider">⚠ À valider</span>' : ''}</td>
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

    this._weeks = weeks;
    document.getElementById('p-table').innerHTML = `
      <div class="tbl-wrap"><table class="data col-freeze-1">
        <thead><tr><th>Personne</th><th>Rôle</th><th>Lieu principal</th><th>Compétences</th><th title="Profil hebdo (L M M J V S D × matin/aprem)">Horaires</th><th>Tâches 7j</th><th title="Charge par semaine · Rouge = ≥96% de la capacité hebdo (surcharge) · Orange = ≥81% · Cliquer sur une semaine pour voir les tâches">Charge · ${weeks.map(w=>'S'+w.num).join(' · ')}</th><th class="right">Moy.</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="muted small" style="margin-top:10px">${list.length} personne(s) · carrés pleins = dispo · 📅 = planning personnel · cliquer sur une semaine pour voir le détail</p>
    `;
    document.querySelectorAll('#p-table tbody .p-name').forEach(el => el.onclick = () => this.openForm(el.closest('tr').dataset.id));
    document.querySelectorAll('#p-table tbody .p-semaine').forEach(b => b.onclick = e => { e.stopPropagation(); this.openSemaine(b.dataset.id); });
    document.querySelectorAll('#p-table .week-cell-clickable').forEach(el => {
      el.onclick = e => { e.stopPropagation(); this.openWeekDetail(el.dataset.pid, +el.dataset.wi); };
      el.onmouseenter = () => el.style.background = 'var(--surface-2,#f3f4f6)';
      el.onmouseleave = () => el.style.background = '';
    });
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

  openWeekDetail(pid, wi) {
    const p = DB.personne(pid);
    if (!p) return;
    const w = (this._weeks || [])[wi];
    if (!w) return;
    const s = DB.state;
    const ts = s.taches.filter(t => (t.assignes||[]).includes(p.id) && t.fin >= w.start && t.debut <= w.end)
      .sort((a,b) => a.debut.localeCompare(b.debut));
    const absences = (p.absences||[]).filter(a => a.fin >= w.start && a.debut <= w.end);
    const h = ts.reduce((n,t) => n + D.weekdaysBetween(t.debut > w.start ? t.debut : w.start, t.fin < w.end ? t.fin : w.end) * 7, 0);
    const pct = Math.min(100, Math.round(h / p.capaciteHebdo * 100));
    const cls = pct > 95 ? 'bad' : pct > 80 ? 'warn' : 'good';
    const statusLabel = pct > 95 ? '⚠ Surcharge' : pct > 80 ? '⚡ Proche du max' : '✓ OK';

    const taskRows = ts.length ? ts.map(t => {
      const prj = DB.projet(t.projetId);
      const lieu = DB.lieu(t.lieuId);
      const av = t.avancement || 0;
      const avCls = av === 100 ? 'good' : av > 0 ? 'warn' : '';
      const jours = D.weekdaysBetween(t.debut > w.start ? t.debut : w.start, t.fin < w.end ? t.fin : w.end);
      return `<tr class="wd-task-row" data-tid="${t.id}" style="cursor:pointer">
        <td><span class="badge" style="background:${prj?prj.couleur+'22':''};color:${prj?prj.couleur:'var(--text-muted)'};border:1px solid ${prj?prj.couleur+'55':'var(--border)'}">${prj?prj.code:'—'}</span></td>
        <td><strong>${t.nom}</strong></td>
        <td class="muted small">${lieu?lieu.nom:'—'}</td>
        <td class="muted small">${D.fmt(t.debut)} → ${D.fmt(t.fin)}</td>
        <td class="right"><span class="muted small">${jours}j</span></td>
        <td class="right"><span class="badge ${avCls}">${av}%</span></td>
        <td class="right"><span class="wd-goto" title="Voir sur le Gantt" style="cursor:pointer;font-size:16px;color:var(--primary)">›</span></td>
      </tr>`;
    }).join('') : `<tr><td colspan="7" class="muted" style="text-align:center;padding:12px">Aucune tâche cette semaine</td></tr>`;

    const absRows = absences.map(a => `<tr>
      <td colspan="5" class="muted small">🏖 Absence : ${a.motif||'—'} · ${D.fmt(a.debut)} → ${D.fmt(a.fin)}</td>
    </tr>`).join('');

    const body = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding:10px 14px;border-radius:8px;background:var(--surface-2)">
        <div style="flex:1">
          <div class="muted small">${p.role} · ${DB.lieu(p.lieuPrincipalId)?.nom||'—'}</div>
          <div style="margin-top:4px;font-size:13px">${h}h assignées sur ${p.capaciteHebdo}h de capacité</div>
          <div class="bar-inline ${cls}" style="margin-top:6px"><div class="fill" style="width:${pct}%"></div></div>
        </div>
        <div style="text-align:center">
          <div class="badge ${cls}" style="font-size:16px;padding:6px 14px">${pct}%</div>
          <div class="muted small" style="margin-top:4px">${statusLabel}</div>
        </div>
      </div>
      <table class="data" style="width:100%">
        <thead><tr><th>Projet</th><th>Tâche</th><th>Lieu</th><th>Période</th><th class="right">Durée S${w.num}</th><th class="right">Avanc.</th><th></th></tr></thead>
        <tbody>${taskRows}${absRows}</tbody>
      </table>
      <p class="muted small" style="margin-top:8px">Cliquer sur une ligne pour aller sur le Gantt · Semaine du ${D.fmt(w.start)} au ${D.fmt(w.end)}</p>
    `;
    const surcharge = pct > 95;
    const foot = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Fermer</button>
      ${surcharge ? `<button class="btn" id="wd-resolve" style="background:var(--danger)">🔧 Résoudre la surcharge</button>` : ''}
    `;
    App.openModal(`S${w.num} — ${App.personneLabel(p)}`, body, foot);
    document.querySelectorAll('.wd-task-row').forEach(el => {
      el.onclick = () => { App.closeModal(); App.navigateToTarget({ view: 'gantt', tacheId: el.dataset.tid }); };
      el.onmouseenter = () => el.style.background = 'var(--surface-2)';
      el.onmouseleave = () => el.style.background = '';
    });
    if (surcharge) {
      const btn = document.getElementById('wd-resolve');
      if (btn) btn.onclick = () => this.openSurchargeResolver(pid, wi);
    }
  },

  openSurchargeResolver(pid, wi) {
    const p = DB.personne(pid);
    const w = (this._weeks||[])[wi];
    if (!p || !w) return;
    const s = DB.state;

    // Tâches en surcharge cette semaine
    const ts = s.taches.filter(t =>
      (t.assignes||[]).includes(p.id) && t.fin >= w.start && t.debut <= w.end && !t.jalon
    ).sort((a,b) => a.debut.localeCompare(b.debut));

    // Pour chaque tâche : chercher des personnes alternatives disponibles
    const _weekLoad = (altId) => {
      const h = s.taches
        .filter(t => (t.assignes||[]).includes(altId) && t.fin >= w.start && t.debut <= w.end)
        .reduce((n,t) => {
          const a = t.debut > w.start ? t.debut : w.start;
          const b = t.fin < w.end ? t.fin : w.end;
          return n + D.weekdaysBetween(a,b) * 7;
        }, 0);
      const alt = DB.personne(altId);
      return alt ? Math.round(h / (alt.capaciteHebdo||35) * 100) : 100;
    };

    const altsForTask = (t) => s.personnes
      .filter(alt => {
        if (alt.id === p.id || alt.id === t.projetId) return false;
        // Compétences compatibles (si la personne en surcharge en a)
        const pComps = p.competences || [];
        const aComps = alt.competences || [];
        const compOk = !pComps.length || pComps.some(c => aComps.includes(c));
        return compOk && _weekLoad(alt.id) < 85;
      })
      .sort((a,b) => _weekLoad(a.id) - _weekLoad(b.id))
      .slice(0, 3);

    // Impact projet si décalage à la semaine suivante
    const _shiftImpact = (t) => {
      const nextStart = D.addWorkdays(w.end, 1);
      const dur = Math.max(1, D.workdaysBetween(t.debut, t.fin));
      const newEnd = D.addWorkdays(nextStart, dur - 1);
      const prj = DB.projet(t.projetId);
      const delta = prj && newEnd > prj.fin ? D.weekdaysBetween(prj.fin, newEnd) : 0;
      return { nextStart, newEnd, prj, delta };
    };

    // HTML pour chaque tâche
    const taskCards = ts.map((t, idx) => {
      const prj = DB.projet(t.projetId);
      const col = prj?.couleur || '#888';
      const alts = altsForTask(t);
      const { nextStart, newEnd, delta } = _shiftImpact(t);
      const altOptions = alts.length
        ? alts.map(alt => {
            const load = _weekLoad(alt.id);
            return `<button type="button" class="btn btn-secondary sr-reassign" data-tid="${t.id}" data-altid="${alt.id}" style="font-size:11px;padding:3px 8px">
              👤 ${App.personneLabel(alt)} <span class="badge ${load<60?'good':'warn'}" style="font-size:9px">${load}%</span>
            </button>`;
          }).join('')
        : `<span class="muted small">Aucune personne disponible avec compétences compatibles</span>`;

      const riskHtml = delta > 0
        ? `<div style="margin-top:6px;padding:6px 8px;border-radius:6px;background:#fff3cd;border:1px solid #f0ad4e;font-size:11px">
            ⚠ Décaler impacte <strong>${prj?.nom||'le projet'}</strong> : fin repoussée de <strong>+${delta}j</strong> (${D.fmt(prj.fin)} → ${D.fmt(newEnd)})
          </div>`
        : `<div class="muted small" style="margin-top:4px">✓ Décaler n'impacte pas la fin du projet</div>`;

      return `<div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span class="badge" style="background:${col}22;color:${col};border:1px solid ${col}55">${prj?.code||'—'}</span>
          <strong>${t.nom}</strong>
          <span class="muted small">${D.fmt(t.debut)} → ${D.fmt(t.fin)}</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
          <span class="muted small" style="flex-shrink:0">🔄 Réassigner à :</span>
          ${altOptions}
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="muted small" style="flex-shrink:0">📅 Décaler à :</span>
          <button type="button" class="btn btn-secondary sr-shift" data-tid="${t.id}" style="font-size:11px;padding:3px 8px">
            S${wi+2 <= 53 ? wi+2 : 1} · ${D.fmt(nextStart)} → ${D.fmt(newEnd)}
          </button>
          <button type="button" class="btn-ghost sr-gantt" data-tid="${t.id}" style="font-size:11px">→ Gantt</button>
        </div>
        ${riskHtml}
      </div>`;
    }).join('');

    const noTask = !ts.length
      ? `<p class="muted">Aucune tâche trouvée pour cette semaine.</p>`
      : '';

    const body = `
      <div style="padding:8px 12px;border-radius:8px;background:#fff3cd;border:1px solid #f0ad4e;margin-bottom:14px;font-size:12px">
        ⚠ <strong>${App.personneLabel(p)}</strong> est en surcharge sur la semaine S${w.num} (${D.fmt(w.start)} → ${D.fmt(w.end)}).
        Choisis une action pour chaque tâche.
      </div>
      ${noTask}${taskCards}
      <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px">
        <button type="button" class="btn-ghost" id="sr-majourney" style="font-size:12px">👥 Ouvrir Planning équipe</button>
      </div>
    `;
    App.openOverlay(`🔧 Résoudre surcharge — ${App.personneLabel(p)} — S${w.num}`, body,
      `<button class="btn btn-secondary" id="sr-close">Fermer</button>`);

    document.getElementById('sr-close').onclick = () => App.closeOverlay();
    document.getElementById('sr-majourney').onclick = () => {
      App.closeOverlay(); App.closeModal();
      App.views.majourney.state.mode = 'equipe';
      App.navigate('majourney');
    };

    // Réassigner
    document.querySelectorAll('.sr-reassign').forEach(btn => {
      btn.onclick = () => {
        const t = s.taches.find(x => x.id === btn.dataset.tid);
        const altId = btn.dataset.altid;
        if (!t || !altId) return;
        t.assignes = (t.assignes||[]).filter(x => x !== p.id);
        if (!t.assignes.includes(altId)) t.assignes.push(altId);
        DB.logAudit('update','tache',t.id,'réassignation surcharge');
        DB.save();
        App.toast(`✓ Tâche réassignée à ${App.personneLabel(DB.personne(altId))}`, 'success');
        App.closeOverlay(); App.closeModal(); App.refresh();
      };
    });

    // Décaler
    document.querySelectorAll('.sr-shift').forEach(btn => {
      btn.onclick = () => {
        const t = s.taches.find(x => x.id === btn.dataset.tid);
        if (!t) return;
        const dur = Math.max(1, D.workdaysBetween(t.debut, t.fin));
        const nextStart = D.addWorkdays(w.end, 1);
        const newEnd = D.addWorkdays(nextStart, dur - 1);
        const { delta, prj } = _shiftImpact(t);
        const msg = delta > 0
          ? `Décaler "${t.nom}" du ${D.fmt(nextStart)} au ${D.fmt(newEnd)} ?\n\n⚠ Impact : fin de ${prj?.nom||'projet'} repoussée de +${delta}j (${D.fmt(prj.fin)} → ${D.fmt(newEnd)})`
          : `Décaler "${t.nom}" du ${D.fmt(nextStart)} au ${D.fmt(newEnd)} ?`;
        if (!confirm(msg)) return;
        t.debut = nextStart; t.fin = newEnd;
        DB.logAudit('update','tache',t.id,'décalage surcharge');
        DB.save();
        App.toast(`✓ Tâche déplacée au ${D.fmt(nextStart)}${delta > 0 ? ` · ⚠ ${prj?.code} fin +${delta}j` : ''}`, delta > 0 ? 'warn' : 'success');
        App.closeOverlay(); App.closeModal(); App.refresh();
      };
    });

    // Ouvrir dans Gantt
    document.querySelectorAll('.sr-gantt').forEach(btn => {
      btn.onclick = () => { App.closeOverlay(); App.closeModal(); App.navigateToTarget({ view:'gantt', tacheId: btn.dataset.tid }); };
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
        return `<li class="alert-row" data-tid="${t.id}" role="button" tabindex="0"><div style="flex:1"><span class="badge" style="background:${prj?prj.couleur+'33':''};color:${prj?prj.couleur:''}">${prj?prj.code:''}</span> <strong>${t.nom}</strong> <span class="muted small">· ${D.fmt(t.debut)}→${D.fmt(t.fin)} · ${lieu?lieu.nom:'—'}</span></div><span class="alert-arrow">›</span></li>`;
      }).join('') : '<li class="muted">Aucune tâche.</li>';
      const dItems = r.deps.length ? r.deps.map(d => {
        const o = DB.lieu(d.origineId), de = DB.lieu(d.destinationId);
        return `<li class="alert-row" data-did="${d.id}" role="button" tabindex="0"><div style="flex:1">🚚 ${D.fmt(d.date)} · ${d.motif} · ${o?o.nom:'—'} → ${de?de.nom:'—'} · ${d.duree}</div><span class="alert-arrow">›</span></li>`;
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
        <ul class="list list-clickable">${tItems}</ul>
        ${r.deps.length ? `<h4 style="margin:10px 0 4px 0">Déplacements (${r.deps.length})</h4><ul class="list list-clickable">${dItems}</ul>` : ''}
      </div>`;
    };

    const body = `
      <div class="muted small" style="margin-bottom:10px">${p.role} · ${DB.lieu(p.lieuPrincipalId)?.nom || '—'} · Capacité ${p.capaciteHebdo}h/sem · Compétences : ${(p.competences||[]).join(', ')||'—'}</div>
      ${renderBloc('Cette semaine', today, weekEnd, cette)}
      ${renderBloc('Semaine prochaine', nextWeekStart, nextWeekEnd, prochaine)}
    `;
    const foot = `<button class="btn btn-secondary" onclick="window.print()">⎙ Imprimer</button><span class="spacer" style="flex:1"></span><button class="btn" onclick="App.closeModal()">Fermer</button>`;
    App.openModal('Ma semaine — ' + App.personneLabel(p), body, foot);
    document.querySelectorAll('[data-tid]').forEach(el => el.onclick = () => {
      App.closeModal(); App.navigateToTarget({ view: 'gantt', tacheId: el.dataset.tid });
    });
    document.querySelectorAll('[data-did]').forEach(el => el.onclick = () => {
      App.closeModal(); App.navigate('deplacements');
    });
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
      ${p.pendingValidation ? `<div style="background:#fff8ed;border:1px solid #f59e0b;border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:12px;color:#92400e;">
        ⚠ <strong>Personne importée automatiquement — en attente de validation.</strong><br>
        <span class="muted">Complète les informations ci-dessous puis clique sur <strong>Valider</strong> pour confirmer, ou <strong>Refuser</strong> pour supprimer cette entrée.</span>
      </div>` : ''}
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
      ${!isNew && !p.pendingValidation ? '<button class="btn btn-danger" id="pf-del">Supprimer</button>' : ''}
      ${p.pendingValidation ? '<button class="btn btn-danger" id="pf-refuse">Refuser</button>' : ''}
      <span class="spacer" style="flex:1"></span>
      <button class="btn btn-secondary" id="pf-cancel">Annuler</button>
      <button class="btn" id="pf-save">${p.pendingValidation ? '✓ Valider' : isNew ? 'Créer' : 'Enregistrer'}</button>
    `;
    App.openModal(isNew ? 'Nouvelle personne' : (p.pendingValidation ? '⚠ À valider — ' : '') + App.personneLabel(p), body, foot);
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
      const wasPending = p.pendingValidation;
      delete p.pendingValidation;
      if (isNew) s.personnes.push(p);
      DB.save(); App.closeModal();
      App.toast(wasPending ? `${p.prenom} ${p.nom} validé·e ✓` : 'Enregistré', 'success');
      App.refresh();
    };
    const refuseBtn = document.getElementById('pf-refuse');
    if (refuseBtn) refuseBtn.onclick = () => {
      if (!confirm(`Refuser et supprimer ${p.prenom} ${p.nom} ? Ses absences importées seront aussi supprimées.`)) return;
      s.personnes = s.personnes.filter(x => x.id !== p.id);
      DB.save(); App.closeModal(); App.toast(`${p.prenom} ${p.nom} refusé·e et supprimé·e`, 'info'); App.refresh();
    };
    if (!isNew && !p.pendingValidation) {
      document.getElementById('pf-del').onclick = () => {
        if (!confirm('Supprimer cette personne ? Ses affectations de tâches seront retirées.')) return;
        s.personnes = s.personnes.filter(x => x.id !== p.id);
        s.taches.forEach(t => t.assignes = (t.assignes||[]).filter(a => a !== p.id));
        DB.save(); App.closeModal(); App.toast('Supprimée','info'); App.refresh();
      };
    }
  },

  // Import CSV/JSON de personnes
  importPersonnesFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    const r = new FileReader();
    r.onload = () => {
      try {
        const rows = ext === 'json' ? JSON.parse(r.result) : this.parsePersonnesCSV(r.result);
        this.previewImport(rows);
      } catch (e) { App.toast('Fichier invalide : ' + e.message, 'error'); }
    };
    r.readAsText(file);
  },

  parsePersonnesCSV(text) {
    text = text.replace(/^﻿/, ''); // retirer le BOM UTF-8
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const sep = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''));
    const get = (cols, variants) => {
      for (const v of variants) {
        const idx = headers.indexOf(v);
        if (idx >= 0) return (cols[idx] || '').trim();
      }
      return '';
    };
    return lines.slice(1).map(line => {
      const cols = line.split(sep);
      const prenom = get(cols, ['prenom','firstname','first name','first_name','prénom']);
      const nom    = get(cols, ['nom','name','lastname','last name','last_name','surname']);
      const role   = get(cols, ['role','rôle','poste','fonction','position']);
      const lieu   = get(cols, ['lieu','lieu principal','atelier','lieuprincipald','workshop']);
      const compsRaw = get(cols, ['competences','compétences','skills','competence']);
      const capa   = parseInt(get(cols, ['capacite hebdo','capacité hebdo','capacite','heures semaine','h semaine','heures/semaine'])) || 35;
      if (!prenom || !nom) return null;
      return {
        prenom, nom,
        role: role || 'Opérateur·rice',
        lieu,
        competences: compsRaw ? compsRaw.split(/[/,|]/).map(c=>c.trim()).filter(Boolean) : [],
        capaciteHebdo: capa,
      };
    }).filter(Boolean);
  },

  previewImport(rows) {
    if (!rows || !rows.length) { App.toast('Aucune personne à importer', 'warn'); return; }
    const s = DB.state;
    const existing = new Map(s.personnes.map(p => [(p.prenom+' '+p.nom).toLowerCase(), p]));
    const toCreate = [], toUpdate = [];
    rows.forEach(r => {
      const key = (r.prenom + ' ' + r.nom).toLowerCase();
      existing.has(key) ? toUpdate.push({ ex: existing.get(key), data: r }) : toCreate.push(r);
    });
    const findLieu = name => s.lieux.find(l => l.type==='production' && l.nom.toLowerCase().includes((name||'').toLowerCase()));
    const firstProd = s.lieux.find(l => l.type==='production');

    const mkRow = (action, badge, r) => {
      const lieu = findLieu(r.lieu);
      const lieuCell = lieu ? lieu.nom : (r.lieu ? `<span class="badge warn">${r.lieu} — non trouvé</span>` : '—');
      return `<tr><td>${badge}</td><td>${r.prenom}</td><td>${r.nom}</td><td>${r.role}</td><td>${lieuCell}</td><td class="small">${r.competences.join(', ')||'—'}</td><td>${r.capaciteHebdo}h</td></tr>`;
    };
    const body = `
      <p class="muted small" style="margin-bottom:8px">
        ${rows.length} ligne(s) · <span class="badge good">${toCreate.length} à créer</span> <span class="badge warn">${toUpdate.length} à mettre à jour</span>
      </p>
      <div style="overflow:auto;max-height:55vh">
        <table class="data">
          <thead><tr><th>Action</th><th>Prénom</th><th>Nom</th><th>Rôle</th><th>Lieu</th><th>Compétences</th><th>Capa.</th></tr></thead>
          <tbody>
            ${toCreate.map(r => mkRow('create', '<span class="badge good">+ créer</span>', r)).join('')}
            ${toUpdate.map(({data:r}) => mkRow('update', '<span class="badge warn">↻ màj</span>', r)).join('')}
          </tbody>
        </table>
      </div>
      <p class="muted small" style="margin-top:8px">Màj = met à jour rôle, lieu, compétences et capacité (même prénom + nom). Les tâches et horaires existants sont conservés.</p>
    `;
    const foot = `
      <button class="btn-ghost" id="pi-tpl" title="Télécharger un modèle CSV">⬇ Modèle CSV</button>
      <span style="flex:1"></span>
      <button class="btn btn-secondary" onclick="App.closeModal()">Annuler</button>
      <button class="btn" id="pi-ok">Importer (${rows.length})</button>
    `;
    App.openModal('Aperçu import — Personnes', body, foot);
    document.getElementById('pi-tpl').onclick = () => this.downloadPersonnesTemplate();
    document.getElementById('pi-ok').onclick = () => {
      let created = 0, updated = 0;
      toCreate.forEach(r => {
        const lieu = findLieu(r.lieu) || firstProd;
        const p = {
          id: DB.uid('P'), prenom: r.prenom, nom: r.nom, role: r.role,
          lieuPrincipalId: lieu?.id || null,
          competences: r.competences, capaciteHebdo: r.capaciteHebdo,
          couleur: '#' + ((Math.random()*0xffffff)|0).toString(16).padStart(6,'0'),
          horaires: defaultHoraires(), absences: [],
        };
        s.personnes.push(p);
        DB.logAudit('create','personne',p.id,p.prenom+' '+p.nom+' (import)');
        created++;
      });
      toUpdate.forEach(({ex, data:r}) => {
        const lieu = findLieu(r.lieu);
        ex.role = r.role || ex.role;
        if (lieu) ex.lieuPrincipalId = lieu.id;
        if (r.competences.length) ex.competences = r.competences;
        if (r.capaciteHebdo) ex.capaciteHebdo = r.capaciteHebdo;
        DB.logAudit('update','personne',ex.id,ex.prenom+' '+ex.nom+' (import)');
        updated++;
      });
      DB.save(); App.closeModal();
      App.toast(`Import : ${created} créée(s), ${updated} mise(s) à jour`, 'success');
      App.refresh();
    };
  },

  exportPersonnesCSV() {
    const s = DB.state;
    const rows = [['Prénom','Nom','Rôle','Lieu principal','Compétences','Capacité hebdo (h)']];
    s.personnes.forEach(p => rows.push([
      p.prenom, p.nom, p.role||'',
      DB.lieu(p.lieuPrincipalId)?.nom||'',
      (p.competences||[]).join('/'),
      p.capaciteHebdo||35,
    ]));
    CSV.download('personnes-' + D.today() + '.csv', rows);
    App.toast('Export CSV téléchargé', 'success');
  },

  downloadPersonnesTemplate() {
    const rows = [
      ['Prénom','Nom','Rôle','Lieu principal','Compétences (séparées par /)','Capacité hebdo (h)'],
      ['Marie','Martin','Chef·fe de projet','Atelier 2A','CNC/Élec','35'],
      ['Pierre','Bernard','Technicien·ne','Atelier 2B','Soudure/Montage','35'],
      ['Sophie','Dubois','Opérateur·rice','Atelier 1A','Laser/Contrôle/CAO','28'],
      ['Luc','Durand','Soudeur·se','Atelier 1B','Soudure','35'],
    ];
    CSV.download('modele-import-personnes.csv', rows);
    App.toast('Modèle CSV téléchargé', 'info');
  },

  // Export CSV planning hebdomadaire (ouvrable dans Excel)
  exportPlanningCSV() {
    const s = DB.state;
    const today = D.today();
    const weekEnd = D.addWorkdays(today, 4);
    const rows = [['Personne','Rôle','Lieu','Jour','Date','Tâches','Déplacements','Absent','Heures']];
    const days = [];
    let cur = today; while (cur <= weekEnd) { days.push(cur); cur = D.addDays(cur, 1); }
    s.personnes.forEach(p => {
      days.forEach(d => {
        const absent = DB.personneAbsenteLe(p.id, d);
        const absInfo = absent ? (p.absences||[]).find(a => a.debut <= d && a.fin >= d) : null;
        const ts = s.taches.filter(t => (t.assignes||[]).includes(p.id) && t.debut <= d && t.fin >= d && !t.jalon);
        const deps = s.deplacements.filter(x => x.personneId === p.id && x.date === d);
        const tNames = ts.map(t => {
          const prj = DB.projet(t.projetId);
          return (prj?prj.code+' · ':'')+t.nom;
        }).join(' | ');
        const dNames = deps.map(x => {
          const o = DB.lieu(x.origineId), de = DB.lieu(x.destinationId);
          return `${x.motif} (${o?o.nom:''} → ${de?de.nom:''})`;
        }).join(' | ');
        const dow = JOURS_SEMAINE[(D.parse(d).getUTCDay()+6)%7];
        const h = p.horaires || defaultHoraires();
        const demiJ = ((h[dow]?.matin?1:0) + (h[dow]?.aprem?1:0));
        const heures = absent ? 0 : demiJ * 3.5 * (ts.length?1:0);
        rows.push([
          App.personneLabel(p), p.role, DB.lieu(p.lieuPrincipalId)?.nom||'',
          JOURS_COURT[(D.parse(d).getUTCDay()+6)%7], D.fmt(d),
          tNames, dNames,
          absent ? absInfo.motif : '',
          heures.toFixed(1).replace('.', ','),
        ]);
      });
      rows.push([]); // ligne vide entre personnes
    });
    CSV.download(`planning-${D.iso(new Date())}.csv`, rows);
    App.toast('Planning exporté en CSV','success');
  },
};
