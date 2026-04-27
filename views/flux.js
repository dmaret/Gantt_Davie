// Vue Flux atelier — schéma visuel machines connectées par dépendances de tâches
App.views.flux = {
  state: { projet: '', lieu: '', editMode: false, viewMode: 'canvas' },

  render(root) {
    const s = DB.state;
    if (!s.fluxLayout) s.fluxLayout = {};
    const machines = this._filtered();

    const viewBtns = [['canvas','🗺 Canvas'],['swimlanes','🏊 Swim lanes'],['statuts','📊 Statuts']].map(([v, l]) =>
      `<button class="btn-ghost fx-view-btn${this.state.viewMode === v ? ' fx-view-active' : ''}" data-fxview="${v}">${l}</button>`
    ).join('');

    const canvasControls = this.state.viewMode === 'canvas' ? `
      <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;user-select:none">
        <input type="checkbox" id="fx-edit" ${this.state.editMode ? 'checked' : ''}> Déplacer
      </label>
      <button class="btn-ghost" id="fx-auto" title="Réorganiser en grille automatique">⚡ Auto</button>
      ${App.can('edit') ? `<button class="btn-ghost" id="fx-save">💾 Sauver</button>` : ''}
    ` : '';

    root.innerHTML = `
      <div class="flux-wrap">
        <div class="toolbar">
          <strong>🔗 Flux atelier</strong>
          <select id="fx-proj" style="max-width:220px">
            <option value="">— Tous les projets</option>
            ${(s.projets||[]).map(p => `<option value="${p.id}" ${this.state.projet===p.id?'selected':''}>${p.code} — ${p.nom}</option>`).join('')}
          </select>
          <select id="fx-lieu" style="max-width:160px">
            <option value="">— Tous les lieux</option>
            ${(s.lieux||[]).map(l => `<option value="${l.id}" ${this.state.lieu===l.id?'selected':''}>${l.nom}</option>`).join('')}
          </select>
          <span class="spacer"></span>
          <div style="display:flex;gap:2px;">${viewBtns}</div>
          ${canvasControls}
        </div>
        <div class="flux-body">
          <div class="flux-sidebar" id="fx-sidebar">${this._sidebar(machines)}</div>
          <div class="flux-canvas" id="fx-canvas">
            ${this._renderBody(machines)}
          </div>
        </div>
      </div>
    `;

    root.querySelectorAll('[data-fxview]').forEach(b => {
      b.onclick = () => { this.state.viewMode = b.dataset.fxview; this.state.editMode = false; this.render(root); };
    });

    document.getElementById('fx-proj').onchange = e => { this.state.projet = e.target.value; this.render(root); };
    document.getElementById('fx-lieu').onchange = e => { this.state.lieu = e.target.value; this.render(root); };

    if (this.state.viewMode === 'canvas') {
      const editEl = document.getElementById('fx-edit');
      if (editEl) editEl.onchange = e => { this.state.editMode = e.target.checked; this.render(root); };
      const autoEl = document.getElementById('fx-auto');
      if (autoEl) autoEl.onclick = () => { this._autoLayout(machines); this.render(root); };
      const sv = document.getElementById('fx-save');
      if (sv) sv.onclick = () => { DB.save(); App.toast('Disposition sauvegardée', 'success'); };

      if (!this.state.editMode) {
        root.querySelectorAll('.fx-block').forEach(el => {
          el.onclick = () => this._openPanel(el.dataset.mid);
        });
      }
      this._drawArrows();
      if (this.state.editMode) this._setupDrag(root);
    } else {
      root.querySelectorAll('.fx-machine-card').forEach(el => {
        el.onclick = () => this._openPanel(el.dataset.mid);
      });
    }
  },

  _renderBody(machines) {
    if (this.state.viewMode === 'swimlanes') return this._renderSwimlanes(machines);
    if (this.state.viewMode === 'statuts')   return this._renderStatuts(machines);
    // canvas — init positions if missing
    const layout = DB.state.fluxLayout;
    const cols = Math.max(1, Math.ceil(Math.sqrt(machines.length || 1)));
    machines.forEach((m, i) => {
      if (!layout[m.id]) layout[m.id] = { x: 40 + (i % cols) * 230, y: 40 + Math.floor(i / cols) * 180 };
    });
    return `
      <svg id="fx-svg" style="position:absolute;top:0;left:0;width:2400px;height:1600px;pointer-events:none;z-index:2" viewBox="0 0 2400 1600"></svg>
      <div id="fx-blocks" style="position:absolute;top:0;left:0;width:2400px;height:1600px;z-index:3">
        ${this._blocks(machines)}
      </div>
    `;
  },

  _renderSwimlanes(machines) {
    const s = DB.state;
    const today = D.today();
    const BACK = 3, FWD = 18;
    const pxDay = 40;
    const labelW = 134;

    const rangeStart = D.addWorkdays(today, -BACK);
    const nDays = BACK + 1 + FWD;
    const dates = Array.from({ length: nDays }, (_, i) => D.addWorkdays(rangeStart, i));
    const todayCol = BACK;
    const timelineW = nDays * pxDay;

    // Group by lieu
    const lieux = s.lieux || [];
    const grouped = {};
    const noLieu = [];
    machines.forEach(m => {
      if (m.lieuId) { if (!grouped[m.lieuId]) grouped[m.lieuId] = []; grouped[m.lieuId].push(m); }
      else noLieu.push(m);
    });
    const lanes = lieux.filter(l => grouped[l.id]?.length).map(l => ({ lieu: l, ms: grouped[l.id] }));
    if (noLieu.length) lanes.push({ lieu: null, ms: noLieu });
    if (!lanes.length) return '<div style="padding:40px;text-align:center;color:var(--text-muted);">Aucune machine à afficher.</div>';

    const headerHtml = dates.map((d, i) => {
      const isToday = d === today;
      return `<div style="flex:0 0 ${pxDay}px;text-align:center;font-size:9px;padding:3px 1px;
        color:${isToday ? '#ef4444' : 'var(--text-muted)'};font-weight:${isToday ? '700' : '400'};
        border-right:1px solid var(--border);box-sizing:border-box;
        background:${isToday ? '#fef2f2' : 'transparent'};">${D.fmt(d).slice(0, 5)}</div>`;
    }).join('');

    const colGrid = dates.map((d, i) =>
      `<div style="position:absolute;left:${i * pxDay}px;top:0;width:${pxDay}px;height:100%;
        ${d === today ? 'background:rgba(239,68,68,.05);' : ''}
        border-right:1px solid var(--border);box-sizing:border-box;pointer-events:none;"></div>`
    ).join('');

    const renderMachineRow = m => {
      const st = this._status(m.id);
      const tasks = s.taches.filter(t =>
        t.machineId === m.id && t.avancement < 100 &&
        t.fin >= rangeStart && t.debut <= D.addWorkdays(today, FWD)
      );
      const blocks = tasks.map(t => {
        const proj = DB.projet(t.projetId);
        const color = proj?.couleur || '#6b7280';
        const isRetard = t.fin < today;
        const bc = isRetard ? '#dc2626' : color;
        const startWd = Math.max(0, D.workdaysBetween(rangeStart, t.debut));
        const endWd   = Math.min(nDays, D.workdaysBetween(rangeStart, t.fin) + 1);
        const x = startWd * pxDay + 2;
        const w = Math.max(10, (endWd - startWd) * pxDay - 4);
        const pct = t.avancement || 0;
        return `
          <div style="position:absolute;left:${x}px;top:4px;width:${w}px;height:calc(100% - 8px);
            background:${bc}20;border:1.5px solid ${bc}99;border-radius:5px;overflow:hidden;
            cursor:pointer;box-sizing:border-box;display:flex;align-items:center;"
            onclick="if(App.views.gantt)App.views.gantt.openTacheForm('${t.id}');App.navigate('gantt');"
            title="${t.nom}${proj?' · '+proj.code:''} (${D.fmt(t.debut)}→${D.fmt(t.fin)}) — ${pct}%">
            <div style="position:absolute;bottom:0;left:0;height:3px;width:${pct}%;background:${bc};"></div>
            <div style="padding:0 5px;font-size:10px;font-weight:600;color:${bc};
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;">
              ${proj ? `<span style="opacity:.65;font-size:9px;">${proj.code}</span> ` : ''}${t.nom}
            </div>
          </div>`;
      }).join('');

      return `
        <div style="display:flex;align-items:stretch;border-bottom:1px solid var(--border);min-height:46px;">
          <div style="flex:0 0 ${labelW}px;padding:6px 10px;background:var(--surface);
            border-right:1px solid var(--border);position:sticky;left:0;z-index:2;
            display:flex;align-items:center;gap:6px;">
            <span style="width:8px;height:8px;border-radius:50%;background:${st.color};flex-shrink:0;"></span>
            <span style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.nom}</span>
          </div>
          <div style="flex:1;position:relative;min-width:${timelineW}px;background:var(--bg);">
            ${colGrid}
            <div style="position:absolute;left:${todayCol * pxDay}px;top:0;width:2px;height:100%;
              background:#ef4444;opacity:.55;z-index:4;pointer-events:none;"></div>
            <div style="position:absolute;inset:0;z-index:3;">${blocks}</div>
          </div>
        </div>`;
    };

    return `
      <div style="padding:16px;overflow:auto;width:100%;height:100%;box-sizing:border-box;">
        ${lanes.map(({ lieu, ms }) => `
          <div style="margin-bottom:18px;border:1px solid var(--border);border-radius:10px;overflow:hidden;">
            <div style="padding:8px 14px;background:var(--surface);border-bottom:1px solid var(--border);
              font-weight:600;font-size:13px;display:flex;align-items:center;gap:8px;position:sticky;left:0;">
              🏭 ${lieu ? lieu.nom : 'Sans lieu'}
              <span class="badge muted" style="font-size:11px;">${ms.length} machine${ms.length > 1 ? 's' : ''}</span>
            </div>
            <div style="display:flex;border-bottom:1px solid var(--border);position:sticky;top:0;z-index:5;background:var(--surface);">
              <div style="flex:0 0 ${labelW}px;border-right:1px solid var(--border);position:sticky;left:0;z-index:6;background:var(--surface);"></div>
              <div style="display:flex;min-width:${timelineW}px;">${headerHtml}</div>
            </div>
            ${ms.map(renderMachineRow).join('')}
          </div>
        `).join('')}
      </div>`;
  },

  _renderStatuts(machines) {
    const cols = [
      { code: 'libre',     label: 'Libre',      color: '#059669', bg: '#f0fdf4' },
      { code: 'actif',     label: 'En cours',   color: '#2c5fb3', bg: '#eff6ff' },
      { code: 'retard',    label: 'En retard',  color: '#f59e0b', bg: '#fffbeb' },
      { code: 'surcharge', label: 'Surchargé',  color: '#dc2626', bg: '#fef2f2' },
    ];
    const byStatus = {};
    cols.forEach(c => { byStatus[c.code] = []; });
    machines.forEach(m => {
      const st = this._status(m.id);
      if (byStatus[st.code]) byStatus[st.code].push({ m, st });
    });

    return `
      <div style="display:flex;flex-direction:row;gap:14px;padding:16px;overflow-x:auto;height:100%;box-sizing:border-box;align-items:flex-start;">
        ${cols.map(col => {
          const items = byStatus[col.code];
          return `
            <div style="flex:0 0 220px;min-width:200px;background:${col.bg};border:1px solid var(--border);border-radius:10px;display:flex;flex-direction:column;max-height:calc(100vh - 160px);">
              <div style="padding:10px 14px 8px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0;">
                <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${col.color};"></span>
                <span style="font-weight:600;font-size:13px;color:${col.color};">${col.label}</span>
                <span class="badge" style="margin-left:auto;background:${col.color}22;color:${col.color};font-size:11px;">${items.length}</span>
              </div>
              <div style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:8px;min-height:60px;">
                ${items.length ? items.map(({ m, st }) => {
                  const task = st.tasks[0];
                  const queue = this._queue(m.id);
                  const lieu = (DB.state.lieux||[]).find(l => l.id === m.lieuId);
                  return `
                    <div class="fx-machine-card" data-mid="${m.id}"
                      style="cursor:pointer;padding:10px 12px;border-radius:8px;background:var(--surface);border:1px solid var(--border);border-left:3px solid ${col.color};transition:box-shadow .15s;"
                      onmouseenter="this.style.boxShadow='0 4px 16px rgba(0,0,0,.10)'" onmouseleave="this.style.boxShadow=''">
                      <div style="font-weight:600;font-size:13px;margin-bottom:2px;">${m.nom}</div>
                      ${lieu ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:${task ? '6px' : '2px'};">${lieu.nom}</div>` : ''}
                      ${task ? `
                        <div style="font-size:11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px;" title="${task.nom}">${task.nom}</div>
                        <div style="height:4px;border-radius:2px;background:var(--border);overflow:hidden;">
                          <div style="height:100%;width:${task.avancement||0}%;background:${col.color};border-radius:2px;"></div>
                        </div>
                        <div style="font-size:10px;color:var(--text-muted);text-align:right;margin-top:2px;">${task.avancement||0}%</div>
                      ` : ''}
                      ${queue > 0 ? `<div style="margin-top:4px;font-size:10px;color:var(--text-muted);">📋 ${queue} en file</div>` : ''}
                    </div>
                  `;
                }).join('') : `<p class="muted small" style="text-align:center;padding:12px 0;">Aucune</p>`}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  _filtered() {
    return (DB.state.machines || []).filter(m => !this.state.lieu || m.lieuId === this.state.lieu);
  },

  _status(machineId) {
    const today = D.today();
    const taches = (DB.state.taches || []).filter(t =>
      t.machineId === machineId && (!this.state.projet || t.projetId === this.state.projet)
    );
    const running = taches.filter(t => t.debut <= today && t.fin >= today && t.avancement < 100);
    const late    = taches.filter(t => t.fin < today && t.avancement < 100);
    if (running.length > 1) return { code: 'surcharge', label: 'Surchargé',  color: '#dc2626', tasks: running };
    if (late.length)         return { code: 'retard',    label: 'En retard',  color: '#f59e0b', tasks: late    };
    if (running.length)      return { code: 'actif',     label: 'En cours',   color: '#2c5fb3', tasks: running };
    return                          { code: 'libre',     label: 'Libre',      color: '#059669', tasks: []      };
  },

  _queue(machineId) {
    const today = D.today();
    return (DB.state.taches || []).filter(t =>
      t.machineId === machineId &&
      (!this.state.projet || t.projetId === this.state.projet) &&
      t.debut > today && t.avancement < 100
    ).length;
  },

  _blocks(machines) {
    const layout = DB.state.fluxLayout;
    return machines.map(m => {
      const pos = layout[m.id];
      const st  = this._status(m.id);
      const lieu = (DB.state.lieux || []).find(l => l.id === m.lieuId);
      const task = st.tasks[0];
      return `<div class="fx-block${this.state.editMode ? ' fx-draggable' : ''}" data-mid="${m.id}"
          style="left:${pos.x}px;top:${pos.y}px;border-top:3px solid ${st.color}">
        <div class="fx-block-name">${m.nom}</div>
        ${lieu ? `<div class="fx-block-lieu">${lieu.nom}</div>` : ''}
        <div class="fx-block-status" style="color:${st.color}">● ${st.label}${st.code === 'surcharge' ? ' (' + st.tasks.length + ')' : ''}</div>
        ${task ? `
          <div class="fx-block-task" title="${task.nom}">${task.nom}</div>
          <div class="fx-bar"><div style="width:${task.avancement||0}%;background:${st.color}"></div></div>
          <div class="fx-bar-pct">${task.avancement||0}%</div>
        ` : ''}
      </div>`;
    }).join('');
  },

  _drawArrows() {
    const svg = document.getElementById('fx-svg');
    if (!svg) return;
    const layout = DB.state.fluxLayout || {};
    const taches  = DB.state.taches || [];
    const BW = 160, BH = 95;

    const conns = new Map();
    taches.filter(t => !this.state.projet || t.projetId === this.state.projet).forEach(t => {
      if (!t.machineId) return;
      (t.dependances || []).forEach(depId => {
        const dep = taches.find(x => x.id === depId);
        if (!dep || !dep.machineId || dep.machineId === t.machineId) return;
        conns.set(dep.machineId + '->' + t.machineId, { from: dep.machineId, to: t.machineId });
      });
    });

    svg.innerHTML = `<defs>
      <marker id="fxarr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
        <polygon points="0 0, 8 3, 0 6" fill="var(--primary)" opacity="0.6"/>
      </marker>
    </defs>
    ${[...conns.values()].map(c => {
      const fp = layout[c.from], tp = layout[c.to];
      if (!fp || !tp) return '';
      const x1 = fp.x + BW, y1 = fp.y + BH / 2;
      const x2 = tp.x,      y2 = tp.y + BH / 2;
      const bend = Math.abs(x2 - x1) * 0.45 + 30;
      return `<path d="M${x1},${y1} C${x1+bend},${y1} ${x2-bend},${y2} ${x2},${y2}"
        fill="none" stroke="var(--primary)" stroke-width="2" opacity="0.45"
        stroke-dasharray="8,4" marker-end="url(#fxarr)"/>`;
    }).join('')}`;
  },

  _setupDrag(root) {
    const layout = DB.state.fluxLayout;
    let drag = null, sx, sy, ox, oy;
    root.querySelectorAll('.fx-block').forEach(el => {
      el.onmousedown = e => {
        if (e.button) return;
        e.preventDefault();
        drag = el;
        sx = e.clientX; sy = e.clientY;
        const p = layout[el.dataset.mid] || { x: 0, y: 0 };
        ox = p.x; oy = p.y;
        el.style.zIndex = 99; el.style.opacity = '.85';
      };
    });
    const cv = document.getElementById('fx-canvas');
    cv.onmousemove = e => {
      if (!drag) return;
      const mid = drag.dataset.mid;
      const nx = Math.max(0, ox + e.clientX - sx);
      const ny = Math.max(0, oy + e.clientY - sy);
      layout[mid] = { x: nx, y: ny };
      drag.style.left = nx + 'px'; drag.style.top = ny + 'px';
      this._drawArrows();
    };
    cv.onmouseup = cv.onmouseleave = () => {
      if (drag) { drag.style.zIndex = ''; drag.style.opacity = ''; drag = null; }
    };
  },

  _autoLayout(machines) {
    const layout = DB.state.fluxLayout;
    const cols = Math.max(1, Math.ceil(Math.sqrt(machines.length)));
    machines.forEach((m, i) => {
      layout[m.id] = { x: 40 + (i % cols) * 230, y: 40 + Math.floor(i / cols) * 180 };
    });
  },

  _sidebar(machines) {
    const today  = D.today();
    const counts = { libre: 0, actif: 0, retard: 0, surcharge: 0 };
    machines.forEach(m => counts[this._status(m.id).code]++);

    const active = (DB.state.taches || []).filter(t =>
      t.machineId && (!this.state.projet || t.projetId === this.state.projet) &&
      t.debut <= today && t.fin >= today && t.avancement < 100
    ).slice(0, 10);

    return `
      <div class="fx-sb-title">État machines</div>
      ${[['libre','#059669','Libre'],['actif','#2c5fb3','En cours'],['retard','#f59e0b','En retard'],['surcharge','#dc2626','Surchargé']]
        .map(([k,c,l]) => `<div class="fx-leg">
          <span style="color:${c}">● ${l}</span>
          <span class="chip small">${counts[k]}</span>
        </div>`).join('')}
      ${active.length ? `
        <div class="fx-sb-title" style="margin-top:14px">Tâches actives</div>
        ${active.map(t => {
          const m = (DB.state.machines||[]).find(x => x.id === t.machineId);
          return `<div class="fx-sb-task">
            <div class="fx-sb-task-name">${t.nom}</div>
            <div class="fx-sb-task-sub">${m ? m.nom : ''} · ${t.avancement||0}%</div>
          </div>`;
        }).join('')}
      ` : ''}
    `;
  },

  _openPanel(mid) {
    const m = (DB.state.machines || []).find(x => x.id === mid);
    if (!m) return;
    const today = D.today();
    const taches = (DB.state.taches || []).filter(t =>
      t.machineId === mid && (!this.state.projet || t.projetId === this.state.projet)
    );
    const active   = taches.filter(t => t.debut <= today && t.fin >= today);
    const upcoming = taches.filter(t => t.debut > today).sort((a,b) => a.debut.localeCompare(b.debut)).slice(0, 6);
    const done     = taches.filter(t => t.avancement >= 100).length;
    const lieu     = (DB.state.lieux||[]).find(l => l.id === m.lieuId);

    const body = `
      <div style="font-size:13px">
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
          ${m.type  ? `<span class="chip">${m.type}</span>`  : ''}
          ${lieu    ? `<span class="chip">${lieu.nom}</span>` : ''}
          <span class="spacer" style="flex:1"></span>
          <div style="text-align:right">
            <div style="font-weight:700;font-size:22px;line-height:1">${active.length}</div>
            <div class="muted small">tâche(s) en cours</div>
          </div>
        </div>
        <div style="margin-bottom:12px">
          <div class="muted small" style="font-weight:600;margin-bottom:6px">En cours (${active.length})</div>
          ${active.length ? active.map(t => {
            const proj = (DB.state.projets||[]).find(p => p.id === t.projetId);
            return `<div class="card" style="padding:8px;margin-bottom:6px">
              <div style="font-weight:600">${t.nom}</div>
              <div class="muted small">${proj ? proj.code+' · ' : ''}${D.fmt(t.debut)} → ${D.fmt(t.fin)}</div>
              <div style="height:4px;background:var(--border);border-radius:2px;margin-top:6px">
                <div style="height:100%;width:${t.avancement||0}%;background:var(--primary);border-radius:2px"></div>
              </div>
              <div class="muted small" style="text-align:right;margin-top:2px">${t.avancement||0}%</div>
            </div>`;
          }).join('') : '<p class="muted small">Aucune tâche active</p>'}
        </div>
        ${upcoming.length ? `<div style="margin-bottom:12px">
          <div class="muted small" style="font-weight:600;margin-bottom:6px">Prochaines tâches</div>
          ${upcoming.map(t => `<div style="padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;display:flex;justify-content:space-between;gap:8px">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.nom}</span>
            <span class="muted" style="flex-shrink:0">${D.fmt(t.debut)}</span>
          </div>`).join('')}
        </div>` : ''}
        ${done > 0 ? `<div class="muted small">✓ ${done} tâche(s) terminée(s) sur cette machine</div>` : ''}
      </div>
    `;
    App.openModal(m.nom, body, `
      <span style="flex:1"></span>
      <button class="btn btn-secondary" onclick="App.closeModal()">Fermer</button>
      <button class="btn" onclick="App.closeModal();App.navigate('machines')">Machines →</button>
    `);
  },
};
