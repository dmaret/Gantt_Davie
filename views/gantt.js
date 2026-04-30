App.views.gantt = {
  _PERSIST_KEY: 'gantt_filters_v1',
  _loadPersistedState() {
    try {
      const saved = JSON.parse(localStorage.getItem(this._PERSIST_KEY) || '{}');
      if (saved.mode)        this.state.mode        = saved.mode;
      if (saved.zoom)        this.state.zoom        = saved.zoom;
      if (saved.projetFilter !== undefined) this.state.projetFilter = saved.projetFilter;
      if (saved.rangeDays)   this.state.rangeDays   = saved.rangeDays;
      if (saved.showDeps     !== undefined) this.state.showDeps     = saved.showDeps;
      if (saved.showCritical !== undefined) this.state.showCritical = saved.showCritical;
      if (saved.autoCascade  !== undefined) this.state.autoCascade  = saved.autoCascade;
    } catch(e) {}
  },
  _savePersistedState() {
    const st = this.state;
    try { localStorage.setItem(this._PERSIST_KEY, JSON.stringify({ mode:st.mode, zoom:st.zoom, projetFilter:st.projetFilter, rangeDays:st.rangeDays, showDeps:st.showDeps, showCritical:st.showCritical, autoCascade:st.autoCascade })); } catch(e) {}
  },
  state: {
    mode: 'projet',      // 'projet' | 'personne' | 'machine' | 'lieu'
    zoom: 'jour',        // 'jour' | 'semaine' | 'mois'
    rangeStart: null,
    rangeDays: 56,
    projetFilter: '',
    search: '',
    showDeps: true,
    showCritical: true,
    autoCascade: true,
    selectedIds: new Set(),
    baselineId: null,
  },
  newItem() { this.openTacheForm(null); },

  toggleSelection(tid) {
    const sel = this.state.selectedIds;
    if (sel.has(tid)) sel.delete(tid); else sel.add(tid);
    const el = document.querySelector(`.gantt-bar[data-tid="${tid}"]`);
    if (el) el.classList.toggle('selected', sel.has(tid));
    this.renderSelectionBar();
  },
  clearSelection() {
    this.state.selectedIds.clear();
    document.querySelectorAll('.gantt-bar.selected').forEach(b => b.classList.remove('selected'));
    this.renderSelectionBar();
  },
  renderSelectionBar() {
    const existing = document.getElementById('gantt-selection-bar');
    const n = this.state.selectedIds.size;
    if (!n) { if (existing) existing.remove(); return; }
    const s = DB.state;
    const projOpts = App.projetsOptions('', 'Projet…');
    const html = `
      <strong>${n} tâche(s) sélectionnée(s)</strong>
      <span class="spacer"></span>
      <label class="small">Décaler de</label>
      <input type="number" id="sel-shift" value="1" style="width:60px">
      <label class="small">j. ouvrés</label>
      <button class="btn btn-secondary" id="sel-shift-btn" data-perm="edit">⏩ Appliquer</button>
      <select id="sel-proj" data-perm="edit">${projOpts}</select>
      <button class="btn btn-secondary" id="sel-proj-btn" data-perm="edit">Changer projet</button>
      <button class="btn btn-danger" id="sel-del" data-perm="edit">🗑 Supprimer</button>
      <button class="btn-ghost" id="sel-clear">✕ Désélectionner</button>
    `;
    if (existing) { existing.innerHTML = html; }
    else {
      const bar = document.createElement('div');
      bar.id = 'gantt-selection-bar';
      bar.className = 'selection-bar';
      bar.innerHTML = html;
      document.body.appendChild(bar);
    }
    document.getElementById('sel-clear').onclick = () => this.clearSelection();
    document.getElementById('sel-shift-btn').onclick = () => this.bulkShift();
    document.getElementById('sel-proj-btn').onclick = () => this.bulkChangeProject();
    document.getElementById('sel-del').onclick = () => this.bulkDelete();
    App.applyPerms();
  },
  bulkShift() {
    if (!App.can('edit')) { App.toast('Lecture seule','error'); return; }
    const n = +document.getElementById('sel-shift').value;
    if (!n) return;
    const ids = Array.from(this.state.selectedIds);
    ids.forEach(id => {
      const t = DB.tache(id); if (!t) return;
      t.debut = D.addWorkdays(t.debut, n);
      t.fin = D.addWorkdays(t.fin, n);
    });
    DB.save(); this.draw();
    App.toast(`${ids.length} tâche(s) décalée(s) de ${n>0?'+':''}${n} j.`, 'success');
  },
  bulkChangeProject() {
    if (!App.can('edit')) { App.toast('Lecture seule','error'); return; }
    const pid = document.getElementById('sel-proj').value;
    if (!pid) { App.toast('Choisir un projet','warn'); return; }
    const ids = Array.from(this.state.selectedIds);
    ids.forEach(id => { const t = DB.tache(id); if (t) t.projetId = pid; });
    DB.save(); this.draw();
    App.toast(`${ids.length} tâche(s) déplacée(s)`, 'success');
  },
  bulkDelete() {
    if (!App.can('edit')) { App.toast('Lecture seule','error'); return; }
    const ids = Array.from(this.state.selectedIds);
    if (!confirm(`Supprimer ${ids.length} tâche(s) ? Cette action est annulable avec Ctrl+Z.`)) return;
    DB.state.taches = DB.state.taches.filter(t => !ids.includes(t.id));
    DB.state.taches.forEach(t => t.dependances = (t.dependances||[]).filter(d => !ids.includes(d)));
    this.clearSelection();
    DB.save(); this.draw();
    App.toast(`${ids.length} tâche(s) supprimée(s)`, 'info');
  },

  exportICS() {
    const s = DB.state;
    const events = [];
    s.taches.forEach(t => {
      if (t.jalon) {
        events.push({
          uid: ICS.uid('jalon', t.id),
          summary: '◆ ' + t.nom + (DB.projet(t.projetId) ? ' ['+DB.projet(t.projetId).code+']' : ''),
          dtstart: t.debut,
          dtend: D.addDays(t.debut, 1),
          description: (t.notes||'') + (t.commentaires?.length ? `\n\n${t.commentaires.length} commentaire(s)` : ''),
          location: DB.lieu(t.lieuId)?.nom || '',
        });
      } else {
        const prj = DB.projet(t.projetId);
        const assignes = (t.assignes||[]).map(pid => DB.personne(pid)).filter(Boolean).map(p => App.personneLabel(p)).join(', ');
        events.push({
          uid: ICS.uid('tache', t.id),
          summary: (prj?prj.code+' · ':'') + t.nom + (t.avancement?` (${t.avancement}%)`:''),
          dtstart: t.debut,
          dtend: D.addDays(t.fin, 1),
          description: [assignes ? 'Assignés : '+assignes : '', t.notes||'', t.commentaires?.length ? `${t.commentaires.length} commentaire(s)`:''].filter(Boolean).join('\n'),
          location: [DB.machine(t.machineId)?.nom, DB.lieu(t.lieuId)?.nom].filter(Boolean).join(' · '),
        });
      }
    });
    s.personnes.forEach(p => (p.absences||[]).forEach(a => {
      events.push({
        uid: ICS.uid('absence', a.id),
        summary: `🏖 ${a.motif||'Absence'} — ${App.personneLabel(p)}`,
        dtstart: a.debut,
        dtend: D.addDays(a.fin, 1),
        description: a.note||'',
      });
    }));
    s.deplacements.forEach(d => {
      const p = DB.personne(d.personneId);
      events.push({
        uid: ICS.uid('dep', d.id),
        summary: `🚚 ${d.motif} — ${App.personneLabel(p)}`,
        dtstart: d.date,
        dtend: D.addDays(d.date, 1),
        description: `${DB.lieu(d.origineId)?.nom||''} → ${DB.lieu(d.destinationId)?.nom||''} · ${d.duree||''}`,
      });
    });
    if (!events.length) { App.toast('Aucun événement à exporter','warn'); return; }
    ICS.download('planning-'+D.today()+'.ics', events);
    App.toast(`${events.length} événement(s) exporté(s) en .ics`, 'success');
  },

  resourceLeveling() {
    const s = DB.state;
    const today = D.today();
    const critical = this.criticalPath(s.taches);

    // Calcule la charge hebdo d'une personne (en heures) sur une semaine donnée (start=lundi)
    const weekLoad = (pid, wStart, wEnd, exclude = new Set()) =>
      s.taches.filter(t => !exclude.has(t.id) && (t.assignes||[]).includes(pid) && t.fin >= wStart && t.debut <= wEnd)
        .reduce((h, t) => h + D.weekdaysBetween(t.debut > wStart ? t.debut : wStart, t.fin < wEnd ? t.fin : wEnd) * 7, 0);

    const proposals = [];
    // Chercher les tâches déplaçables : non critique, non jalon, non terminées, début dans le futur
    const movable = s.taches.filter(t =>
      !t.jalon && !critical.has(t.id) && (t.avancement||0) < 100 && t.debut >= today &&
      (t.assignes||[]).length > 0
    );

    movable.forEach(t => {
      const durWD = Math.max(1, D.workdaysBetween(t.debut, t.fin));
      (t.assignes||[]).forEach(pid => {
        const p = DB.personne(pid);
        if (!p) return;
        const cap = p.capaciteHebdo || 35;
        // Semaine actuelle de la tâche
        const dt = D.parse(t.debut);
        const dow = dt.getUTCDay() || 7;
        const wStart = D.addDays(t.debut, -(dow - 1)); // lundi de la semaine
        const wEnd = D.addDays(wStart, 4);            // vendredi
        const load = weekLoad(pid, wStart, wEnd);
        if (load <= cap) return; // pas de surcharge

        // Chercher une semaine avec de la place (jusqu'à 8 semaines après)
        for (let w = 1; w <= 8; w++) {
          const nWStart = D.addDays(wStart, w * 7);
          const nWEnd = D.addDays(nWStart, 4);
          const nLoad = weekLoad(pid, nWStart, nWEnd, new Set([t.id]));
          const taskH = durWD * 7;
          if (nLoad + taskH <= cap * 1.1) { // tolérance 10%
            const newDebut = D.nextWorkday(nWStart);
            const newFin = D.addWorkdays(newDebut, durWD - 1);
            proposals.push({ t, pid, p, wStart, load, cap, newDebut, newFin });
            break;
          }
        }
      });
    });

    if (!proposals.length) {
      App.toast('Aucune surcharge de ressource détectée sur les tâches déplaçables.', 'success');
      return;
    }

    // Afficher les propositions
    const rows = proposals.slice(0, 20).map(pr => {
      const prj = DB.projet(pr.t.projetId);
      return `<tr class="level-row" data-tid="${pr.t.id}" data-debut="${pr.newDebut}" data-fin="${pr.newFin}">
        <td><label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" class="level-cb" checked> <span class="badge" style="background:${prj?.couleur||'#888'}22;color:${prj?.couleur||'#888'}">${prj?.code||'?'}</span> ${pr.t.nom}</label></td>
        <td class="muted small">${App.personneLabel(pr.p)}</td>
        <td><span class="badge bad">${pr.load}h / ${pr.cap}h</span></td>
        <td class="muted small">${D.fmt(pr.t.debut)} → ${D.fmt(pr.t.fin)}</td>
        <td>→ <strong>${D.fmt(pr.newDebut)} → ${D.fmt(pr.newFin)}</strong></td>
      </tr>`;
    }).join('');

    const body = `
      <p class="muted small" style="margin-bottom:8px">${proposals.length} proposition(s) de rééquilibrage · tâches non critiques uniquement · cocher pour appliquer</p>
      <div style="overflow:auto;max-height:55vh">
        <table class="data">
          <thead><tr><th>Tâche</th><th>Personne</th><th>Surcharge</th><th>Dates actuelles</th><th>Dates proposées</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="muted small" style="margin-top:8px">⚠ Seules les tâches <strong>non critiques</strong>, non terminées et à venir sont proposées. La cascade auto s'applique si activée.</p>
    `;
    const foot = `<button class="btn btn-secondary" onclick="App.closeModal()">Annuler</button><span class="spacer" style="flex:1"></span><button class="btn" id="level-apply">⚖ Appliquer les sélectionnées</button>`;
    App.openModal(`⚖ Équilibrage ressources — ${proposals.length} proposition(s)`, body, foot);
    document.getElementById('level-apply').onclick = () => {
      let n = 0;
      document.querySelectorAll('.level-row').forEach(row => {
        if (!row.querySelector('.level-cb').checked) return;
        const tach = DB.tache(row.dataset.tid);
        if (!tach) return;
        tach.debut = row.dataset.debut;
        tach.fin = row.dataset.fin;
        if (this.state.autoCascade) this.cascadeShift(tach.id, 0);
        n++;
      });
      DB.save(); App.closeModal();
      App.toast(`${n} tâche(s) rééquilibrée(s)`, 'success');
      this.draw();
    };
  },

  saveBaseline() {
    if (!App.can('edit')) { App.toast('Lecture seule','error'); return; }
    const label = prompt('Nom de cette baseline :', 'Baseline ' + D.fmt(D.today()));
    if (!label) return;
    if (!DB.state.baselines) DB.state.baselines = [];
    const snap = DB.state.taches.map(t => ({id:t.id, nom:t.nom, debut:t.debut, fin:t.fin, projetId:t.projetId, avancement:t.avancement}));
    const bl = { id: DB.uid('BL'), date: D.today(), label, snap };
    DB.state.baselines.push(bl);
    DB.save();
    this.state.baselineId = bl.id;
    App.toast('Baseline « '+label+' » sauvegardée · activée','success');
    this.render(document.getElementById('view-root'));
  },

  showRapportHebdo() {
    const s = DB.state;
    const today = D.today();
    const dt = D.parse(today);
    const dow = dt.getUTCDay() || 7;
    const monday = D.addDays(today, 1 - dow);
    const friday = D.addDays(monday, 4);
    const body = `
      <div class="row" style="gap:12px;align-items:flex-end;flex-wrap:wrap">
        <div class="field" style="flex:0"><label>Du</label><input type="date" id="rp-from" value="${monday}"></div>
        <div class="field" style="flex:0"><label>Au</label><input type="date" id="rp-to" value="${friday}"></div>
        <button class="btn btn-secondary" id="rp-gen">Générer</button>
      </div>
      <div id="rp-content" style="margin-top:12px"></div>`;
    App.openModal('📋 Rapport hebdomadaire', body, `<button class="btn btn-secondary" onclick="App.closeModal()">Fermer</button><button class="btn" id="rp-print">🖨 Imprimer</button>`);
    const gen = () => {
      const from = document.getElementById('rp-from').value;
      const to   = document.getElementById('rp-to').value;
      if (!from || !to) return;
      const fromDt = D.parse(from);
      const thu = new Date(Date.UTC(fromDt.getUTCFullYear(), fromDt.getUTCMonth(), fromDt.getUTCDate() + 4 - (fromDt.getUTCDay()||7)));
      const wn = Math.ceil(((thu - new Date(Date.UTC(thu.getUTCFullYear(),0,1)))/864e5+1)/7);
      const taches = s.taches.filter(t => !t.jalon && t.debut <= to && t.fin >= from);
      const lieux = s.lieux.filter(l => l.type === 'production');
      const absents = s.personnes.filter(p => (p.absences||[]).some(a => a.debut<=to && a.fin>=from));
      let html = `<h3 style="margin:0 0 4px">Semaine ${wn} · ${D.fmt(from)} – ${D.fmt(to)}</h3><p class="muted small" style="margin:0 0 14px">Généré le ${D.fmt(today)} · ${taches.length} tâche(s)</p>`;
      lieux.forEach(l => {
        const lt = taches.filter(t => t.lieuId === l.id).sort((a,b)=>a.debut.localeCompare(b.debut));
        if (!lt.length) return;
        html += `<div style="margin-bottom:14px"><h4 style="margin:0 0 5px;padding:3px 8px;background:var(--surface-2);border-radius:4px">📍 ${l.nom}</h4><table class="data"><thead><tr><th>Tâche</th><th>Projet</th><th>Début</th><th>Fin</th><th>Assignés</th><th>Av.</th></tr></thead><tbody>
          ${lt.map(t => { const prj=DB.projet(t.projetId); const pers=(t.assignes||[]).map(pid=>DB.personne(pid)).filter(Boolean).map(p=>App.personneLabel(p)).join(', ')||'—'; const av=t.avancement||0; return `<tr><td>${t.nom}${av===100?' ✓':''}</td><td><span class="badge" style="background:${prj?.couleur||'#888'}22;color:${prj?.couleur||'#888'}">${prj?.code||'?'}</span></td><td class="nowrap">${D.fmt(t.debut)}</td><td class="nowrap">${D.fmt(t.fin)}</td><td>${pers}</td><td><div class="bar-inline${av>=100?' good':av>=50?'':' warn'}" style="width:50px"><div class="fill" style="width:${av}%"></div></div> ${av}%</td></tr>`; }).join('')}
          </tbody></table></div>`;
      });
      const autres = taches.filter(t => !lieux.find(l=>l.id===t.lieuId)).sort((a,b)=>a.debut.localeCompare(b.debut));
      if (autres.length) html += `<div style="margin-bottom:14px"><h4 style="margin:0 0 5px;padding:3px 8px;background:var(--surface-2);border-radius:4px">📋 Autres tâches</h4><ul class="list">${autres.map(t=>{const prj=DB.projet(t.projetId);const pers=(t.assignes||[]).map(pid=>DB.personne(pid)).filter(Boolean).map(p=>App.personneLabel(p)).join(', ');return `<li><span class="badge" style="background:${prj?.couleur||'#888'}22;color:${prj?.couleur||'#888'}">${prj?.code||'?'}</span> <strong>${t.nom}</strong><span class="muted small"> · ${pers||'—'} · ${D.fmt(t.debut)}→${D.fmt(t.fin)} · ${t.avancement||0}%</span></li>`;}).join('')}</ul></div>`;
      if (absents.length) html += `<div><h4 style="margin:0 0 5px;padding:3px 8px;background:#fff3cd;border-radius:4px">🏖 Absences</h4><ul class="list">${absents.map(p=>{return (p.absences||[]).filter(a=>a.debut<=to&&a.fin>=from).map(a=>`<li><strong>${App.personneLabel(p)}</strong><span class="muted small"> · ${a.motif||'Absence'} · ${D.fmt(a.debut)}→${D.fmt(a.fin)}</span></li>`).join('');}).join('')}</ul></div>`;
      if (!taches.length && !absents.length) html += '<p class="muted">Aucune tâche ni absence sur cette période.</p>';
      document.getElementById('rp-content').innerHTML = html;
    };
    document.getElementById('rp-gen').onclick = gen;
    document.getElementById('rp-print').onclick = () => {
      const w = window.open('', '_blank');
      w.document.write(`<html><head><title>Rapport hebdomadaire</title><style>body{font-family:system-ui,sans-serif;margin:20px;font-size:12px}h3{font-size:15px;margin:0 0 4px}h4{font-size:13px;margin:0 0 5px;padding:3px 8px;background:#f0f0f0;border-radius:4px}table{width:100%;border-collapse:collapse;margin-bottom:12px}th,td{padding:4px 8px;border:1px solid #ddd;text-align:left;font-size:11px}th{background:#f5f5f5}ul{margin:0;padding:0;list-style:none}li{padding:3px 0;border-bottom:1px solid #eee}@media print{@page{size:A4 landscape;margin:10mm}}</style></head><body>${document.getElementById('rp-content').innerHTML}</body></html>`);
      w.document.close(); w.print();
    };
    gen();
  },

  criticalTasks(projetId) {
    const tasks = DB.state.taches.filter(t => t.projetId === projetId);
    const byId = Object.fromEntries(tasks.map(t => [t.id, t]));
    const dur = t => Math.max(1, D.workdaysBetween(t.debut, t.fin));
    const len = {}, pred = {};
    const sorted = tasks.slice().sort((a,b) => a.debut.localeCompare(b.debut));
    for (const t of sorted) {
      let best = dur(t), bestPred = null;
      for (const dep of (t.dependances || [])) {
        if (len[dep] !== undefined && len[dep] + dur(t) > best) {
          best = len[dep] + dur(t);
          bestPred = dep;
        }
      }
      len[t.id] = best; pred[t.id] = bestPred;
    }
    let endId = null, maxLen = -1;
    for (const id in len) if (len[id] > maxLen) { maxLen = len[id]; endId = id; }
    const critical = new Set();
    let cur = endId;
    while (cur) { critical.add(cur); cur = pred[cur]; }
    return critical;
  },

  cascadeShift(originTid, deltaDays) {
    const state = DB.state;
    const subWorkdays = (iso, n) => { let cur = iso, done = 0; while (done < n) { cur = D.addDays(cur, -1); if (!D.isWeekend(cur)) done++; } return cur; };
    const moveWD = (iso, n) => n >= 0 ? D.addWorkdays(iso, n) : subWorkdays(iso, -n);
    const queue = [originTid];
    const visited = new Set([originTid]);
    let n = 0;
    while (queue.length) {
      const tid = queue.shift();
      const followers = state.taches.filter(t => (t.dependances||[]).includes(tid));
      for (const f of followers) {
        if (visited.has(f.id)) continue;
        visited.add(f.id);
        f.debut = moveWD(f.debut, deltaDays);
        f.fin   = moveWD(f.fin,   deltaDays);
        n++;
        queue.push(f.id);
      }
    }
    return n;
  },

  // Returns up to maxSlots available windows for machineId for a task of neededWD workdays,
  // starting search from fromDate, excluding taskId itself. Each slot: { debut, fin, deltaWD }
  _findMachineSlots(machineId, taskId, neededWD, fromDate, maxSlots = 3) {
    const subWorkdays = (iso, n) => { let cur = iso, done = 0; while (done < n) { cur = D.addDays(cur, -1); if (!D.isWeekend(cur)) done++; } return cur; };
    const occupied = DB.state.taches.filter(t => t.machineId === machineId && t.id !== taskId);
    const slots = [];
    let probe = fromDate;
    const limit = D.addDays(fromDate, 180);
    while (probe <= limit && slots.length < maxSlots) {
      if (D.isWeekend(probe)) { probe = D.addDays(probe, 1); continue; }
      const slotFin = D.addWorkdays(probe, neededWD - 1);
      const clash = occupied.some(t => probe <= t.fin && slotFin >= t.debut);
      if (!clash) {
        const currentTask = DB.tache(taskId);
        const deltaWD = currentTask ? D.workdaysBetween(currentTask.debut, probe) : 0;
        slots.push({ debut: probe, fin: slotFin, deltaWD });
        probe = D.addWorkdays(slotFin, 1);
      } else {
        const nextAfter = occupied.filter(t => t.fin >= probe).sort((a,b)=>a.fin.localeCompare(b.fin));
        probe = nextAfter.length ? D.addWorkdays(nextAfter[0].fin, 1) : D.addDays(probe, 1);
      }
    }
    return slots;
  },

  // Simulates cascade impact if task taskId is shifted by deltaWD workdays. Returns days added to latest project end.
  _simulateCascadeImpact(taskId, deltaWD) {
    const state = DB.state;
    const subWorkdays = (iso, n) => { let cur = iso, done = 0; while (done < n) { cur = D.addDays(cur, -1); if (!D.isWeekend(cur)) done++; } return cur; };
    const moveWD = (iso, n) => n >= 0 ? D.addWorkdays(iso, n) : subWorkdays(iso, -n);
    const t = DB.tache(taskId);
    if (!t) return { shifted: 0, projectDelay: 0 };
    const origProjectEnd = state.taches.filter(x => x.projetId === t.projetId).reduce((m, x) => x.fin > m ? x.fin : m, '');
    // Deep-copy only the affected task and its followers for simulation
    const queue = [taskId];
    const visited = new Set([taskId]);
    const simEnds = {};
    const newFin = moveWD(t.fin, deltaWD);
    simEnds[taskId] = newFin;
    let shifted = 0;
    while (queue.length) {
      const tid = queue.shift();
      const followers = state.taches.filter(x => (x.dependances||[]).includes(tid));
      for (const f of followers) {
        if (visited.has(f.id)) continue;
        visited.add(f.id);
        simEnds[f.id] = moveWD(f.fin, deltaWD);
        shifted++;
        queue.push(f.id);
      }
    }
    const simProjectEnd = state.taches.filter(x => x.projetId === t.projetId).reduce((m, x) => {
      const fin = simEnds[x.id] || x.fin;
      return fin > m ? fin : m;
    }, '');
    const projectDelay = origProjectEnd && simProjectEnd ? D.workdaysBetween(origProjectEnd, simProjectEnd) : 0;
    return { shifted, projectDelay };
  },

  render(root) {
    const st = this.state;
    if (!st.rangeStart) st.rangeStart = D.addDays(D.today(), -14);
    this._loadPersistedState();
    const oldMm = document.getElementById('gantt-minimap');
    if (oldMm) oldMm.remove();

    root.innerHTML = `
      <div class="gantt-wrap">
        <div class="gantt-header">
          <strong>Gantt</strong>
          <select id="g-mode">
            <option value="projet">Grouper par projet</option>
            <option value="personne">Grouper par personne</option>
            <option value="machine">Grouper par machine</option>
            <option value="lieu">Grouper par lieu</option>
          </select>
          <select id="g-proj">
            ${App.projetsOptions(st.projetFilter, 'Tous les projets')}
          </select>
          <input type="search" id="g-search" placeholder="Rechercher une tâche...">
          <button class="btn-ghost" id="g-prev">◀</button>
          <input type="date" id="g-start">
          <select id="g-days">
            <option value="28">4 sem.</option>
            <option value="56" selected>8 sem.</option>
            <option value="84">12 sem.</option>
            <option value="168">24 sem.</option>
          </select>
          <select id="g-zoom" title="Niveau de zoom de la grille">
            <option value="jour">Zoom : jour</option>
            <option value="semaine">Zoom : semaine</option>
            <option value="mois">Zoom : mois</option>
            <option value="heure">Zoom : heure</option>
          </select>
          <button class="btn-ghost" id="g-next">▶</button>
          <button class="btn-ghost" id="g-today">Aujourd'hui</button>
          <button class="btn-ghost" id="g-fit" title="Ajuster la plage pour afficher toutes les tâches visibles">Ajuster</button>
          <label class="small"><input type="checkbox" id="g-deps" ${st.showDeps?'checked':''}> Dépendances</label>
          <label class="small"><input type="checkbox" id="g-crit" ${st.showCritical?'checked':''}> Chemin critique</label>
          <label class="small"><input type="checkbox" id="g-casc" ${st.autoCascade?'checked':''}> Cascade auto</label>
          <span class="muted small" title="Ctrl/Cmd + clic pour multi-sélection et actions en lot">💡 Ctrl+clic = sélection multiple</span>
          <span class="spacer"></span>
          <input type="file" id="g-import-file" accept=".csv,.json" hidden>
          <button class="btn-ghost" id="g-tpl" data-perm="admin">⬇ Modèle</button>
          <button class="btn-ghost" id="g-import" data-perm="admin">⬆ Importer</button>
          <button class="btn-ghost" id="g-csv">⤓ Exporter CSV</button>
          <button class="btn-ghost" id="g-ics" title="Exporter vers Outlook / Google Agenda / Apple Calendar">📅 Export .ics</button>
          <button class="btn-ghost" id="g-rapport" title="Rapport hebdomadaire imprimable par lieu">📋 Rapport</button>
          <button class="btn-ghost" id="g-flux" title="Vue flux atelier — schéma machines & dépendances">🔗 Flux</button>
          <button class="btn-ghost" id="g-level" data-perm="edit" title="Détecter les surcharges et proposer un rééquilibrage automatique des ressources">⚖ Équilibrer</button>
          <button class="btn-ghost" id="g-baseline" data-perm="edit" title="Sauvegarder l'état actuel du planning comme référence (baseline)">📸 Baseline</button>
          <select id="g-bl-sel" title="Comparer avec une baseline sauvegardée"><option value="">— Comparer —</option></select>
          <button class="btn" id="g-add">+ Nouvelle tâche</button>
        </div>
        <div class="gantt-body-wrap"><div id="gantt-labels" class="gantt-labels-col"></div><div class="gantt-scroll"><div id="g-table"></div></div></div>
      </div>
    `;

    document.getElementById('g-mode').value = st.mode;
    document.getElementById('g-proj').value = st.projetFilter;
    document.getElementById('g-search').value = st.search;
    document.getElementById('g-start').value = st.rangeStart;
    document.getElementById('g-days').value = String(st.rangeDays);
    document.getElementById('g-zoom').value = st.zoom || 'jour';

    document.getElementById('g-mode').onchange = e => { st.mode = e.target.value; this._savePersistedState(); this.draw(); };
    document.getElementById('g-proj').onchange = e => { st.projetFilter = e.target.value; this._savePersistedState(); this.draw(); };
    document.getElementById('g-search').oninput = e => { st.search = e.target.value.toLowerCase(); this.draw(); };
    document.getElementById('g-start').onchange = e => { st.rangeStart = e.target.value; this.draw(); };
    document.getElementById('g-days').onchange = e => { st.rangeDays = +e.target.value; this._savePersistedState(); this.draw(); };
    document.getElementById('g-zoom').onchange = e => { st.zoom = e.target.value; this._savePersistedState(); this.draw(); };
    const zoomStep = () => st.zoom === 'mois' ? 30 : st.zoom === 'semaine' ? 7 : st.zoom === 'heure' ? 1 : 14;
    document.getElementById('g-prev').onclick = () => { st.rangeStart = D.addDays(st.rangeStart, -zoomStep()); this.draw(); };
    document.getElementById('g-next').onclick = () => { st.rangeStart = D.addDays(st.rangeStart, zoomStep()); this.draw(); };
    document.getElementById('g-today').onclick = () => { st.rangeStart = D.addDays(D.today(), -7); this.draw(); };
    document.getElementById('g-fit').onclick = () => {
      let ts = DB.state.taches;
      if (st.projetFilter) ts = ts.filter(t => t.projetId === st.projetFilter);
      if (st.search) ts = ts.filter(t => t.nom.toLowerCase().includes(st.search));
      if (!ts.length) { App.toast('Aucune tâche visible','warn'); return; }
      const minDate = ts.reduce((m,t) => t.debut < m ? t.debut : m, '9999-99-99');
      const maxDate = ts.reduce((m,t) => t.fin > m ? t.fin : m, '0000-00-00');
      st.rangeStart = D.addDays(minDate, -3);
      st.rangeDays = Math.min(168, Math.max(14, D.diffDays(st.rangeStart, D.addDays(maxDate, 5))));
      document.getElementById('g-start').value = st.rangeStart;
      document.getElementById('g-days').value = String(st.rangeDays);
      this.draw();
    };
    document.getElementById('g-deps').onchange = e => { st.showDeps = e.target.checked; this._savePersistedState(); this.draw(); };
    document.getElementById('g-crit').onchange = e => { st.showCritical = e.target.checked; this._savePersistedState(); this.draw(); };
    document.getElementById('g-casc').onchange = e => { st.autoCascade = e.target.checked; this._savePersistedState(); };
    document.getElementById('g-add').onclick = () => this.openTacheForm(null);
    document.getElementById('g-tpl').onclick = () => this.downloadTemplate();
    document.getElementById('g-import').onclick = () => document.getElementById('g-import-file').click();
    document.getElementById('g-import-file').onchange = e => { if (e.target.files[0]) this.importFile(e.target.files[0]); e.target.value = ''; };
    document.getElementById('g-csv').onclick = () => {
      const head = ['Projet (code)','Nom','Début (YYYY-MM-DD)','Fin (YYYY-MM-DD)','Durée j. ouvrés','Lieu','Machine','Assignés (séparés /)','Avancement (%)','Jalon (OUI/NON)','Notes'];
      const rows = [head];
      DB.state.taches.slice().sort((a,b)=>a.projetId.localeCompare(b.projetId)||a.debut.localeCompare(b.debut)).forEach(t => {
        const prj = DB.projet(t.projetId);
        const lieu = DB.lieu(t.lieuId);
        const mach = DB.machine(t.machineId);
        const pers = (t.assignes||[]).map(pid => DB.personne(pid)).filter(Boolean).map(p => App.personneLabel(p)).join('/');
        rows.push([prj?prj.code:'', t.nom, t.debut, t.fin, D.workdaysBetween(t.debut,t.fin), lieu?lieu.nom:'', mach?mach.nom:'', pers, t.avancement||0, t.jalon?'OUI':'NON', t.notes||'']);
      });
      CSV.download('planning-' + D.today() + '.csv', rows);
      App.toast('Export CSV téléchargé','success');
    };
    document.getElementById('g-ics').onclick = () => this.exportICS();
    document.getElementById('g-rapport').onclick = () => this.showRapportHebdo();
    document.getElementById('g-flux').onclick = () => {
      if (st.projetFilter) App.views.flux.state.projet = st.projetFilter;
      App.navigate('flux');
    };
    document.getElementById('g-level').onclick = () => this.resourceLeveling();
    document.getElementById('g-baseline').onclick = () => this.saveBaseline();
    const blSel = document.getElementById('g-bl-sel');
    (DB.state.baselines||[]).forEach(b => { const o = document.createElement('option'); o.value = b.id; o.textContent = `📸 ${b.label}`; if (b.id === st.baselineId) o.selected = true; blSel.appendChild(o); });
    blSel.onchange = e => { st.baselineId = e.target.value || null; this.draw(); };

    this.draw();
    // Scroll to today on initial render + sync labels scroll
    const scroll = document.querySelector('.gantt-scroll');
    const labelsCol = document.getElementById('gantt-labels');
    if (scroll) {
      const zoom = st.zoom || 'jour';
      const cellW = zoom === 'mois' ? 4 : zoom === 'semaine' ? 9 : zoom === 'heure' ? 30 : 28;
      const todayIdx = zoom === 'heure' ? D.diffDays(st.rangeStart, D.today()) * 9 : D.diffDays(st.rangeStart, D.today());
      if (todayIdx >= 0 && todayIdx < (zoom === 'heure' ? st.rangeDays * 9 : st.rangeDays)) {
        scroll.scrollLeft = Math.max(0, todayIdx * cellW - scroll.clientWidth / 2);
      }
      if (labelsCol) scroll.addEventListener('scroll', () => { labelsCol.scrollTop = scroll.scrollTop; });
    }
  },

  draw() {
    const st = this.state;
    const table = document.getElementById('g-table');
    const start = st.rangeStart;
    const days = st.rangeDays;
    const conflicts = App.detectConflicts();
    const confPersons = new Set(conflicts.personnes.flatMap(c => [c.t1, c.t2]));
    const confMachines = new Set(conflicts.machines.flatMap(c => [c.t1, c.t2]));

    // Build groups
    const groups = this.buildGroups();
    const zoom = st.zoom || 'jour';
    const CELL_W = zoom === 'mois' ? 4 : zoom === 'semaine' ? 9 : zoom === 'heure' ? 30 : 28;
    const isHourMode = zoom === 'heure';
    const HOURS_PER_DAY = 9;   // 08h–16h
    const WORK_START_H  = 8;
    const totalCols = isHourMode ? days * HOURS_PER_DAY : days;
    const colToDay  = i => isHourMode ? Math.floor(i / HOURS_PER_DAY) : i;
    const colToHour = i => isHourMode ? (i % HOURS_PER_DAY) + WORK_START_H : null;
    const colToDate = i => D.addDays(start, colToDay(i));
    const LABEL_W = 220;
    const dowLetters = ['D','L','M','M','J','V','S']; // dim=0, lun=1, …, sam=6
    const isoWeekNum = iso => { const d = D.parse(iso); const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - (d.getUTCDay()||7))); return Math.ceil(((thu - new Date(Date.UTC(thu.getUTCFullYear(),0,1)))/864e5+1)/7); };
    const dayClasses = d => {
      const dt = D.parse(d);
      const dow = dt.getUTCDay();
      const cls = [];
      if (dow === 0 || dow === 6) cls.push('day-weekend');
      if (dow === 1) cls.push('day-monweek'); // séparateur gauche début de semaine
      if (d === D.today()) cls.push('day-today');
      if (dt.getUTCDate() === 1) cls.push('day-month-start');
      return cls.join(' ');
    };

    // Header (une cellule par jour, contenu adapté au zoom)
    const headerCells = [];
    headerCells.push(`<div class="gantt-cell head label">Élément</div>`);
    for (let i = 0; i < totalCols; i++) {
      const d   = colToDate(i);
      const dt  = D.parse(d);
      const dow = dt.getUTCDay();
      const dayNum = dt.getUTCDate();
      const firstOfMonth = dayNum === 1;
      const showMonth = firstOfMonth || (isHourMode ? i % HOURS_PER_DAY === 0 && (i === 0 || colToDay(i) !== colToDay(i-1)) : i === 0);
      const monthName = showMonth ? dt.toLocaleDateString('fr-CH', { month: 'short', timeZone: 'UTC' }) : '';
      let content = '';
      if (isHourMode) {
        const hour = colToHour(i);
        const isFirstHourOfDay = i % HOURS_PER_DAY === 0;
        content = `${isFirstHourOfDay ? `<div class="day-month-name" style="font-size:8px">${dt.getUTCDate()}/${dt.toLocaleDateString('fr-CH',{month:'short',timeZone:'UTC'})}</div>` : ''}<div class="day-num" style="font-size:9px">${hour}h</div>`;
      } else if (zoom === 'jour') {
        content = `${showMonth ? `<div class="day-month-name">${monthName}</div>` : ''}<div class="day-num">${showMonth ? '' : dayNum}</div><div class="day-dow">${dowLetters[dow]}</div>`;
      } else if (zoom === 'semaine') {
        content = dow === 1 ? `<div class="day-month-name" style="font-size:9px">S${isoWeekNum(d)}</div>` : (showMonth ? `<div class="day-month-name" style="font-size:8px">${monthName}</div>` : '');
      } else {
        content = showMonth ? `<div class="day-month-name" style="font-size:8px;writing-mode:horizontal-tb">${monthName}</div>` : '';
      }
      const isWeekend = dow === 0 || dow === 6;
      const isToday   = d === D.today();
      const extraCls  = isHourMode ? (isWeekend ? 'day-weekend' : isToday ? 'day-today' : '') : dayClasses(d);
      headerCells.push(`<div class="gantt-cell head day-cell ${extraCls}">${content}</div>`);
    }

    // Body rows — labels séparés des cellules jour
    const labelRows = [];
    const dayRows = [];
    groups.forEach(g => {
      const isProjectGroup = g.label && g.label.match(/^PRJ-/);
      const groupRowClass = isProjectGroup ? 'group-project' : 'group-other';

      labelRows.push(`<div class="gantt-cell label group ${groupRowClass}">${g.label} <span style="font-size:10px;font-weight:400;opacity:.6">(${g.items.length})</span></div>`);
      for (let i=0; i<totalCols; i++) dayRows.push(`<div class="gantt-cell group ${groupRowClass} ${dayClasses(colToDate(i))}"></div>`);

      g.items.forEach(it => {
        const t = it.tache;
        labelRows.push(`<div class="gantt-cell label" title="${t.nom}">${t.nom}</div>`);
        for (let i=0; i<totalCols; i++) dayRows.push(`<div class="gantt-cell ${dayClasses(colToDate(i))}"></div>`);
      });
    });

    const labelEl = document.getElementById('gantt-labels');
    if (labelEl) {
      labelEl.style.cssText += 'display:grid;grid-auto-rows:30px;align-content:start;';
      labelEl.innerHTML = headerCells[0] + labelRows.join('');
    }
    table.style.display = 'grid';
    table.style.gridTemplateColumns = `repeat(${totalCols}, ${CELL_W}px)`;
    table.style.position = 'relative';
    table.innerHTML = headerCells.slice(1).join('') + dayRows.join('');

    // Chemin critique par projet (si mode projet et option active)
    const criticalByProj = {};
    if (st.showCritical) DB.state.projets.forEach(p => { criticalByProj[p.id] = this.criticalTasks(p.id); });
    const isCritical = t => st.showCritical && criticalByProj[t.projetId] && criticalByProj[t.projetId].has(t.id);

    // Place bars in an absolute overlay to simplify positioning
    let rowIdx = 1; // 1 = header
    const bars = [];
    const barPos = {}; // tid -> {left, right, top, mid}
    groups.forEach(g => {
      rowIdx++; // group header row
      g.items.forEach(it => {
        const t = it.tache;
        const prj = DB.projet(t.projetId);
        let offsetCols, endCols;
        if (isHourMode) {
          const dStart = Math.max(0, D.diffDays(start, t.debut));
          const dEnd   = Math.min(days - 1, D.diffDays(start, t.fin));
          const hS = t.heureDebut !== undefined ? Math.max(0, t.heureDebut - WORK_START_H) : 0;
          const hE = t.heureFin   !== undefined ? Math.min(HOURS_PER_DAY - 1, t.heureFin - WORK_START_H) : HOURS_PER_DAY - 1;
          offsetCols = Math.max(0, dStart * HOURS_PER_DAY + hS);
          endCols    = Math.min(totalCols - 1, dEnd * HOURS_PER_DAY + hE);
        } else {
          offsetCols = Math.max(0, D.diffDays(start, t.debut));
          endCols    = Math.min(days - 1, D.diffDays(start, t.fin));
        }
        if (endCols < 0 || offsetCols > totalCols - 1) { rowIdx++; return; }
        const left = offsetCols * CELL_W + 2;
        const width = Math.max(CELL_W - 4, (endCols - offsetCols + 1) * CELL_W - 4);
        const top = rowIdx * 30 + 3;
        const isConflict = confPersons.has(t.id) || confMachines.has(t.id);
        const crit = isCritical(t);
        const color = prj ? prj.couleur : '#888';
        const label = t.jalon ? '' : (t.nom + ' · ' + Math.round(t.avancement||0) + '%');
        barPos[t.id] = { left, right: left + width, top: top + 11, mid: top + 11 };
        // Ghost bar baseline
        if (st.baselineId && !t.jalon) {
          const bl = (DB.state.baselines||[]).find(b => b.id === st.baselineId);
          const snap = bl?.snap?.find(s => s.id === t.id);
          if (snap) {
            const snOff = Math.max(0, D.diffDays(start, snap.debut));
            const snEnd = Math.min(days-1, D.diffDays(start, snap.fin));
            if (snEnd >= 0 && snOff <= days-1) {
              const snL = snOff * CELL_W + 2;
              const snW = Math.max(CELL_W-4, (snEnd-snOff+1)*CELL_W-4);
              bars.push(`<div class="gantt-bar-ghost" style="left:${snL}px;width:${snW}px;top:${top+2}px;height:18px;background:${color}" title="Baseline : ${D.fmt(snap.debut)} → ${D.fmt(snap.fin)}"></div>`);
            }
          }
        }

        const overdue = !t.jalon && t.fin < D.today() && (t.avancement||0) < 100;
        const cls = (isConflict?'conflict ':'') + (crit?'critical ':'') + (overdue?'overdue ':'');
        const avPct = Math.min(100, Math.max(0, t.avancement||0));
        const progressW = Math.round(avPct/100*width);
        if (t.jalon) {
          bars.push(`<div class="gantt-bar milestone ${cls}" style="left:${left+width/2-7}px;top:${top+2}px;background:${color}" data-tid="${t.id}" title="${t.nom}"></div>`);
        } else {
          const nComments = (t.commentaires||[]).length;
          const badge = nComments ? `<span class="gantt-bar-comment" title="${nComments} commentaire(s)">💬</span>` : '';
          const overdueBadge = overdue ? '<span class="gantt-bar-overdue" title="En retard !">⚠</span>' : '';
          const clTotal = (t.checklist||[]).length, clDone = (t.checklist||[]).filter(i=>i.done).length;
          const clBadge = clTotal ? `<span class="gantt-bar-cl" title="${clDone}/${clTotal} sous-tâche(s)">${clDone===clTotal?'☑':'☐'}${clDone}/${clTotal}</span>` : '';
          bars.push(`<div class="gantt-bar ${cls}" style="left:${left}px;width:${width}px;top:${top}px;height:22px;background:${color}" data-tid="${t.id}" title="${t.nom} — ${D.fmt(t.debut)} → ${D.fmt(t.fin)}${crit?' [critique]':''}${overdue?' ⚠ En retard':''}${nComments?' · '+nComments+' commentaire(s)':''}"><div class="gantt-bar-progress" style="width:${progressW}px"></div>${overdueBadge}<span class="gantt-bar-label">${label}</span>${clBadge}${badge}</div>`);
          if (App.can('edit')) {
            bars.push(`<div class="gantt-resize-handle" data-tid="${t.id}" style="left:${left+width-5}px;top:${top}px;height:22px" title="Glisser pour modifier la durée"></div>`);
          }
        }
        rowIdx++;
      });
    });

    // SVG : ligne aujourd'hui + flèches de dépendances
    const totalW = totalCols * CELL_W;
    const totalH = (rowIdx + 2) * 30;
    const paths = [];
    // Ligne verticale "aujourd'hui" (toujours affichée)
    const todayOffset = isHourMode
      ? D.diffDays(start, D.today()) * HOURS_PER_DAY + Math.max(0, new Date().getHours() - WORK_START_H)
      : D.diffDays(start, D.today());
    if (todayOffset >= 0 && todayOffset < totalCols) {
      const todayX = todayOffset * CELL_W + Math.floor(CELL_W / 2);
      paths.push(`<line x1="${todayX}" y1="0" x2="${todayX}" y2="${totalH}" class="today-line"/>`);
      const lblW = 64, lblH = 17;
      const lblX = todayX + lblW + 4 < totalW ? todayX + 2 : todayX - lblW - 2;
      paths.push(`<rect x="${lblX}" y="4" width="${lblW}" height="${lblH}" rx="4" fill="#ef4444" opacity=".92"/>`);
      paths.push(`<text x="${lblX + lblW / 2}" y="16" text-anchor="middle" class="today-label">Aujourd'hui</text>`);
    }
    if (st.showDeps) {
      DB.state.taches.forEach(t => {
        (t.dependances || []).forEach(depId => {
          const p1 = barPos[depId], p2 = barPos[t.id];
          if (!p1 || !p2) return;
          const crit = isCritical(t) && isCritical(DB.tache(depId));
          const x1 = p1.right, y1 = p1.mid;
          const x2 = p2.left,  y2 = p2.mid;
          const EXIT = 8;
          const midX = x2 - EXIT;
          let d;
          if (midX > x1 + EXIT) {
            // Espace suffisant : sortie droite → vertical → entrée gauche
            d = `M ${x1} ${y1} H ${x1+EXIT} V ${y2} H ${x2}`;
          } else {
            // Barres adjacentes ou chevauchantes : contournement en U
            const ySwing = Math.max(y1, y2) + 13;
            d = `M ${x1} ${y1} H ${x1+EXIT} V ${ySwing} H ${midX} V ${y2} H ${x2}`;
          }
          paths.push(`<path d="${d}" class="${crit?'critical':''}" marker-end="url(#arrow)"/>`);
        });
      });
    }
    const depsSvg = `<svg class="gantt-deps" width="${totalW}" height="${totalH}" style="width:${totalW}px;height:${totalH}px">
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/>
      </marker></defs>
      ${paths.join('')}
    </svg>`;

    const overlay = document.createElement('div');
    overlay.style.position = 'absolute'; overlay.style.inset = '0'; overlay.style.pointerEvents = 'none';
    overlay.innerHTML = depsSvg + bars.join('');
    table.appendChild(overlay);

    if (!bars.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'position:absolute;inset:30px 0 0;display:flex;align-items:center;justify-content:center;pointer-events:auto;z-index:2';
      empty.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px"><div style="font-size:36px;margin-bottom:8px">📋</div><strong style="font-size:15px;color:var(--text)">Aucune tâche visible</strong><p class="small" style="margin:6px 0 16px">Modifie le filtre projet&nbsp;/ la recherche, élargis la plage de dates,<br>ou crée ta première tâche.</p><button class="btn" onclick="App.views.gantt.newItem()">+ Nouvelle tâche</button></div>';
      table.appendChild(empty);
    }

    // Tooltip singleton
    const tip = document.getElementById('gantt-tip') || (() => {
      const el = document.createElement('div'); el.id = 'gantt-tip'; el.className = 'gantt-tooltip';
      document.body.appendChild(el); return el;
    })();
    let tipTimer;

    overlay.querySelectorAll('.gantt-bar').forEach(el => {
      el.style.pointerEvents = 'auto';
      if (this.state.selectedIds.has(el.dataset.tid)) el.classList.add('selected');
      el.addEventListener('click', e => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) { e.preventDefault(); this.toggleSelection(el.dataset.tid); return; }
        if (this.state.selectedIds.size) { this.clearSelection(); }
        this.openTacheForm(el.dataset.tid);
      });
      el.addEventListener('contextmenu', e => { e.preventDefault(); this.showContextMenu(e, el.dataset.tid); });
      el.addEventListener('mouseenter', () => {
        clearTimeout(tipTimer);
        tipTimer = setTimeout(() => {
          if (el.classList.contains('dragging')) return;
          const t = DB.tache(el.dataset.tid); if (!t) return;
          const prj = DB.projet(t.projetId);
          const assignes = (t.assignes||[]).map(pid => DB.personne(pid)).filter(Boolean).map(p => App.personneLabel(p)).join(', ');
          const machine = DB.machine(t.machineId)?.nom;
          const lieu = DB.lieu(t.lieuId)?.nom;
          const dur = D.workdaysBetween(t.debut, t.fin);
          const av = t.avancement || 0;
          const nComm = (t.commentaires||[]).length;
          tip.innerHTML = [
            `<div class="gantt-tooltip-title" style="color:${prj?.couleur||'inherit'}">${prj?`<span style="opacity:.7;font-weight:400">[${prj.code}]</span> `:''}${t.nom}</div>`,
            `<div class="gantt-tooltip-row"><span class="tt-label">📅</span> ${D.fmt(t.debut)} → ${D.fmt(t.fin)} &nbsp;·&nbsp; <strong>${dur} j.o.</strong></div>`,
            av > 0 ? `<div class="gantt-tooltip-row"><span class="tt-label">⚡</span> <strong>${av}%</strong> avancé</div>` : '',
            assignes ? `<div class="gantt-tooltip-row"><span class="tt-label">👤</span> ${assignes}</div>` : '',
            machine ? `<div class="gantt-tooltip-row"><span class="tt-label">⚙</span> ${machine}</div>` : '',
            lieu ? `<div class="gantt-tooltip-row"><span class="tt-label">📍</span> ${lieu}</div>` : '',
            nComm ? `<div class="gantt-tooltip-row"><span class="tt-label">💬</span> ${nComm} commentaire(s)</div>` : '',
            t.notes ? `<div class="gantt-tooltip-row" style="margin-top:4px;font-size:11px;color:var(--text-muted);display:block">${t.notes.substring(0,100)}${t.notes.length>100?'…':''}</div>` : '',
          ].filter(Boolean).join('');
          // Position: measure off-screen first
          tip.style.left = '-9999px'; tip.style.top = '0';
          const rect = el.getBoundingClientRect();
          const tw = tip.offsetWidth, th = tip.offsetHeight;
          let l = rect.left, tt2 = rect.bottom + 8;
          if (l + tw > window.innerWidth - 12) l = window.innerWidth - tw - 12;
          if (tt2 + th > window.innerHeight - 12) tt2 = rect.top - th - 8;
          tip.style.left = l + 'px'; tip.style.top = tt2 + 'px';
          tip.classList.add('visible');
        }, 200);
      });
      el.addEventListener('mouseleave', () => { clearTimeout(tipTimer); tip.classList.remove('visible'); });
      this.makeDraggable(el, CELL_W);
    });
    this.renderSelectionBar();
    this._drawMinimap();
    overlay.querySelectorAll('.gantt-resize-handle').forEach(el => {
      el.style.pointerEvents = 'auto';
      this.makeResizable(el, CELL_W);
    });

    // Drag-to-create : clic maintenu sur la grille vide → nouvelle tâche
    if (App.can('edit')) {
      const scrollWrap = document.querySelector('.gantt-scroll');
      let dragStart = null, dragGhost = null;
      table.addEventListener('mousedown', e => {
        if (e.target.closest('.gantt-bar,.gantt-resize-handle,.gantt-cell.label,.gantt-cell.head')) return;
        if (e.button !== 0) return;
        const rect = table.getBoundingClientRect();
        const scrollLeft = scrollWrap ? scrollWrap.scrollLeft : 0;
        const x = e.clientX - rect.left + scrollLeft;
        if (x < 0) return;
        dragStart = { x, y: e.clientY };
        dragGhost = document.createElement('div');
        dragGhost.id = 'drag-ghost';
        dragGhost.style.cssText = `position:fixed;background:var(--primary);opacity:.25;border-radius:3px;pointer-events:none;z-index:800;height:20px`;
        document.body.appendChild(dragGhost);
        e.preventDefault();
      });
      document.addEventListener('mousemove', e => {
        if (!dragStart || !dragGhost) return;
        const rect = table.getBoundingClientRect();
        const scrollLeft = scrollWrap ? scrollWrap.scrollLeft : 0;
        const x = e.clientX - rect.left + scrollLeft;
        const x1 = Math.min(dragStart.x, x), x2 = Math.max(dragStart.x, x);
        dragGhost.style.left = (rect.left + x1 - scrollLeft) + 'px';
        dragGhost.style.top = (dragStart.y - 10) + 'px';
        dragGhost.style.width = Math.max(CELL_W, x2 - x1) + 'px';
      });
      document.addEventListener('mouseup', e => {
        if (!dragStart || !dragGhost) return;
        const rect = table.getBoundingClientRect();
        const scrollLeft = scrollWrap ? scrollWrap.scrollLeft : 0;
        const x = e.clientX - rect.left + scrollLeft;
        const x1 = Math.min(dragStart.x, x);
        const x2 = Math.max(dragStart.x, x);
        dragGhost.remove(); dragGhost = null; dragStart = null;
        const dayStart = Math.max(0, Math.floor(x1 / CELL_W));
        const dayEnd = Math.max(dayStart, Math.floor(x2 / CELL_W));
        if (dayEnd - dayStart < 0) return;
        const debut = D.nextWorkday(D.addDays(start, dayStart));
        const fin = D.addWorkdays(debut, Math.max(0, dayEnd - dayStart));
        this.openTacheForm(null, { debut, fin });
      });
    }
  },

  _drawMinimap() {
    const st = this.state;
    let mm = document.getElementById('gantt-minimap');
    if (!mm) {
      mm = document.createElement('div');
      mm.id = 'gantt-minimap';
      mm.className = 'gantt-minimap';
      document.body.appendChild(mm);
    }

    const tasks = DB.state.taches.filter(t => {
      if (st.projetFilter && t.projetId !== st.projetFilter) return false;
      if (st.search && !t.nom.toLowerCase().includes(st.search)) return false;
      return !t.jalon;
    });

    if (!tasks.length) { mm.style.display = 'none'; return; }
    mm.style.display = '';

    const MM_W = 200, MM_H = 64;
    const minDate = tasks.reduce((m, t) => t.debut < m ? t.debut : m, tasks[0].debut);
    const maxDate = tasks.reduce((m, t) => t.fin > m ? t.fin : m, tasks[0].fin);
    const totalDays = Math.max(1, D.diffDays(minDate, maxDate));
    const scaleX = MM_W / totalDays;

    const projetIds = [...new Set(tasks.map(t => t.projetId))];
    const rowH = Math.max(2, Math.min(10, Math.floor(MM_H / projetIds.length)));

    const bars = projetIds.map((pid, i) => {
      const prj = DB.projet(pid);
      const color = prj ? prj.couleur : '#6b7280';
      const y = i * rowH;
      return tasks.filter(t => t.projetId === pid).map(t => {
        const x = Math.max(0, Math.round(D.diffDays(minDate, t.debut) * scaleX));
        const w = Math.max(1, Math.round(D.diffDays(minDate, t.fin) * scaleX));
        return `<rect x="${x}" y="${y}" width="${w}" height="${rowH - 1}" fill="${color}" opacity=".75" rx="1"/>`;
      }).join('');
    }).join('');

    const todayOff = D.diffDays(minDate, D.today());
    const todayLine = todayOff >= 0 && todayOff <= totalDays
      ? `<line x1="${Math.round(todayOff * scaleX)}" y1="0" x2="${Math.round(todayOff * scaleX)}" y2="${MM_H}" stroke="#ef4444" stroke-width="1.5" opacity=".9"/>`
      : '';

    const vpStart = Math.round(D.diffDays(minDate, st.rangeStart) * scaleX);
    const vpW = Math.max(4, Math.round(st.rangeDays * scaleX));
    const vpX = Math.max(0, Math.min(MM_W - vpW, vpStart));
    const viewport = `
      <rect x="${vpX}" y="0" width="${vpW}" height="${MM_H}" fill="var(--primary)" opacity=".12" rx="2"/>
      <rect x="${vpX}" y="0" width="${vpW}" height="${MM_H}" fill="none" stroke="var(--primary)" stroke-width="1.5" rx="2" opacity=".7"/>`;

    mm.innerHTML = `
      <svg width="${MM_W}" height="${MM_H}" viewBox="0 0 ${MM_W} ${MM_H}" style="display:block">${bars}${todayLine}${viewport}</svg>
      <div class="gantt-minimap-hint">Planning — clic pour naviguer</div>`;

    mm.onclick = e => {
      const rect = mm.querySelector('svg').getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      st.rangeStart = D.addDays(minDate, Math.round(ratio * totalDays - st.rangeDays / 2));
      const startEl = document.getElementById('g-start');
      if (startEl) startEl.value = st.rangeStart;
      if (document.getElementById('g-table')) this.draw();
    };
  },

  downloadTemplate() {
    CSV.download('modele-import-taches.csv', [
      ['Projet (code)','Nom','Début (YYYY-MM-DD)','Fin (YYYY-MM-DD)','Lieu','Machine','Assignés (séparés /)','Avancement (%)','Jalon (OUI/NON)','Notes'],
      ['PRJ-A','Découpe pièces','2026-05-01','2026-05-05','Atelier 2B','Découpe laser','Marie Martin','0','NON',''],
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
        // Convertit DD.MM.YYYY / DD/MM/YYYY / MM-DD-YYYY vers ISO YYYY-MM-DD
        const toISO = raw => {
          if (!raw) return '';
          const s = raw.trim().replace(/["']/g,'');
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
          const eu = s.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{4})$/);
          if (eu) return `${eu[3]}-${eu[2].padStart(2,'0')}-${eu[1].padStart(2,'0')}`;
          return s;
        };
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const hdrs = lines[0].split(sep).map(h => norm(h.replace(/^"|"$/g,'')));
        const rows = lines.slice(1).map(l => {
          const v = l.split(sep).map(c => c.trim().replace(/^"|"$/g,''));
          const o = {}; hdrs.forEach((h,i) => o[h] = v[i]||''); return o;
        }).filter(r => Object.values(r).some(v => v));
        const s = DB.state;
        const parsed = rows.map(r => {
          const pCode = norm(r['projet (code)'] || r['projet'] || r['project'] || '');
          const prj = s.projets.find(p => norm(p.code) === pCode || norm(p.nom) === pCode);
          const nom = r['nom'] || r['name'] || r['tâche'] || '';
          const debut = toISO(r['début (yyyy-mm-dd)'] || r['debut'] || r['début'] || r['start'] || '');
          const fin   = toISO(r['fin (yyyy-mm-dd)']   || r['fin']   || r['end']   || '');
          const lieuNom = norm(r['lieu'] || '');
          const machNom = norm(r['machine'] || '');
          const lieu = lieuNom ? s.lieux.find(l => norm(l.nom) === lieuNom) : null;
          const mach = machNom ? s.machines.find(m => norm(m.nom) === machNom) : null;
          const assignesNoms = (r['assignes (separes /)'] || r['assignés (séparés /)'] || r['assignes'] || '').split('/').map(n => n.trim()).filter(Boolean);
          const assignes = assignesNoms.map(n => {
            const parts = norm(n).split(' ');
            return s.personnes.find(p => norm(p.prenom+' '+p.nom) === norm(n) || norm(p.nom+' '+p.prenom) === norm(n));
          }).filter(Boolean).map(p => p.id);
          const avancement = parseInt(r['avancement (%)'] || r['avancement'] || 0) || 0;
          const jalon = (r['jalon (oui/non)'] || r['jalon'] || '').toLowerCase() === 'oui';
          const notes = r['notes'] || '';
          const existing = prj ? s.taches.find(t => t.projetId === prj.id && norm(t.nom) === norm(nom)) : null;
          const errors = [];
          if (!prj) errors.push('projet inconnu');
          if (!debut.match(/^\d{4}-\d{2}-\d{2}$/)) errors.push('date début invalide');
          if (!fin.match(/^\d{4}-\d{2}-\d{2}$/)) errors.push('date fin invalide');
          return { nom, prj, debut, fin, lieuId: lieu?.id||null, lieuNom, machineId: mach?.id||null, machNom, assignes, assignesNoms, avancement, jalon, notes, existing, errors };
        }).filter(r => r.nom);
        if (!parsed.length) { App.toast('Aucune tâche à importer','warn'); return; }
        const creates = parsed.filter(r => !r.existing && !r.errors.length).length;
        const updates = parsed.filter(r => r.existing).length;
        const errs = parsed.filter(r => r.errors.length).length;
        const body = `<p class="muted small">${creates} à créer · ${updates} à mettre à jour · ${errs} erreur(s)</p>
          <table class="data"><thead><tr><th>Projet</th><th>Tâche</th><th>Début</th><th>Fin</th><th>Statut</th></tr></thead><tbody>
          ${parsed.map(r => `<tr>
            <td>${r.prj?`<span class="badge" style="background:${r.prj.couleur}22;color:${r.prj.couleur}">${r.prj.code}</span>`:'<span class="badge bad">?</span>'}</td>
            <td>${r.nom}</td><td>${r.debut}</td><td>${r.fin}</td>
            <td>${r.errors.length?`<span class="badge bad">${r.errors.join(', ')}</span>`:r.existing?'<span class="badge warn">màj</span>':'<span class="badge good">nouveau</span>'}</td>
          </tr>`).join('')}
          </tbody></table>`;
        const importable = parsed.filter(r => !r.errors.length);
        const foot = `<button class="btn btn-secondary" onclick="App.closeModal()">Annuler</button>
          <button class="btn" id="g-import-ok">Importer (${importable.length})</button>`;
        App.openModal('Aperçu import — Tâches', body, foot);
        document.getElementById('g-import-ok').onclick = () => {
          let created = 0, updated = 0;
          importable.forEach(r => {
            if (r.existing) {
              r.existing.debut = r.debut; r.existing.fin = r.fin;
              r.existing.avancement = r.avancement; r.existing.jalon = r.jalon;
              if (r.lieuId) r.existing.lieuId = r.lieuId;
              if (r.machineId) r.existing.machineId = r.machineId;
              if (r.assignes.length) r.existing.assignes = r.assignes;
              if (r.notes) r.existing.notes = r.notes;
              DB.logAudit('update','tache',r.existing.id,r.nom+' (import)');
              updated++;
            } else {
              const t = { id: DB.uid('T'), projetId: r.prj.id, nom: r.nom, debut: r.debut, fin: r.fin, avancement: r.avancement, jalon: r.jalon, lieuId: r.lieuId, machineId: r.machineId, assignes: r.assignes, dependances: [], notes: r.notes, type: 'prod' };
              s.taches.push(t);
              DB.logAudit('create','tache',t.id,t.nom+' (import)');
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

  showContextMenu(e, tid) {
    const t = DB.tache(tid);
    if (!t) return;
    const canEdit = App.can('edit');
    const existing = document.getElementById('gantt-ctx');
    if (existing) existing.remove();
    const menu = document.createElement('div');
    menu.id = 'gantt-ctx';
    menu.className = 'ctx-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    const items = [
      { label:'✎ Éditer', perm:true, act:() => this.openTacheForm(tid) },
      { sep:true },
      { label:'● 100% — Terminée', perm:canEdit, act:() => { t.avancement=100; DB.save(); this.draw(); App.toast('Terminée ✓','success'); } },
      { label:'◕ 75%', perm:canEdit, act:() => { t.avancement=75; DB.save(); this.draw(); } },
      { label:'◑ 50%', perm:canEdit, act:() => { t.avancement=50; DB.save(); this.draw(); } },
      { label:'◔ 25%', perm:canEdit, act:() => { t.avancement=25; DB.save(); this.draw(); } },
      { label:'○ 0% — À démarrer', perm:canEdit, act:() => { t.avancement=0; DB.save(); this.draw(); } },
      { sep:true },
      { label:'⎘ Dupliquer', perm:canEdit, act:() => {
        const copy = JSON.parse(JSON.stringify(t));
        copy.id = DB.uid('T');
        copy.nom = t.nom + ' (copie)';
        copy.avancement = 0;
        copy.dependances = [];
        DB.state.taches.push(copy);
        DB.save(); this.draw(); App.toast('Tâche dupliquée','success');
      } },
      { label:'👤 Suggérer des personnes', perm:canEdit, act:() => this.suggestForTask(tid) },
      { sep:true },
      { label:'✕ Supprimer', perm:canEdit, danger:true, act:() => {
        if (!confirm('Supprimer « ' + t.nom + ' » ?')) return;
        DB.state.taches = DB.state.taches.filter(x => x.id !== tid);
        DB.state.taches.forEach(x => x.dependances = (x.dependances||[]).filter(d => d !== tid));
        DB.save(); this.draw(); App.toast('Tâche supprimée','info');
      } },
    ];
    menu.innerHTML = items.map((it, i) => {
      if (it.sep) return '<div class="ctx-sep"></div>';
      if (!it.perm) return '';
      return `<div class="ctx-item ${it.danger?'danger':''}" data-i="${i}">${it.label}</div>`;
    }).join('');
    document.body.appendChild(menu);
    // Repositionner si dépasse la fenêtre
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth - 10) menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
    if (rect.bottom > window.innerHeight - 10) menu.style.top = (window.innerHeight - rect.height - 10) + 'px';
    menu.querySelectorAll('.ctx-item').forEach(el => {
      el.onclick = () => { const it = items[+el.dataset.i]; menu.remove(); if (it && it.act) it.act(); };
    });
    const close = ev => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  },

  suggestForTask(tid) {
    const t = DB.tache(tid);
    if (!t) return;
    const sugg = App.suggestAssignees(t, 5);
    const body = `<p class="muted">Score = compétence × 100 − charge × 5 + proximité × 10 · Clic sur le nom pour ouvrir la fiche de la personne.</p>
      <table class="data">
        <thead><tr><th>Personne</th><th>Rôle</th><th class="right">Score</th><th class="right">Charge</th><th>Compétence</th><th></th></tr></thead>
        <tbody>${sugg.map(x => `<tr>
          <td><a href="#" class="link-to-person" data-pid="${x.p.id}"><strong>${App.personneLabel(x.p)}</strong></a></td>
          <td>${x.p.role}</td>
          <td class="right mono">${x.score}</td>
          <td class="right">${x.charge}j</td>
          <td>${x.compMatch ? '<span class="badge good">oui</span>' : '<span class="badge muted">non</span>'}</td>
          <td><button class="btn" data-assign="${x.p.id}" style="padding:2px 10px">Affecter</button></td>
        </tr>`).join('')}</tbody>
      </table>`;
    App.openModal('Suggestions pour : ' + App.escapeHTML(t.nom), body, `<button class="btn btn-secondary" onclick="App.closeModal()">Fermer</button>`);
    document.querySelectorAll('.link-to-person').forEach(a => a.onclick = (e) => {
      e.preventDefault();
      App.closeModal();
      App.navigateToTarget({ view: 'personnes', personneId: a.dataset.pid });
    });
    document.querySelectorAll('[data-assign]').forEach(b => b.onclick = () => {
      const pid = b.dataset.assign;
      t.assignes = Array.from(new Set([...(t.assignes||[]), pid]));
      DB.save(); App.closeModal(); App.toast('Personne affectée','success'); this.draw();
    });
  },

  buildGroups() {
    const st = this.state;
    const s = DB.state;
    let taches = s.taches.slice();
    if (st.projetFilter) taches = taches.filter(t => t.projetId === st.projetFilter);
    if (st.search) taches = taches.filter(t => t.nom.toLowerCase().includes(st.search));

    const groups = [];
    const pushGroup = (id, label, items) => groups.push({ id, label, items: items.map(t => ({ tache: t })) });

    if (st.mode === 'projet') {
      s.projets.forEach(p => {
        const ts = taches.filter(t => t.projetId === p.id).sort((a,b) => a.debut.localeCompare(b.debut));
        if (ts.length) pushGroup(p.id, p.code + ' — ' + p.nom, ts);
      });
      const libres = taches.filter(t => !t.projetId).sort((a,b) => a.debut.localeCompare(b.debut));
      if (libres.length) pushGroup('__libre__', '— Tâches libres (sans projet)', libres);
    } else if (st.mode === 'personne') {
      const perTs = {};
      taches.forEach(t => (t.assignes||[]).forEach(pid => (perTs[pid] = perTs[pid] || []).push(t)));
      s.personnes.forEach(p => {
        const ts = (perTs[p.id]||[]).sort((a,b) => a.debut.localeCompare(b.debut));
        if (ts.length) pushGroup(p.id, App.personneLabel(p), ts);
      });
    } else if (st.mode === 'machine') {
      s.machines.forEach(m => {
        const ts = taches.filter(t => t.machineId === m.id).sort((a,b) => a.debut.localeCompare(b.debut));
        if (ts.length) pushGroup(m.id, m.nom, ts);
      });
    } else if (st.mode === 'lieu') {
      s.lieux.filter(l => l.type === 'production').forEach(l => {
        const ts = taches.filter(t => t.lieuId === l.id).sort((a,b) => a.debut.localeCompare(b.debut));
        if (ts.length) pushGroup(l.id, l.nom, ts);
      });
    }
    return groups;
  },

  makeDraggable(el, cellW) {
    let startX = 0; let origLeft = 0; let moved = 0;
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      origLeft = parseFloat(el.style.left);
      el.classList.add('dragging');
      const move = (ev) => {
        moved = ev.clientX - startX;
        const snapped = Math.round(moved / cellW) * cellW;
        el.style.left = (origLeft + snapped) + 'px';
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        el.classList.remove('dragging');
        const deltaDays = Math.round(moved / cellW);
        if (deltaDays !== 0) {
          const t = DB.tache(el.dataset.tid);
          const subWorkdays = (iso, n) => {
            let cur = iso; let done = 0;
            while (done < n) { cur = D.addDays(cur, -1); if (!D.isWeekend(cur)) done++; }
            return cur;
          };
          const moveWD = (iso, n) => n >= 0 ? D.addWorkdays(iso, n) : subWorkdays(iso, -n);
          t.debut = moveWD(t.debut, deltaDays);
          t.fin   = moveWD(t.fin,   deltaDays);
          let nCasc = 0;
          if (this.state.autoCascade) nCasc = this.cascadeShift(t.id, deltaDays);
          DB.save();
          const extra = nCasc ? ` · ${nCasc} tâche(s) dépendante(s) décalée(s)` : '';
          App.toast(`Tâche déplacée de ${deltaDays > 0 ? '+' : ''}${deltaDays} j ouvrés${extra}`, 'success');
          this.draw();
        } else {
          el.style.left = origLeft + 'px'; // remet la barre à sa position si aucun snap
        }
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  },

  makeResizable(handle, cellW) {
    let startX = 0, origLeft = 0;
    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;
      origLeft = parseFloat(handle.style.left);
      document.body.style.cursor = 'col-resize';
      const tid = handle.dataset.tid;
      const barEl = document.querySelector(`.gantt-bar[data-tid="${tid}"]`);
      const origBarWidth = barEl ? parseFloat(barEl.style.width) : 0;
      const move = ev => {
        const delta = ev.clientX - startX;
        const snapped = Math.round(delta / cellW) * cellW;
        handle.style.left = (origLeft + snapped) + 'px';
        if (barEl) barEl.style.width = Math.max(cellW - 4, origBarWidth + snapped) + 'px';
      };
      const up = ev => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.body.style.cursor = '';
        const deltaDays = Math.round((ev.clientX - startX) / cellW);
        if (deltaDays !== 0) {
          const t = DB.tache(tid);
          if (t) {
            const subWD = (iso,n) => { let cur=iso,done=0; while(done<n){cur=D.addDays(cur,-1);if(!D.isWeekend(cur))done++;} return cur; };
            const newFin = deltaDays >= 0 ? D.addWorkdays(t.fin, deltaDays) : subWD(t.fin, -deltaDays);
            if (D.parse(newFin) >= D.parse(t.debut)) {
              t.fin = newFin;
              DB.logAudit('update','tache',t.id,t.nom+' (fin modifiée)');
              DB.save();
              App.toast(`${t.nom} → fin ${D.fmt(t.fin)}`, 'success');
            }
          }
        }
        this.draw();
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  },

  openTacheForm(tid, prefill = {}) {
    const isNew = !tid;
    const s = DB.state;
    const t = tid ? DB.tache(tid) : {
      id: DB.uid('T'), projetId: prefill.projetId || (s.projets[0]?.id || ''), nom:'',
      debut: prefill.debut || D.today(), fin: prefill.fin || D.addDays(D.today(), 4),
      assignes:[], machineId:null, lieuId:null, type:'prod', avancement:0, jalon:false, dependances:[], gestes:[],
    };
    if (!t.gestes) t.gestes = [];
    const machConflict = prefill.machineConflict || null;
    let machConflictHtml = '';
    if (machConflict) {
      const cm  = DB.machine(machConflict.machineId);
      const ct2 = DB.tache(machConflict.conflictTacheId);
      const cp2 = ct2 ? DB.projet(ct2.projetId) : null;
      const neededWD = Math.max(1, D.workdaysBetween(t.debut, t.fin));
      const slots = this._findMachineSlots(machConflict.machineId, t.id, neededWD, t.debut);
      const slotsHtml = slots.length ? slots.map((sl, i) => {
        const impact = this._simulateCascadeImpact(t.id, sl.deltaWD);
        const impactTxt = impact.projectDelay > 0 ? `+${impact.projectDelay} j.o. sur le projet` : impact.projectDelay < 0 ? `${impact.projectDelay} j.o.` : 'sans impact projet';
        const cascadeTxt = impact.shifted > 0 ? ` · ${impact.shifted} tâche(s) décalée(s)` : '';
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;border-radius:4px;background:var(--surface-2);margin-top:3px;font-size:11px;">
          <span>📅 <strong>${D.fmt(sl.debut)}</strong> → <strong>${D.fmt(sl.fin)}</strong> <span class="muted">(${sl.deltaWD > 0 ? '+' : ''}${sl.deltaWD} j.o.) — ${impactTxt}${cascadeTxt}</span></span>
          <button type="button" class="btn btn-secondary slot-apply" data-slot-idx="${i}" style="padding:2px 8px;font-size:11px;margin-left:8px">Appliquer</button>
        </div>`;
      }).join('') : `<div class="muted small" style="margin-top:4px">Aucun créneau libre trouvé dans les 6 prochains mois.</div>`;
      machConflictHtml = `<div id="mach-conflict-banner" style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:7px 9px;font-size:11px;color:#dc2626;margin-bottom:5px;">
        <div>⚠ <strong>${cm?.nom||'—'}</strong> aussi utilisée par ${cp2?`<strong>${cp2.code}</strong> · `:''}${ct2?.nom||'—'} (${D.fmt(ct2?.debut)}→${D.fmt(ct2?.fin)})</div>
        <div style="margin-top:5px;color:var(--text)"><strong style="font-size:11px;color:#dc2626">Créneaux disponibles :</strong>${slotsHtml}</div>
      </div>`;
      // Store slots for use in onclick handlers
      machConflict._slots = slots;
    }
    const gestesParCat = (DB.CATALOGUE_GESTES || []).reduce((acc, g) => {
      if (!acc[g.categorie]) acc[g.categorie] = [];
      acc[g.categorie].push(g);
      return acc;
    }, {});
    const renderGestesSection = () => {
      const sel = t.gestes || [];
      const totalSec = sel.reduce((n, code) => n + DB.tempsGeste(code), 0);
      const fmtT = s => s < 60 ? s+'s' : Math.round(s/60) < 60 ? Math.round(s/60)+'min' : Math.floor(s/3600)+'h'+Math.round((s%3600)/60)+'min';
      return `<div style="display:flex;align-items:center;gap:4px">
        <button type="button" class="btn-ghost f-geste-prev" title="Catégorie précédente" style="flex-shrink:0;padding:2px 8px;font-size:18px;line-height:1;align-self:center">‹</button>
        <div class="ep-geste-scroll f-geste-scroll" style="max-height:120px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:6px;background:var(--surface-2);flex:1">
          ${Object.entries(gestesParCat).map(([cat, gestes], catIdx) => `
            <div class="ep-cat-section" data-cat-idx="${catIdx}" style="margin-bottom:6px">
              <div class="muted small" style="font-weight:600;margin-bottom:3px">${cat}</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px">
                ${gestes.map(g => {
                  const checked = sel.includes(g.code);
                  return `<label title="${g.notes||''}" style="display:flex;align-items:flex-start;gap:3px;cursor:pointer;padding:2px 6px;border-radius:4px;font-size:10px;border:1px solid ${checked?'var(--primary)':'var(--border)'};background:${checked?'var(--primary-weak)':'transparent'}">
                    <input type="checkbox" class="f-geste-cb" data-code="${g.code}" ${checked?'checked':''} style="margin:2px 0 0">
                    <span><span style="font-weight:600">${g.code}</span><br><span class="muted" style="font-size:9px">${g.description}</span></span>
                  </label>`;
                }).join('')}
              </div>
            </div>`).join('')}
        </div>
        <button type="button" class="btn-ghost f-geste-next" title="Catégorie suivante" style="flex-shrink:0;padding:2px 8px;font-size:18px;line-height:1;align-self:center">›</button>
      </div>
      ${sel.length ? `<div class="muted small f-geste-est" style="margin-top:4px">⏱ Estimation : ${fmtT(totalSec)} / pièce · ${sel.length} geste(s) sélectionné(s)</div>` : ''}`;
    };

    const GABARITS_FLUX = {
      logistique: {
        label:'Logistique', couleur:'#2c5fb3',
        stations: ['Décharge & réception palette','Contrôle entrée (scan)','Déconditionnement','Tri & rangement stock (FIFO)','Picking commande','Filmage palette','Étiquetage transport','Expédition quai'],
      },
      emballage: {
        label:'Emballage', couleur:'#059669',
        stations: ['Réception articles à emballer','Déconditionnement & tri','Reconditionnement','Étiquetage automatique','Contrôle qualité (scan)','Banderollage','Filmage palette','Pesée & étiquette transport'],
      },
      conditionnement: {
        label:'Conditionnement', couleur:'#7c3aed',
        stations: ['Appro & prélèvement (BOM)','Contrôle composants','Assemblage pièces','Callage & protection mousse','Film bulles','Emballage carton & fermeture','Banderollage sécurisation','Pesée & étiquetage final'],
      },
    };
    let _gabaritKey = '';
    const renderGabaritPanel = (key) => {
      const g = GABARITS_FLUX[key];
      const panel = document.getElementById('gabarit-panel');
      if (!panel) return;
      if (!g) { panel.innerHTML = ''; return; }
      panel.innerHTML = `<div style="margin-top:8px;padding:8px 10px;border-radius:6px;border:1.5px solid ${g.couleur}55;background:${g.couleur}0d">
        <div style="font-size:11px;font-weight:600;color:${g.couleur};margin-bottom:6px">Stations ${g.label}</div>
        <div id="gabarit-items" style="display:flex;flex-direction:column;gap:3px">
          ${g.stations.map((st,i) => `<label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;padding:2px 4px;border-radius:4px">
            <input type="checkbox" class="gabarit-cb" checked style="flex-shrink:0"> <span>${st}</span>
          </label>`).join('')}
        </div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <input type="text" id="gabarit-add-input" placeholder="+ Ajouter une station…" style="flex:1;font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface)">
          <button type="button" id="gabarit-add-btn" class="btn btn-secondary" style="font-size:11px;padding:3px 8px">+</button>
        </div>
      </div>`;
      const addInput = document.getElementById('gabarit-add-input');
      const addBtn = document.getElementById('gabarit-add-btn');
      const addStation = () => {
        const txt = addInput.value.trim();
        if (!txt) return;
        const items = document.getElementById('gabarit-items');
        const lbl = document.createElement('label');
        lbl.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;padding:2px 4px;border-radius:4px';
        lbl.innerHTML = `<input type="checkbox" class="gabarit-cb" checked style="flex-shrink:0"> <span>${txt}</span>`;
        items.appendChild(lbl);
        addInput.value = '';
        addInput.focus();
      };
      addBtn.onclick = addStation;
      addInput.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addStation(); } };
    };

    const body = `
      ${isNew ? `<div class="field" style="margin-bottom:2px">
        <label style="font-weight:600;font-size:12px">Gabarit de flux <span class="muted small" style="font-weight:400">(optionnel — pré-remplit les stations de travail)</span></label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:5px">
          ${Object.entries(GABARITS_FLUX).map(([key,g]) => `
            <button type="button" class="gabarit-btn" data-key="${key}" style="padding:4px 14px;border-radius:20px;border:1.5px solid ${g.couleur};background:transparent;color:${g.couleur};font-size:11px;font-weight:600;cursor:pointer">${g.label}</button>
          `).join('')}
          <button type="button" class="gabarit-btn" data-key="" style="padding:4px 12px;border-radius:20px;border:1.5px solid var(--border);background:transparent;color:var(--text-muted);font-size:11px;cursor:pointer">✕ Sans gabarit</button>
        </div>
        <div id="gabarit-panel"></div>
      </div>` : ''}
      <div class="field"><label>Nom</label><input id="f-nom" value="${t.nom||''}"></div>
      <div class="row">
        <div class="field"><label>Projet</label>
          <select id="f-projet">
            ${App.projetsOptions(t.projetId)}
          </select>
        </div>
        <div class="field"><label>Type</label>
          <select id="f-type">
            ${['etude','appro','prod','livraison','jalon'].map(x => `<option value="${x}" ${x===t.type?'selected':''}>${x}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="row">
        <div class="field"><label>Début</label><input type="date" id="f-debut" value="${t.debut}"></div>
        <div class="field" style="flex:0;align-self:flex-end;padding-bottom:2px"><span class="dur-badge" id="f-dur">${Math.max(0,D.workdaysBetween(t.debut,t.fin))} j.o.</span></div>
        <div class="field"><label>Fin</label><input type="date" id="f-fin" value="${t.fin}"></div>
      </div>
      <div class="field"><label>Avancement &nbsp;<span class="av-display" id="f-av-val">${t.avancement||0}%</span></label>
        <input type="range" id="f-avancement" min="0" max="100" value="${Math.min(100,Math.max(0,t.avancement||0))}" class="av-slider">
      </div>
      <div class="row">
        <div class="field"><label>Machine</label>
          ${machConflictHtml}
          <select id="f-machine" style="${machConflict?'border:2px solid #dc2626;':''}" ><option value="">—</option>${s.machines.map(m => `<option value="${m.id}" ${m.id===t.machineId?'selected':''}>${m.nom}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Lieu</label>
          <select id="f-lieu"><option value="">—</option>${s.lieux.map(l => `<option value="${l.id}" ${l.id===t.lieuId?'selected':''}>${l.nom}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field"><label>Assignés</label>
        <div id="f-assignes-chips" style="display:flex;flex-wrap:wrap;gap:5px;min-height:24px;align-items:center">
          ${(t.assignes||[]).length
            ? (t.assignes||[]).map(aid => {
                const p = s.personnes.find(x => x.id === aid);
                return p ? `<span class="badge good" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;cursor:default">${App.personneLabel(p)}<button type="button" class="chip-remove" data-pid="${p.id}" title="Retirer" style="background:none;border:none;cursor:pointer;font-size:14px;line-height:1;padding:0;color:inherit;opacity:.7;margin-left:2px">×</button></span>`
                : '';
              }).join('')
            : '<span class="muted small">Aucun assigné</span>'}
        </div>
        <button type="button" id="f-assignes-toggle" class="btn btn-secondary" style="margin-top:6px;font-size:11px;padding:3px 10px">⚙ Modifier / + Assigner</button>
        <div class="assignes-list" id="f-assignes-wrap" style="display:none;margin-top:6px">
          ${s.personnes.map(p => {
            const chk = (t.assignes||[]).includes(p.id);
            return `<label class="assignes-row${chk?' is-checked':''}"><input type="checkbox" class="assignes-cb" value="${p.id}"${chk?' checked':''}> <span>${App.personneLabel(p)}</span> <span class="muted small"> · ${p.role}</span></label>`;
          }).join('')}
        </div>
      </div>
      <div id="f-sugg" class="muted small" style="margin-top:-4px"></div>
      <div class="field"><label>🎯 Pré-remplir avec une équipe</label>
        <div class="row" style="gap:6px;align-items:end">
          <select id="f-equipe" style="flex:3"><option value="">—</option>${(s.equipes||[]).map(eq => `<option value="${eq.id}">${eq.nom} · ${(eq.slots||[]).reduce((n,sl)=>n+sl.n,0)} pers.</option>`).join('')}</select>
          <button type="button" class="btn btn-secondary" id="f-eq-apply" style="margin-bottom:0">Appliquer l'équipe</button>
        </div>
        <p class="muted small" style="margin-top:4px">Sélectionne automatiquement les personnes disponibles correspondant aux slots de l'équipe (horaires + compétences + charge).</p>
      </div>
      <div class="field"><label>Dépendances (tâches dont celle-ci dépend)</label>
        <select id="f-deps" multiple size="5">
          ${s.taches.filter(x => x.id !== t.id && x.projetId === t.projetId).sort((a,b)=>a.debut.localeCompare(b.debut)).map(x => `<option value="${x.id}" ${(t.dependances||[]).includes(x.id)?'selected':''}>${x.nom} · ${D.fmt(x.debut)}→${D.fmt(x.fin)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>📝 Notes / consignes</label>
        <textarea id="f-notes" rows="3" placeholder="Instructions d'exécution, références, points d'attention…">${t.notes||''}</textarea>
      </div>
      <div class="field">
        <label>🏷 Gestes associés <span class="muted small">(catalogue atelier — optionnel)</span></label>
        <div id="f-gestes-wrap">${renderGestesSection()}</div>
      </div>
      <div class="field"><label>✅ Sous-tâches <span class="muted small" id="f-cl-count">${(t.checklist||[]).length ? (t.checklist||[]).filter(i=>i.done).length+'/'+(t.checklist||[]).length : ''}</span></label>
        <div id="f-cl-list" class="cl-list">
          ${(t.checklist||[]).length ? (t.checklist||[]).map(item => `<div class="cl-item"><label class="cl-row${item.done?' cl-done':''}"><input type="checkbox" class="cl-cb" data-id="${item.id}" ${item.done?'checked':''}><span class="cl-text">${item.texte.replace(/</g,'&lt;')}</span></label><button class="btn-ghost cl-del" data-id="${item.id}" style="padding:0 6px;flex-shrink:0">×</button></div>`).join('') : '<p class="muted small" style="margin:4px 0">Aucune sous-tâche. Ajoute des étapes à cocher ci-dessous.</p>'}
        </div>
        <div style="display:flex;gap:6px;margin-top:4px">
          <input id="f-cl-new" type="text" placeholder="Nouvelle sous-tâche (Entrée pour ajouter)…" style="flex:1">
          <button type="button" class="btn btn-secondary" id="f-cl-add" style="padding:4px 10px;flex-shrink:0">+</button>
        </div>
      </div>
      <div class="field"><label>💬 Commentaires (${(t.commentaires||[]).length})</label>
        <div id="f-comments-list" class="comments-list">
          ${(t.commentaires||[]).length ? (t.commentaires||[]).slice().reverse().map(c => `
            <div class="comment-item" data-cid="${c.id}">
              <div class="comment-head"><strong>${c.userName}</strong> <span class="muted small">· ${new Date(c.date).toLocaleString('fr-CH',{dateStyle:'short',timeStyle:'short'})}</span>
              ${c.userId === App.currentUser().id ? `<button class="btn-ghost comment-del" data-cid="${c.id}" style="padding:0 6px;margin-left:auto" title="Supprimer">🗑</button>` : ''}</div>
              <div class="comment-text">${c.texte.replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>
            </div>
          `).join('') : '<p class="muted small" style="margin:4px 0">Aucun commentaire. Partage une info, un blocage, une décision…</p>'}
        </div>
        <div class="comment-add">
          <textarea id="f-comment-new" rows="2" placeholder="Ajouter un commentaire (Ctrl+Entrée pour poster)…"></textarea>
          <button class="btn btn-secondary" id="f-comment-post" style="margin-top:4px">💬 Poster</button>
        </div>
      </div>
      <label class="small"><input type="checkbox" id="f-jalon" ${t.jalon?'checked':''}> Jalon</label>

      ${!isNew ? `<div class="field" style="margin-top:10px">
        <label>⏱ Temps réel <span class="muted small" id="f-temps-total"></span></label>
        <div id="f-temps-list" class="cl-list" style="max-height:140px"></div>
        <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
          <input type="date" id="f-temps-date" value="${D.today()}" style="flex:1;min-width:120px">
          <select id="f-temps-qui" style="flex:2;min-width:120px">
            ${(t.assignes||[]).length
              ? (t.assignes||[]).map(pid => { const p = DB.personne(pid); return p ? `<option value="${pid}">${App.personneLabel(p)}</option>` : ''; }).join('')
              : s.personnes.map(p => `<option value="${p.id}">${App.personneLabel(p)}</option>`).join('')}
          </select>
          <input type="number" id="f-temps-h" min="0.5" max="24" step="0.5" value="7" style="width:65px" title="Heures">
          <button class="btn btn-secondary" id="f-temps-add" type="button">+ Log</button>
        </div>
        <div class="muted small" style="margin-top:3px">Enregistre les heures réelles travaillées sur cette tâche.</div>
      </div>` : ''}
    `;
    const foot = `
      ${!isNew ? '<button class="btn btn-danger" id="f-del">Supprimer</button>' : ''}
      ${!isNew ? '<button class="btn btn-secondary" id="f-dup" title="Duplique cette tâche dans le même projet">⎘ Dupliquer</button>' : ''}
      <span class="spacer" style="flex:1"></span>
      <button class="btn btn-secondary" id="f-cancel">Annuler</button>
      <button class="btn" id="f-save">${isNew?'Créer':'Enregistrer'}</button>
    `;
    App.openModal(isNew ? 'Nouvelle tâche' : 'Tâche — ' + App.escapeHTML(t.nom), body, foot);

    // Gabarits de flux — boutons + panel dynamique
    if (isNew) {
      document.querySelectorAll('.gabarit-btn').forEach(btn => {
        btn.onclick = () => {
          _gabaritKey = btn.dataset.key;
          document.querySelectorAll('.gabarit-btn').forEach(b => {
            const gk = b.dataset.key;
            const g = GABARITS_FLUX[gk];
            b.style.background = b.dataset.key === _gabaritKey ? (g ? g.couleur : 'var(--surface-2)') : 'transparent';
            b.style.color      = b.dataset.key === _gabaritKey ? '#fff' : (g ? g.couleur : 'var(--text-muted)');
          });
          renderGabaritPanel(_gabaritKey);
          // Pré-remplir le champ nom si vide
          const nomEl = document.getElementById('f-nom');
          if (nomEl && !nomEl.value && GABARITS_FLUX[_gabaritKey]) {
            nomEl.value = 'Tâche ' + GABARITS_FLUX[_gabaritKey].label;
            nomEl.focus(); nomEl.select();
          }
        };
      });
    }

    // Assignés — toggle chips/checkbox list + chip remove
    const refreshChips = () => {
      const checked = Array.from(document.querySelectorAll('#f-assignes-wrap .assignes-cb:checked'));
      const chipsEl = document.getElementById('f-assignes-chips');
      if (!chipsEl) return;
      if (checked.length === 0) {
        chipsEl.innerHTML = '<span class="muted small">Aucun assigné</span>';
      } else {
        chipsEl.innerHTML = checked.map(cb => {
          const p = s.personnes.find(x => x.id === cb.value);
          return p ? `<span class="badge good" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;cursor:default">${App.personneLabel(p)}<button type="button" class="chip-remove" data-pid="${p.id}" title="Retirer" style="background:none;border:none;cursor:pointer;font-size:14px;line-height:1;padding:0;color:inherit;opacity:.7;margin-left:2px">×</button></span>` : '';
        }).join('');
        chipsEl.querySelectorAll('.chip-remove').forEach(btn => {
          btn.onclick = () => {
            const cb = document.querySelector(`#f-assignes-wrap .assignes-cb[value="${btn.dataset.pid}"]`);
            if (cb) { cb.checked = false; cb.closest('.assignes-row')?.classList.remove('is-checked'); }
            refreshChips();
          };
        });
      }
    };
    // Bind chip-remove on initial chips
    document.querySelectorAll('#f-assignes-chips .chip-remove').forEach(btn => {
      btn.onclick = () => {
        const cb = document.querySelector(`#f-assignes-wrap .assignes-cb[value="${btn.dataset.pid}"]`);
        if (cb) { cb.checked = false; cb.closest('.assignes-row')?.classList.remove('is-checked'); }
        refreshChips();
      };
    });
    // Toggle button
    const toggleBtn = document.getElementById('f-assignes-toggle');
    if (toggleBtn) toggleBtn.onclick = () => {
      const wrap = document.getElementById('f-assignes-wrap');
      const hidden = wrap.style.display === 'none';
      wrap.style.display = hidden ? '' : 'none';
      toggleBtn.textContent = hidden ? '▲ Masquer la liste' : '⚙ Modifier / + Assigner';
    };
    // When a checkbox changes, refresh chips
    document.querySelectorAll('#f-assignes-wrap .assignes-cb').forEach(cb => {
      cb.addEventListener('change', refreshChips);
    });

    // Machine conflict — slot apply buttons
    if (machConflict && machConflict._slots) {
      const subWorkdays = (iso, n) => { let cur = iso, done = 0; while (done < n) { cur = D.addDays(cur, -1); if (!D.isWeekend(cur)) done++; } return cur; };
      document.querySelectorAll('.slot-apply').forEach(btn => {
        btn.onclick = () => {
          const idx = +btn.dataset.slotIdx;
          const sl = machConflict._slots[idx];
          if (!sl) return;
          document.getElementById('f-debut').value = sl.debut;
          document.getElementById('f-fin').value = sl.fin;
          const durEl = document.getElementById('f-dur');
          if (durEl) durEl.textContent = Math.max(0, D.workdaysBetween(sl.debut, sl.fin)) + ' j.o.';
          // Bannière verte : conflit résolu
          const banner = document.getElementById('mach-conflict-banner');
          if (banner) {
            banner.style.cssText = 'background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:7px 9px;font-size:11px;color:#16a34a;margin-bottom:5px;';
            banner.innerHTML = `<div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:15px">✅</span>
              <span><strong>Conflit résolu</strong> — créneau appliqué : <strong>${D.fmt(sl.debut)}</strong> → <strong>${D.fmt(sl.fin)}</strong></span>
            </div>`;
          }
          const machSel = document.getElementById('f-machine');
          if (machSel) machSel.style.border = '';
          renderSugg();
        };
      });
    }

    // Suggestions d'affectation
    const renderSugg = () => {
      const pseudo = { debut: document.getElementById('f-debut').value, fin: document.getElementById('f-fin').value, machineId: document.getElementById('f-machine').value || null, lieuId: document.getElementById('f-lieu').value || null, type: document.getElementById('f-type').value };
      const sugg = App.suggestAssignees(pseudo, 3);
      document.getElementById('f-sugg').innerHTML = '💡 Suggestions : ' + sugg.map(x => `<button type="button" class="chip" data-sugg="${x.p.id}" style="cursor:pointer">${App.personneLabel(x.p)}${x.compMatch?' ✓':''} · charge ${x.charge}j</button>`).join(' ');
      document.querySelectorAll('[data-sugg]').forEach(b => b.onclick = () => {
        const cb = document.querySelector(`#f-assignes-wrap .assignes-cb[value="${b.dataset.sugg}"]`);
        if (cb && !cb.checked) { cb.checked = true; cb.closest('.assignes-row').classList.add('is-checked'); refreshChips(); }
      });
    };
    renderSugg();
    ['f-debut','f-fin','f-machine','f-lieu','f-type'].forEach(id => { const el = document.getElementById(id); if (el) el.onchange = renderSugg; });
    const updateDur = () => { const el = document.getElementById('f-dur'); if (el) el.textContent = Math.max(0, D.workdaysBetween(document.getElementById('f-debut').value, document.getElementById('f-fin').value)) + ' j.o.'; };
    ['f-debut','f-fin'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('change', updateDur); });
    const avEl = document.getElementById('f-avancement'); if (avEl) avEl.oninput = e => { const d = document.getElementById('f-av-val'); if (d) d.textContent = e.target.value + '%'; };
    // Gestes — checkboxes + navigation catégorie
    const refreshGestes = () => {
      t.gestes = Array.from(document.querySelectorAll('#f-gestes-wrap .f-geste-cb:checked')).map(cb => cb.dataset.code);
      // Update label styles without re-rendering (preserves scroll position)
      document.querySelectorAll('#f-gestes-wrap .f-geste-cb').forEach(cb => {
        const label = cb.closest('label');
        if (!label) return;
        const checked = cb.checked;
        label.style.borderColor = checked ? 'var(--primary)' : 'var(--border)';
        label.style.background = checked ? 'var(--primary-weak)' : 'transparent';
      });
      // Update estimation text
      const totalSec = t.gestes.reduce((n, code) => n + DB.tempsGeste(code), 0);
      const fmtT = s => s < 60 ? s+'s' : Math.round(s/60) < 60 ? Math.round(s/60)+'min' : Math.floor(s/3600)+'h'+Math.round((s%3600)/60)+'min';
      const wrap = document.getElementById('f-gestes-wrap');
      let est = wrap ? wrap.querySelector('.f-geste-est') : null;
      if (t.gestes.length) {
        if (!est) { est = document.createElement('div'); est.className = 'muted small f-geste-est'; est.style.marginTop = '4px'; if (wrap) wrap.appendChild(est); }
        est.textContent = `⏱ Estimation : ${fmtT(totalSec)} / pièce · ${t.gestes.length} geste(s) sélectionné(s)`;
      } else if (est) {
        est.remove();
      }
    };
    const bindGestes = () => {
      document.querySelectorAll('#f-gestes-wrap .f-geste-cb').forEach(cb => cb.onchange = refreshGestes);
      const prevBtn = document.querySelector('#f-gestes-wrap .f-geste-prev');
      const nextBtn = document.querySelector('#f-gestes-wrap .f-geste-next');
      if (prevBtn) prevBtn.onclick = () => {
        const c = document.querySelector('#f-gestes-wrap .f-geste-scroll');
        const secs = c.querySelectorAll('.ep-cat-section');
        let cur = 0; secs.forEach((s,i) => { if (s.offsetTop <= c.scrollTop + 8) cur = i; });
        if (cur > 0) c.scrollTop = secs[cur - 1].offsetTop;
      };
      if (nextBtn) nextBtn.onclick = () => {
        const c = document.querySelector('#f-gestes-wrap .f-geste-scroll');
        const secs = c.querySelectorAll('.ep-cat-section');
        let cur = 0; secs.forEach((s,i) => { if (s.offsetTop <= c.scrollTop + 8) cur = i; });
        if (cur < secs.length - 1) c.scrollTop = secs[cur + 1].offsetTop;
      };
    };
    bindGestes();
    // Checklist sous-tâches
    const localCL = JSON.parse(JSON.stringify(t.checklist || []));
    const refreshCL = () => {
      const total = localCL.length, done = localCL.filter(i=>i.done).length;
      const cnt = document.getElementById('f-cl-count'); if (cnt) cnt.textContent = total ? `${done}/${total}` : '';
      if (total) { const pct = Math.round(done/total*100); const sl = document.getElementById('f-avancement'), vl = document.getElementById('f-av-val'); if (sl) sl.value = pct; if (vl) vl.textContent = pct + '%'; }
      const listEl = document.getElementById('f-cl-list'); if (!listEl) return;
      listEl.innerHTML = localCL.length
        ? localCL.map(item => `<div class="cl-item"><label class="cl-row${item.done?' cl-done':''}"><input type="checkbox" class="cl-cb" data-id="${item.id}" ${item.done?'checked':''}><span class="cl-text">${item.texte.replace(/</g,'&lt;')}</span></label><button class="btn-ghost cl-del" data-id="${item.id}" style="padding:0 6px;flex-shrink:0">×</button></div>`).join('')
        : '<p class="muted small" style="margin:4px 0">Aucune sous-tâche.</p>';
      listEl.querySelectorAll('.cl-cb').forEach(cb => cb.onchange = () => { const i = localCL.find(x=>x.id===cb.dataset.id); if (i) i.done = cb.checked; refreshCL(); });
      listEl.querySelectorAll('.cl-del').forEach(btn => btn.onclick = () => { const idx = localCL.findIndex(x=>x.id===btn.dataset.id); if (idx>=0) localCL.splice(idx,1); refreshCL(); });
    };
    const addCLItem = () => {
      const inp = document.getElementById('f-cl-new');
      if (!inp) return;
      const txt = inp.value.trim();
      if (!txt) { inp.focus(); inp.style.outline = '2px solid var(--danger)'; setTimeout(() => inp.style.outline = '', 1000); return; }
      localCL.push({id:DB.uid('CL'),texte:txt,done:false});
      inp.value = '';
      inp.focus();
      refreshCL();
      // Scroll la liste pour voir le nouvel item
      const listEl = document.getElementById('f-cl-list');
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
    };
    // Délégation sur modal-body pour être robuste aux re-renders
    document.getElementById('modal-body').addEventListener('click', e => {
      if (e.target.closest('#f-cl-add')) addCLItem();
    });
    const clNewInp = document.getElementById('f-cl-new'); if (clNewInp) clNewInp.onkeydown = e => { if (e.key==='Enter') { e.preventDefault(); addCLItem(); } };
    refreshCL();
    const assignesWrap = document.getElementById('f-assignes-wrap');
    if (assignesWrap) assignesWrap.addEventListener('change', e => {
      if (e.target.classList.contains('assignes-cb')) e.target.closest('.assignes-row').classList.toggle('is-checked', e.target.checked);
    });

    // Pré-remplissage par équipe — avec détection de conflit et popup de choix
    document.getElementById('f-eq-apply').onclick = () => {
      const eqId = document.getElementById('f-equipe').value;
      if (!eqId) { App.toast('Choisir une équipe','error'); return; }
      const debut = document.getElementById('f-debut').value;
      const fin = document.getElementById('f-fin').value;
      const prop = App.views.equipes.proposerAffectation(eqId, debut, fin);
      if (!prop) { App.toast('Équipe introuvable','error'); return; }

      // Détecte les conflits : personnes sélectionnées déjà affectées à d'autres tâches qui chevauchent
      const conflicts = [];
      prop.slots.forEach(sl => {
        sl.selected.forEach(c => {
          if (c.libre) return;
          const others = DB.state.taches.filter(tt =>
            tt.id !== t.id &&
            (tt.assignes||[]).includes(c.p.id) &&
            tt.fin >= debut && tt.debut <= fin && !tt.jalon
          );
          if (others.length) conflicts.push({ personne: c.p, competence: sl.competence, otherTasks: others });
        });
      });

      const applyFinal = (moves) => {
        // moves = Set<personneId> des personnes à déplacer (retirées des autres tâches)
        moves = moves || new Set();
        // skips = personnes à ne pas affecter à cette tâche
        const selectedIds = new Set();
        prop.slots.forEach(sl => sl.selected.forEach(c => selectedIds.add(c.p.id)));
        // Si la personne a un conflit non résolu (pas dans moves), on la retire de l'affectation
        conflicts.forEach(cf => {
          if (!moves.has(cf.personne.id)) selectedIds.delete(cf.personne.id);
        });
        // Retirer la personne des autres tâches pour les moves
        moves.forEach(pid => {
          DB.state.taches.forEach(tt => {
            if (tt.id === t.id) return;
            if (tt.fin >= debut && tt.debut <= fin) {
              tt.assignes = (tt.assignes||[]).filter(x => x !== pid);
            }
          });
        });
        document.querySelectorAll('#f-assignes-wrap .assignes-cb').forEach(cb => {
          cb.checked = selectedIds.has(cb.value);
          cb.closest('.assignes-row').classList.toggle('is-checked', selectedIds.has(cb.value));
        });
        refreshChips();
        const missing = [];
        prop.slots.forEach(sl => {
          const got = sl.selected.filter(c => selectedIds.has(c.p.id)).length;
          if (got < sl.n) missing.push(`${sl.competence} : ${got}/${sl.n}`);
        });
        const totalPers = selectedIds.size;
        const msg = `${totalPers} personne(s) affectée(s)` + (moves.size ? ` · ${moves.size} déplacée(s)` : '') + (missing.length ? ` · manque : ${missing.join(', ')}` : '');
        App.toast(msg, missing.length ? 'warn' : 'success');
        if (moves.size) DB.save();
      };

      if (!conflicts.length) {
        applyFinal(new Set());
        return;
      }

      // Overlay personnalisé au-dessus de la modale de tâche (préserve le form)
      if (document.querySelector('.conflict-overlay')) return;
      const overlay = document.createElement('div');
      overlay.className = 'conflict-overlay';
      overlay.innerHTML = `<div class="conflict-card">
        <header class="conflict-head"><h3>⚠ Conflit d'affectation détecté</h3></header>
        <div class="conflict-body">
          <p>${conflicts.length} personne(s) proposée(s) ont déjà des tâches qui chevauchent :</p>
          <ul class="list" style="max-height:320px;overflow:auto;margin:10px 0">
            ${conflicts.map(cf => {
              const autres = cf.otherTasks.map(tt => {
                const prj = DB.projet(tt.projetId);
                return `<span class="badge" style="background:${prj?prj.couleur+'33':''};color:${prj?prj.couleur:''}">${prj?prj.code:''}</span> ${tt.nom} · ${D.fmt(tt.debut)}→${D.fmt(tt.fin)}`;
              }).join(' · ');
              return `<li style="align-items:start">
                <div style="flex:1">
                  <strong>${App.personneLabel(cf.personne)}</strong> <span class="muted small">(slot ${cf.competence})</span>
                  <div class="small muted" style="margin-top:3px">⚠ Déjà prévue pour : ${autres}</div>
                </div>
                <label class="chip" style="cursor:pointer"><input type="checkbox" class="conf-move" data-pid="${cf.personne.id}" checked> Déplacer ici</label>
              </li>`;
            }).join('')}
          </ul>
          <p class="muted small">« Déplacer ici » = retire la personne des tâches concurrentes et l'affecte à celle-ci. Décocher = la laisser sur son autre tâche.</p>
        </div>
        <footer class="conflict-foot">
          <button class="btn btn-secondary" id="conf-none">Garder tout</button>
          <button class="btn btn-secondary" id="conf-all">Tout déplacer</button>
          <span class="spacer" style="flex:1"></span>
          <button class="btn btn-secondary" id="conf-cancel">Annuler</button>
          <button class="btn" id="conf-ok">Appliquer</button>
        </footer>
      </div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      document.getElementById('conf-none').onclick = () => { applyFinal(new Set()); close(); };
      document.getElementById('conf-all').onclick = () => {
        const all = new Set(conflicts.map(cf => cf.personne.id));
        applyFinal(all); close();
      };
      document.getElementById('conf-cancel').onclick = close;
      document.getElementById('conf-ok').onclick = () => {
        const moves = new Set();
        overlay.querySelectorAll('.conf-move:checked').forEach(cb => moves.add(cb.dataset.pid));
        applyFinal(moves); close();
      };
    };

    // Commentaires
    const refreshComments = () => { App.closeModal(); this.openTacheForm(t.id); };
    document.getElementById('f-comment-post').onclick = () => {
      const ta = document.getElementById('f-comment-new');
      const txt = ta.value.trim();
      if (!txt) { App.toast('Commentaire vide', 'warn'); return; }
      const u = App.currentUser();
      if (!t.commentaires) t.commentaires = [];
      t.commentaires.push({ id: DB.uid('CM'), userId: u.id, userName: u.nom, texte: txt, date: new Date().toISOString() });
      if (isNew) { DB.state.taches.push(t); DB.logAudit('create','tache',t.id,t.nom); DB.save(); App.closeModal(); App.toast('Tâche créée avec commentaire','success'); App.refresh(); return; }
      DB.save(); App.toast('Commentaire ajouté','success'); refreshComments();
    };
    document.getElementById('f-comment-new').onkeydown = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); document.getElementById('f-comment-post').click(); }
    };
    document.querySelectorAll('.comment-del').forEach(b => b.onclick = () => {
      if (!confirm('Supprimer ce commentaire ?')) return;
      t.commentaires = (t.commentaires||[]).filter(c => c.id !== b.dataset.cid);
      DB.save(); refreshComments();
    });

    // Temps réel
    if (!isNew) {
      const tempsLog = t.tempsLog || [];
      const refreshTemps = () => {
        const total = tempsLog.reduce((s, e) => s + (e.h || 0), 0);
        const estim = Math.max(1, D.workdaysBetween(t.debut, t.fin)) * 7;
        const tEl = document.getElementById('f-temps-total');
        if (tEl) tEl.textContent = `${total}h réelles / ~${estim}h estimées`;
        const listEl = document.getElementById('f-temps-list');
        if (!listEl) return;
        listEl.innerHTML = tempsLog.length
          ? [...tempsLog].reverse().map(e => {
              const p = DB.personne(e.pid); const pNom = p ? App.personneLabel(p) : '—';
              return `<div class="cl-item"><span class="cl-row" style="gap:6px"><span class="muted small">${D.fmt(e.date)}</span><strong style="font-size:12px">${pNom}</strong><span class="muted small">${e.h}h</span>${e.note?`<span class="muted small">· ${e.note}</span>`:''}</span><button class="btn-ghost cl-del" data-eid="${e.id}" style="padding:0 4px;flex-shrink:0">×</button></div>`;
            }).join('')
          : '<p class="muted small" style="margin:4px 0">Aucune saisie de temps.</p>';
        listEl.querySelectorAll('.cl-del').forEach(btn => btn.onclick = () => {
          const idx = tempsLog.findIndex(x => x.id === btn.dataset.eid);
          if (idx >= 0) tempsLog.splice(idx, 1);
          t.tempsLog = tempsLog; DB.save(); refreshTemps();
        });
      };
      refreshTemps();
      const addBtn = document.getElementById('f-temps-add');
      if (addBtn) addBtn.onclick = () => {
        const date = document.getElementById('f-temps-date').value;
        const pid = document.getElementById('f-temps-qui').value;
        const h = parseFloat(document.getElementById('f-temps-h').value) || 0;
        if (!date || !pid || h <= 0) { App.toast('Date, personne et heures requis', 'warn'); return; }
        tempsLog.push({ id: DB.uid('TL'), date, pid, h });
        t.tempsLog = tempsLog; DB.save(); refreshTemps();
        App.toast(`${h}h enregistrées`, 'success');
      };
    }

    document.getElementById('f-cancel').onclick = () => App.closeModal();
    document.getElementById('f-save').onclick = () => {
      t.nom = document.getElementById('f-nom').value.trim();
      t.projetId = document.getElementById('f-projet').value;
      t.type = document.getElementById('f-type').value;
      t.debut = document.getElementById('f-debut').value;
      t.fin = document.getElementById('f-fin').value;
      t.avancement = +document.getElementById('f-avancement').value;
      t.machineId = document.getElementById('f-machine').value || null;
      t.lieuId = document.getElementById('f-lieu').value || null;
      t.assignes = Array.from(document.querySelectorAll('#f-assignes-wrap .assignes-cb:checked')).map(cb => cb.value);
      t.jalon = document.getElementById('f-jalon').checked;
      t.dependances = Array.from(document.getElementById('f-deps').selectedOptions).map(o => o.value);
      t.notes = document.getElementById('f-notes').value;
      t.gestes = Array.from(document.querySelectorAll('#f-gestes-wrap .f-geste-cb:checked')).map(cb => cb.dataset.code);
      // Injecter les stations du gabarit dans la checklist (nouvelles tâches uniquement)
      if (isNew && _gabaritKey && GABARITS_FLUX[_gabaritKey]) {
        const stationsChecked = Array.from(document.querySelectorAll('#gabarit-items .gabarit-cb:checked'));
        stationsChecked.forEach(cb => {
          const txt = cb.parentElement.querySelector('span')?.textContent?.trim();
          if (txt) localCL.push({ id: DB.uid('CL'), texte: txt, done: false });
        });
      }
      t.checklist = localCL;
      if (!t.nom) { App.toast('Nom requis','error'); return; }

      // Séquencement strict : vérifier que debut > fin de chaque prédécesseur
      if (!t.jalon && t.dependances.length) {
        const prj = DB.projet(t.projetId);
        if (prj?.sequencementStrict) {
          const depTaches = t.dependances.map(id => DB.state.taches.find(x => x.id === id)).filter(Boolean);
          const violations = depTaches.filter(d => t.debut <= d.fin);
          if (violations.length) {
            const maxFin = violations.reduce((m, d) => d.fin > m ? d.fin : m, '');
            const sugDebut = D.nextWorkday(D.addDays(maxFin, 1));
            const durWD = Math.max(1, D.workdaysBetween(t.debut, t.fin));
            const sugFin = D.addWorkdays(sugDebut, durWD - 1);
            const names = violations.map(d => `"${d.nom}" (fin ${D.fmt(d.fin)})`).join(', ');
            const msg = `⛓ Séquencement strict\n\n« ${t.nom} » commence avant la fin de :\n${names}\n\nAuto-corriger → ${D.fmt(sugDebut)} → ${D.fmt(sugFin)} (${durWD} j.o.) ?`;
            if (!confirm(msg)) return;
            t.debut = sugDebut;
            t.fin = sugFin;
            document.getElementById('f-debut').value = sugDebut;
            document.getElementById('f-fin').value = sugFin;
          }
        }
      }

      if (isNew) { DB.state.taches.push(t); DB.logAudit('create','tache',t.id,t.nom); }
      else DB.logAudit('update','tache',t.id,t.nom);
      DB.save(); App.closeModal(); App.toast('Enregistré','success'); App.refresh();
    };
    if (!isNew) {
      document.getElementById('f-del').onclick = () => {
        if (!confirm('Supprimer cette tâche ?')) return;
        DB.state.taches = DB.state.taches.filter(x => x.id !== t.id);
        DB.logAudit('delete','tache',t.id,t.nom);
        DB.save(); App.closeModal(); App.toast('Tâche supprimée','info'); App.refresh();
      };
      document.getElementById('f-dup').onclick = () => {
        const copy = JSON.parse(JSON.stringify(t));
        copy.id = DB.uid('T'); copy.nom = t.nom + ' (copie)';
        copy.avancement = 0; copy.dependances = []; copy.commentaires = [];
        DB.state.taches.push(copy);
        DB.logAudit('create','tache',copy.id,copy.nom);
        DB.save(); App.closeModal(); App.toast('Tâche dupliquée','success'); this.draw();
      };
    }
  },
};
