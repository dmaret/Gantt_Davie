App.views.gantt = {
  state: {
    mode: 'projet',      // 'projet' | 'personne' | 'machine' | 'lieu'
    zoom: 'jour',        // 'jour' | 'semaine'
    rangeStart: null,
    rangeDays: 56,
    projetFilter: '',
    search: '',
    showDeps: true,
    showCritical: true,
    autoCascade: true,
  },
  newItem() { this.openTacheForm(null); },

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

  render(root) {
    const st = this.state;
    if (!st.rangeStart) st.rangeStart = D.addDays(D.today(), -14);

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
            <option value="">Tous les projets</option>
            ${DB.state.projets.map(p => `<option value="${p.id}">${p.code} — ${p.nom}</option>`).join('')}
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
          <button class="btn-ghost" id="g-next">▶</button>
          <button class="btn-ghost" id="g-today">Aujourd'hui</button>
          <label class="small"><input type="checkbox" id="g-deps" ${st.showDeps?'checked':''}> Dépendances</label>
          <label class="small"><input type="checkbox" id="g-crit" ${st.showCritical?'checked':''}> Chemin critique</label>
          <label class="small"><input type="checkbox" id="g-casc" ${st.autoCascade?'checked':''}> Cascade auto</label>
          <span class="spacer"></span>
          <button class="btn-ghost" id="g-csv">⤓ Exporter CSV</button>
          <button class="btn" id="g-add">+ Nouvelle tâche</button>
        </div>
        <div class="gantt-scroll"><div id="g-table"></div></div>
      </div>
    `;

    document.getElementById('g-mode').value = st.mode;
    document.getElementById('g-proj').value = st.projetFilter;
    document.getElementById('g-search').value = st.search;
    document.getElementById('g-start').value = st.rangeStart;
    document.getElementById('g-days').value = String(st.rangeDays);

    document.getElementById('g-mode').onchange = e => { st.mode = e.target.value; this.draw(); };
    document.getElementById('g-proj').onchange = e => { st.projetFilter = e.target.value; this.draw(); };
    document.getElementById('g-search').oninput = e => { st.search = e.target.value.toLowerCase(); this.draw(); };
    document.getElementById('g-start').onchange = e => { st.rangeStart = e.target.value; this.draw(); };
    document.getElementById('g-days').onchange = e => { st.rangeDays = +e.target.value; this.draw(); };
    document.getElementById('g-prev').onclick = () => { st.rangeStart = D.addDays(st.rangeStart, -14); this.draw(); };
    document.getElementById('g-next').onclick = () => { st.rangeStart = D.addDays(st.rangeStart, 14); this.draw(); };
    document.getElementById('g-today').onclick = () => { st.rangeStart = D.addDays(D.today(), -7); this.draw(); };
    document.getElementById('g-deps').onchange = e => { st.showDeps = e.target.checked; this.draw(); };
    document.getElementById('g-crit').onchange = e => { st.showCritical = e.target.checked; this.draw(); };
    document.getElementById('g-casc').onchange = e => { st.autoCascade = e.target.checked; };
    document.getElementById('g-add').onclick = () => this.openTacheForm(null);
    document.getElementById('g-csv').onclick = () => {
      const head = ['Projet','Tâche','Début','Fin','Durée j. ouvrés','Lieu','Machine','Assignés','Avancement','Jalon'];
      const rows = [head];
      DB.state.taches.slice().sort((a,b)=>a.projetId.localeCompare(b.projetId)||a.debut.localeCompare(b.debut)).forEach(t => {
        const prj = DB.projet(t.projetId);
        const lieu = DB.lieu(t.lieuId);
        const mach = DB.machine(t.machineId);
        const pers = (t.assignes||[]).map(pid => App.personneLabel(DB.personne(pid))).join(', ');
        rows.push([prj?prj.code:'', t.nom, t.debut, t.fin, D.workdaysBetween(t.debut,t.fin), lieu?lieu.nom:'', mach?mach.nom:'', pers, (t.avancement||0)+'%', t.jalon?'OUI':'']);
      });
      CSV.download('planning-' + D.today() + '.csv', rows);
      App.toast('Export CSV téléchargé','success');
    };

    this.draw();
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
    const CELL_W = 28;  // largeur jour
    const LABEL_W = 220;
    const bgRow = d => D.isWeekend(d) ? 'day-weekend' : (d === D.today() ? 'day-today' : '');

    // Header
    const headerCells = [];
    headerCells.push(`<div class="gantt-cell head label">Élément</div>`);
    for (let i=0; i<days; i++) {
      const d = D.addDays(start, i);
      const dt = D.parse(d);
      const show = i===0 || dt.getUTCDate()===1 || dt.getUTCDay()===1;
      headerCells.push(`<div class="gantt-cell head ${bgRow(d)}" style="padding:4px 2px;font-size:10px">${show ? dt.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',timeZone:'UTC'}) : ''}</div>`);
    }

    // Body rows
    const rows = [];
    groups.forEach(g => {
      // entête de groupe
      rows.push(`<div class="gantt-cell label group" style="grid-column:1/span 1">${g.label}</div>`);
      for (let i=0; i<days; i++) rows.push(`<div class="gantt-cell group ${bgRow(D.addDays(start,i))}"></div>`);

      g.items.forEach(it => {
        const t = it.tache;
        const rowCells = [`<div class="gantt-cell label" title="${t.nom}">${t.nom}</div>`];
        for (let i=0; i<days; i++) rowCells.push(`<div class="gantt-cell ${bgRow(D.addDays(start,i))}"></div>`);
        rows.push(...rowCells);

        // Placement de la barre par overlay position-absolute dans le label row : on va utiliser le premier cell de ligne comme conteneur sticky mais les barres comme éléments absolus à l'intérieur de la grille globale via un wrap. Simplification : on injecte la barre dans la 2e cellule (premier jour visible) en position absolue relative au .gantt-table.
      });
    });

    table.style.display = 'grid';
    table.style.gridTemplateColumns = `${LABEL_W}px repeat(${days}, ${CELL_W}px)`;
    table.style.position = 'relative';
    table.innerHTML = headerCells.join('') + rows.join('');

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
        const offsetDays = Math.max(0, D.diffDays(start, t.debut));
        const endDays = Math.min(days-1, D.diffDays(start, t.fin));
        if (endDays < 0 || offsetDays > days-1) { rowIdx++; return; }
        const left = LABEL_W + offsetDays * CELL_W + 2;
        const width = Math.max(CELL_W - 4, (endDays - offsetDays + 1) * CELL_W - 4);
        const top = rowIdx * 30 + 3;
        const isConflict = confPersons.has(t.id) || confMachines.has(t.id);
        const crit = isCritical(t);
        const color = prj ? prj.couleur : '#888';
        const label = t.jalon ? '' : (t.nom + ' · ' + Math.round(t.avancement) + '%');
        barPos[t.id] = { left, right: left + width, top: top + 11, mid: top + 11 };

        const cls = (isConflict?'conflict ':'') + (crit?'critical ':'');
        if (t.jalon) {
          bars.push(`<div class="gantt-bar milestone ${cls}" style="left:${left+width/2-7}px;top:${top+2}px;background:${color}" data-tid="${t.id}" title="${t.nom}"></div>`);
        } else {
          bars.push(`<div class="gantt-bar ${cls}" style="left:${left}px;width:${width}px;top:${top}px;height:22px;background:${color}" data-tid="${t.id}" title="${t.nom} — ${D.fmt(t.debut)} → ${D.fmt(t.fin)}${crit?' [critique]':''}">${label}</div>`);
        }
        rowIdx++;
      });
    });

    // Flèches de dépendances (SVG)
    let depsSvg = '';
    if (st.showDeps) {
      const totalW = LABEL_W + days * CELL_W;
      const totalH = (rowIdx + 2) * 30;
      const paths = [];
      DB.state.taches.forEach(t => {
        (t.dependances || []).forEach(depId => {
          const p1 = barPos[depId], p2 = barPos[t.id];
          if (!p1 || !p2) return;
          const crit = isCritical(t) && isCritical(DB.tache(depId));
          const x1 = p1.right, y1 = p1.mid;
          const x2 = p2.left, y2 = p2.mid;
          const midX = x2 - 8;
          const d = `M ${x1} ${y1} L ${x1+6} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
          paths.push(`<path d="${d}" class="${crit?'critical':''}" marker-end="url(#arrow)"/>`);
        });
      });
      depsSvg = `<svg class="gantt-deps" width="${totalW}" height="${totalH}" style="width:${totalW}px;height:${totalH}px">
        <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/>
        </marker></defs>
        ${paths.join('')}
      </svg>`;
    }

    const overlay = document.createElement('div');
    overlay.style.position = 'absolute'; overlay.style.inset = '0'; overlay.style.pointerEvents = 'none';
    overlay.innerHTML = depsSvg + bars.join('');
    table.appendChild(overlay);
    overlay.querySelectorAll('.gantt-bar').forEach(el => {
      el.style.pointerEvents = 'auto';
      el.addEventListener('click', () => this.openTacheForm(el.dataset.tid));
      this.makeDraggable(el, CELL_W);
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
        }
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  },

  openTacheForm(tid) {
    const isNew = !tid;
    const s = DB.state;
    const t = tid ? DB.tache(tid) : {
      id: DB.uid('T'), projetId: s.projets[0].id, nom:'', debut: D.today(), fin: D.addDays(D.today(),2),
      assignes:[], machineId:null, lieuId:null, type:'prod', avancement:0, jalon:false, dependances:[],
    };
    const body = `
      <div class="field"><label>Nom</label><input id="f-nom" value="${t.nom||''}"></div>
      <div class="row">
        <div class="field"><label>Projet</label>
          <select id="f-projet">${s.projets.map(p => `<option value="${p.id}" ${p.id===t.projetId?'selected':''}>${p.code} — ${p.nom}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Type</label>
          <select id="f-type">
            ${['etude','appro','prod','livraison','jalon'].map(x => `<option value="${x}" ${x===t.type?'selected':''}>${x}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="row">
        <div class="field"><label>Début</label><input type="date" id="f-debut" value="${t.debut}"></div>
        <div class="field"><label>Fin</label><input type="date" id="f-fin" value="${t.fin}"></div>
        <div class="field"><label>Avancement (%)</label><input type="number" id="f-avancement" min="0" max="100" value="${t.avancement||0}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Machine</label>
          <select id="f-machine"><option value="">—</option>${s.machines.map(m => `<option value="${m.id}" ${m.id===t.machineId?'selected':''}>${m.nom}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Lieu</label>
          <select id="f-lieu"><option value="">—</option>${s.lieux.map(l => `<option value="${l.id}" ${l.id===t.lieuId?'selected':''}>${l.nom}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field"><label>Assignés (multi-sélection, Ctrl/Cmd)</label>
        <select id="f-assignes" multiple size="6">
          ${s.personnes.map(p => `<option value="${p.id}" ${(t.assignes||[]).includes(p.id)?'selected':''}>${App.personneLabel(p)} · ${p.role}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Dépendances (tâches dont celle-ci dépend)</label>
        <select id="f-deps" multiple size="5">
          ${s.taches.filter(x => x.id !== t.id && x.projetId === t.projetId).sort((a,b)=>a.debut.localeCompare(b.debut)).map(x => `<option value="${x.id}" ${(t.dependances||[]).includes(x.id)?'selected':''}>${x.nom} · ${D.fmt(x.debut)}→${D.fmt(x.fin)}</option>`).join('')}
        </select>
      </div>
      <label class="small"><input type="checkbox" id="f-jalon" ${t.jalon?'checked':''}> Jalon</label>
    `;
    const foot = `
      ${!isNew ? '<button class="btn btn-danger" id="f-del">Supprimer</button>' : ''}
      <span class="spacer" style="flex:1"></span>
      <button class="btn btn-secondary" id="f-cancel">Annuler</button>
      <button class="btn" id="f-save">${isNew?'Créer':'Enregistrer'}</button>
    `;
    App.openModal(isNew ? 'Nouvelle tâche' : 'Tâche — ' + t.nom, body, foot);

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
      t.assignes = Array.from(document.getElementById('f-assignes').selectedOptions).map(o => o.value);
      t.jalon = document.getElementById('f-jalon').checked;
      t.dependances = Array.from(document.getElementById('f-deps').selectedOptions).map(o => o.value);
      if (!t.nom) { App.toast('Nom requis','error'); return; }
      if (isNew) DB.state.taches.push(t);
      DB.save(); App.closeModal(); App.toast('Enregistré','success'); App.refresh();
    };
    if (!isNew) {
      document.getElementById('f-del').onclick = () => {
        if (!confirm('Supprimer cette tâche ?')) return;
        DB.state.taches = DB.state.taches.filter(x => x.id !== t.id);
        DB.save(); App.closeModal(); App.toast('Tâche supprimée','info'); App.refresh();
      };
    }
  },
};
