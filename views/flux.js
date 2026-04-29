// Vue Flux atelier — schéma visuel machines connectées par dépendances de tâches
App.views.flux = {
  state: { projet: '', lieu: '', editMode: false, viewMode: 'canvas', zoom: '20j', canvasStyle: 'normal',
    heatmap: false, traceMode: false, simDay: null, simPlaying: false, showBottleneck: false },
  _simTimer: null,
  _ZOOM_PRESETS: {
    '10j': { label: '10 j', pxDay: 55, BACK: 2, FWD:  8 },
    '20j': { label: '20 j', pxDay: 40, BACK: 3, FWD: 17 },
    '30j': { label: '30 j', pxDay: 28, BACK: 3, FWD: 27 },
  },

  render(root) {
    if (this._simTimer) { clearInterval(this._simTimer); this._simTimer = null; }
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
      <select id="fx-cstyle" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);">
        <option value="normal" ${(this.state.canvasStyle||'normal')==='normal'?'selected':''}>🗺 Normal</option>
        <option value="blueprint" ${this.state.canvasStyle==='blueprint'?'selected':''}>📐 Blueprint</option>
        <option value="plan" ${this.state.canvasStyle==='plan'?'selected':''}>🏭 Plan atelier</option>
      </select>
      <span style="border-left:1px solid var(--border);margin:0 4px;height:20px;display:inline-block"></span>
      <button class="btn-ghost${this.state.heatmap?' fx-view-active':''}" id="fx-heat" title="Heatmap charge 5 j ouvrés">🌡 Charge</button>
      <button class="btn-ghost${this.state.showBottleneck?' fx-view-active':''}" id="fx-bottle" title="Identifier le goulot d'étranglement">🚨 Goulot</button>
      <button class="btn-ghost${this.state.traceMode?' fx-view-active':''}" id="fx-trace" title="Tracer le fil d'une pièce (sélectionner un projet d'abord)">🔍 Tracer</button>
      <button class="btn-ghost${this.state.simPlaying?' fx-view-active':''}" id="fx-sim" title="Simuler l'avancement dans le temps">${this.state.simPlaying?'⏸':'▶'} Sim</button>
      ${this.state.simDay?`<span class="muted small" id="fx-simday" style="font-weight:600;color:#dc2626">📅 ${D.fmt(this.state.simDay)}</span>`:''}
    ` : '';

    const swimZoom = this.state.viewMode === 'swimlanes' ? `
      <div style="display:flex;gap:2px;margin-left:6px;border-left:1px solid var(--border);padding-left:8px;">
        ${Object.entries(this._ZOOM_PRESETS).map(([k, p]) =>
          `<button class="btn-ghost fx-view-btn${this.state.zoom === k ? ' fx-view-active' : ''}" data-fxzoom="${k}" style="font-size:11px;padding:3px 8px;">${p.label}</button>`
        ).join('')}
      </div>
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
          ${canvasControls}${swimZoom}
        </div>
        <div class="flux-body">
          <div class="flux-sidebar" id="fx-sidebar">${this._sidebar(machines)}</div>
          <div class="flux-canvas fx-bg-${this.state.canvasStyle||'normal'}" id="fx-canvas">
            ${this._renderBody(machines)}
          </div>
        </div>
      </div>
    `;

    root.querySelectorAll('[data-fxview]').forEach(b => {
      b.onclick = () => { this.state.viewMode = b.dataset.fxview; this.state.editMode = false; this.render(root); };
    });
    root.querySelectorAll('[data-fxzoom]').forEach(b => {
      b.onclick = () => { this.state.zoom = b.dataset.fxzoom; this.render(root); };
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
      const styleEl = document.getElementById('fx-cstyle');
      if (styleEl) styleEl.onchange = e => { this.state.canvasStyle = e.target.value; this.render(root); };
      const heatEl = document.getElementById('fx-heat');
      if (heatEl) heatEl.onclick = () => { this.state.heatmap = !this.state.heatmap; this.render(root); };
      const bottleEl = document.getElementById('fx-bottle');
      if (bottleEl) bottleEl.onclick = () => { this.state.showBottleneck = !this.state.showBottleneck; this.render(root); };
      const traceEl = document.getElementById('fx-trace');
      if (traceEl) traceEl.onclick = () => {
        if (!this.state.projet) { App.toast("Sélectionne d'abord un projet pour tracer son fil",'info'); return; }
        this.state.traceMode = !this.state.traceMode; this.render(root);
      };
      const simEl = document.getElementById('fx-sim');
      if (simEl) simEl.onclick = () => this._toggleSim(root, machines);

      if (!this.state.editMode) {
        root.querySelectorAll('.fx-block').forEach(el => {
          el.onclick = () => this._openPanel(el.dataset.mid);
        });
        this._setupHover(machines);
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
    const { pxDay, BACK, FWD } = this._ZOOM_PRESETS[this.state.zoom] || this._ZOOM_PRESETS['3w'];
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
        const showLabel = pxDay >= 14;
        return `
          <div style="position:absolute;left:${x}px;top:4px;width:${w}px;height:calc(100% - 8px);
            background:${bc}20;border:1.5px solid ${bc}99;border-radius:5px;overflow:hidden;
            cursor:pointer;box-sizing:border-box;display:flex;align-items:center;"
            onclick="App.navigateToTarget({view:'gantt',tacheId:'${t.id}'});"
            title="${t.nom}${proj?' · '+proj.code:''} (${D.fmt(t.debut)}→${D.fmt(t.fin)}) — ${pct}%">
            <div style="position:absolute;bottom:0;left:0;height:3px;width:${pct}%;background:${bc};"></div>
            ${showLabel ? `<div style="padding:0 5px;font-size:10px;font-weight:600;color:${bc};
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;">
              ${proj ? `<span style="opacity:.65;font-size:9px;">${proj.code}</span> ` : ''}${t.nom}
            </div>` : ''}
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
    const today = this.state.simDay || D.today();
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
    const cs = this.state.canvasStyle || 'normal';
    const typeIcon = m => {
      const n = (m.nom||'').toLowerCase();
      if (n.includes('cnc')) return '⚙';
      if (n.includes('laser')) return '⚡';
      if (n.includes('presse') || n.includes('plieuse')) return '📐';
      if (n.includes('soudure') || n.includes('soud')) return '🔥';
      if (n.includes('peinture') || n.includes('peintr')) return '🖌';
      if (n.includes('montage') || n.includes('assembl')) return '🔩';
      return '🔧';
    };
    const bottleneckId = this.state.showBottleneck ? this._findBottleneck(machines) : null;
    const trace = (this.state.traceMode && this.state.projet) ? this._traceOrder(this.state.projet) : null;
    return machines.map((m, idx) => {
      const pos = layout[m.id];
      const st  = this._status(m.id);
      const lieu = (DB.state.lieux || []).find(l => l.id === m.lieuId);
      const task = st.tasks[0];
      const badgeColor = st.code === 'libre' ? '#6b7280' : st.color;
      const iconHtml = cs !== 'normal' ? `<div class="fx-type-icon">${typeIcon(m)}</div>` : '';
      let borderColor = st.color;
      if (this.state.heatmap) {
        const loads = this._computeLoad(m.id);
        borderColor = this._heatColor(loads);
      }
      const isBottleneck = bottleneckId === m.id;
      let opacity = '1';
      let traceBadge = '';
      if (trace) {
        const step = trace[m.id];
        if (step) {
          traceBadge = `<div class="fx-trace-step" style="position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;background:#7c3aed;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(124,58,237,.5);z-index:2">${step}</div>`;
        } else {
          opacity = '0.25';
        }
      }
      const goulotBadge = isBottleneck ? `<div class="fx-goulot-badge">⚠ GOULOT</div>` : '';
      const extraBorder = isBottleneck ? 'box-shadow:0 0 0 3px #dc262644, 0 4px 12px rgba(220,38,38,.3);' : '';
      return `<div class="fx-block fx-block-${cs}${this.state.editMode ? ' fx-draggable' : ''}" data-mid="${m.id}"
          style="left:${pos.x}px;top:${pos.y}px;border-top:3px solid ${borderColor};opacity:${opacity};${extraBorder}">
        <div class="fx-badge-num" style="background:${badgeColor}">${idx+1}</div>
        ${traceBadge}
        ${goulotBadge}
        ${iconHtml}
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
    const taches = DB.state.taches || [];
    const today  = this.state.simDay || D.today();
    const BW = 160, BH = 95;
    const cs = this.state.canvasStyle || 'normal';
    const machines = this._filtered();
    const bottleneckId = this.state.showBottleneck ? this._findBottleneck(machines) : null;
    const trace = (this.state.traceMode && this.state.projet) ? this._traceOrder(this.state.projet) : null;

    const conns = new Map();
    taches.filter(t => !this.state.projet || t.projetId === this.state.projet).forEach(t => {
      if (!t.machineId) return;
      (t.dependances || []).forEach(depId => {
        const dep = taches.find(x => x.id === depId);
        if (!dep || !dep.machineId || dep.machineId === t.machineId) return;
        const key = dep.machineId + '->' + t.machineId;
        const ex  = conns.get(key) || { from: dep.machineId, to: t.machineId, active: false, retard: false, projetIds: new Set() };
        if (t.debut <= today && t.fin >= today && t.avancement < 100) ex.active = true;
        if (t.fin < today && t.avancement < 100) ex.retard = true;
        ex.projetIds.add(t.projetId);
        conns.set(key, ex);
      });
    });

    const roughFilter = cs === 'plan' ? `
      <filter id="fx-rough" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="turbulence" baseFrequency="0.04" numOctaves="2" seed="3" result="noise"/>
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G"/>
      </filter>` : '';

    const filterAttr = cs === 'plan' ? 'filter="url(#fx-rough)"' : '';

    svg.innerHTML = `<defs>
      ${roughFilter}
      <filter id="fx-glow-active" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="fx-glow-retard" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="fx-glow-bottleneck" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="fx-glow-trace" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <linearGradient id="fx-grad-active" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:#2563eb;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#60a5fa;stop-opacity:1" />
      </linearGradient>
      <linearGradient id="fx-grad-retard" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:#f59e0b;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#fbbf24;stop-opacity:1" />
      </linearGradient>
      <linearGradient id="fx-grad-bottleneck" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:#dc2626;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#ef4444;stop-opacity:1" />
      </linearGradient>
      <linearGradient id="fx-grad-trace" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:#7c3aed;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#a78bfa;stop-opacity:1" />
      </linearGradient>
      <marker id="fxarr-active" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
        <polygon points="0 0, 9 3.5, 0 7" fill="#2563eb"/>
      </marker>
      <marker id="fxarr-retard" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
        <polygon points="0 0, 9 3.5, 0 7" fill="#f59e0b"/>
      </marker>
      <marker id="fxarr-idle" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
        <polygon points="0 0, 9 3.5, 0 7" fill="#9ca3af"/>
      </marker>
      <marker id="fxarr-trace" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
        <polygon points="0 0, 9 3.5, 0 7" fill="#7c3aed"/>
      </marker>
      <marker id="fxarr-bottleneck" markerWidth="11" markerHeight="9" refX="10" refY="4.5" orient="auto">
        <polygon points="0 0, 11 4.5, 0 9" fill="#dc2626"/>
      </marker>
      <style>
        @keyframes fxflow { to { stroke-dashoffset: -40; } }
        @keyframes fxflow-fast { to { stroke-dashoffset: -28; } }
        @keyframes fxflow-pulse { 0% { opacity: 0.9; } 50% { opacity: 1; } 100% { opacity: 0.9; } }
      </style>
    </defs>
    ${[...conns.values()].map(c => {
      const fp = layout[c.from], tp = layout[c.to];
      if (!fp || !tp) return '';
      const x1 = fp.x + BW, y1 = fp.y + BH / 2;
      const x2 = tp.x,      y2 = tp.y + BH / 2;
      const bend = Math.abs(x2 - x1) * 0.45 + 30;
      const d = `M${x1},${y1} C${x1+bend},${y1} ${x2-bend},${y2} ${x2},${y2}`;
      // Trace mode : ne dessine que les connexions du projet tracé, en violet vif
      if (trace) {
        if (!c.projetIds.has(this.state.projet)) {
          return `<path d="${d}" fill="none" stroke="#9ca3af" stroke-width="1" stroke-dasharray="3,4" opacity="0.15"/>`;
        }
        return `<path d="${d}" fill="none" stroke="url(#fx-grad-trace)" stroke-width="4.5"
          stroke-dasharray="14,5" marker-end="url(#fxarr-trace)" filter="url(#fx-glow-trace)" ${filterAttr}
          style="animation:fxflow 1.2s linear infinite"/>
          <path d="${d}" fill="none" stroke="#7c3aed" stroke-width="1.5" opacity="0.25" ${filterAttr}/>`;
      }
      // Bottleneck : flèches arrivant vers le goulot en rouge épais
      const isToBottleneck = bottleneckId && c.to === bottleneckId;
      if (isToBottleneck) {
        return `<path d="${d}" fill="none" stroke="url(#fx-grad-bottleneck)" stroke-width="5.5"
          stroke-dasharray="12,5" marker-end="url(#fxarr-bottleneck)" filter="url(#fx-glow-bottleneck)" ${filterAttr}
          style="animation:fxflow-fast .7s linear infinite;opacity:1"/>
          <path d="${d}" fill="none" stroke="#dc2626" stroke-width="1.5" opacity="0.25" ${filterAttr}/>`;
      }
      if (c.retard) {
        return `<path d="${d}" fill="none" stroke="url(#fx-grad-retard)" stroke-width="3.5"
          stroke-dasharray="10,5" marker-end="url(#fxarr-retard)" filter="url(#fx-glow-retard)" ${filterAttr}
          style="animation:fxflow-fast .8s linear infinite"/>
          <path d="${d}" fill="none" stroke="#f59e0b" stroke-width="1" opacity="0.2" ${filterAttr}/>`;
      } else if (c.active) {
        return `<path d="${d}" fill="none" stroke="url(#fx-grad-active)" stroke-width="3.5"
          stroke-dasharray="12,5" marker-end="url(#fxarr-active)" filter="url(#fx-glow-active)" ${filterAttr}
          style="animation:fxflow 1.4s linear infinite"/>
          <path d="${d}" fill="none" stroke="#2563eb" stroke-width="1" opacity="0.15" ${filterAttr}/>`;
      } else {
        return `<path d="${d}" fill="none" stroke="#9ca3af" stroke-width="2"
          stroke-dasharray="6,4" marker-end="url(#fxarr-idle)" opacity="0.55" ${filterAttr}/>`;
      }
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

    const otherMachines = (DB.state.machines||[]).filter(x => x.id !== mid);
    const transferUI = (t) => {
      if (!App.can('edit')) return '';
      return `<button class="btn-ghost small fx-transfer-btn" data-tid="${t.id}" title="Transférer cette tâche vers une autre machine" style="padding:1px 7px;font-size:12px;">⇄</button>
        <div id="fx-transfer-sel-${t.id}" style="display:none;gap:5px;align-items:center;margin-top:5px;flex-wrap:wrap">
          <select id="fx-transfer-mid-${t.id}" style="font-size:11px;padding:3px 6px;flex:1;min-width:140px">
            ${otherMachines.map(x => `<option value="${x.id}">${x.nom}</option>`).join('')}
          </select>
          <button class="btn small fx-transfer-ok" data-tid="${t.id}" style="padding:2px 10px;font-size:11px">OK</button>
        </div>`;
    };
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
              <div style="display:flex;justify-content:space-between;align-items:start;gap:6px">
                <div style="flex:1">
                  <div style="font-weight:600">${t.nom}</div>
                  <div class="muted small">${proj ? proj.code+' · ' : ''}${D.fmt(t.debut)} → ${D.fmt(t.fin)}</div>
                </div>
                ${transferUI(t)}
              </div>
              <div style="height:4px;background:var(--border);border-radius:2px;margin-top:6px">
                <div style="height:100%;width:${t.avancement||0}%;background:var(--primary);border-radius:2px"></div>
              </div>
              <div class="muted small" style="text-align:right;margin-top:2px">${t.avancement||0}%</div>
            </div>`;
          }).join('') : '<p class="muted small">Aucune tâche active</p>'}
        </div>
        ${upcoming.length ? `<div style="margin-bottom:12px">
          <div class="muted small" style="font-weight:600;margin-bottom:6px">Prochaines tâches</div>
          ${upcoming.map(t => `<div style="padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${t.nom}</span>
              <span class="muted" style="flex-shrink:0">${D.fmt(t.debut)}</span>
              ${transferUI(t)}
            </div>
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
    // Wire up transfer buttons
    document.querySelectorAll('.fx-transfer-btn').forEach(btn => {
      btn.onclick = () => {
        const tid = btn.dataset.tid;
        const sel = document.getElementById('fx-transfer-sel-'+tid);
        if (sel.style.display === 'none' || !sel.style.display) {
          sel.style.display = 'flex';
          btn.textContent = '✕';
        } else {
          sel.style.display = 'none';
          btn.textContent = '⇄';
        }
      };
    });
    document.querySelectorAll('.fx-transfer-ok').forEach(btn => {
      btn.onclick = () => {
        if (!App.can('edit')) { App.toast('Lecture seule','error'); return; }
        const tid = btn.dataset.tid;
        const newMid = document.getElementById('fx-transfer-mid-'+tid).value;
        if (!newMid) return;
        const t = DB.tache(tid);
        if (!t) return;
        const oldMachine = DB.machine(t.machineId);
        const newMachine = DB.machine(newMid);
        t.machineId = newMid;
        DB.logAudit('update','tache',tid,`Transfert ${oldMachine?.nom||'?'} → ${newMachine?.nom||'?'}`);
        DB.save();
        App.toast(`Tâche transférée vers ${newMachine?.nom||''}`,'success');
        App.closeModal();
        App.refresh();
      };
    });
  },

  // === Heatmap charge ===
  _computeLoad(machineId) {
    const today = this.state.simDay || D.today();
    const days = Array.from({length:5}, (_, i) => D.addWorkdays(today, i));
    return days.map(d =>
      (DB.state.taches||[]).some(t => t.machineId === machineId && t.debut <= d && t.fin >= d && t.avancement < 100)
    );
  },
  _heatColor(loads) {
    const n = loads.filter(Boolean).length;
    if (n === 0) return '#059669';
    if (n === 1) return '#84cc16';
    if (n === 2) return '#facc15';
    if (n === 3) return '#f59e0b';
    if (n === 4) return '#f97316';
    return '#dc2626';
  },

  // === Goulot d'étranglement ===
  _findBottleneck(machines) {
    const today = this.state.simDay || D.today();
    let maxLoad = 0, bottleneckId = null;
    machines.forEach(m => {
      const queue = (DB.state.taches||[]).filter(t =>
        t.machineId === m.id && t.avancement < 100 && t.fin >= today &&
        (!this.state.projet || t.projetId === this.state.projet)
      );
      const totalDays = queue.reduce((n, t) => n + Math.max(1, D.workdaysBetween(t.debut, t.fin)), 0);
      if (totalDays > maxLoad) { maxLoad = totalDays; bottleneckId = m.id; }
    });
    return maxLoad >= 3 ? bottleneckId : null;
  },

  // === Fil d'Ariane (trace project order) ===
  _traceOrder(projetId) {
    const tasks = (DB.state.taches||[]).filter(t => t.projetId === projetId && t.machineId);
    const order = {};
    let step = 1;
    const visited = new Set();
    const visit = (t) => {
      if (visited.has(t.id)) return;
      visited.add(t.id);
      (t.dependances||[]).forEach(depId => {
        const dep = tasks.find(x => x.id === depId);
        if (dep) visit(dep);
      });
      if (t.machineId && !order[t.machineId]) {
        order[t.machineId] = step++;
      }
    };
    tasks.slice().sort((a,b) => a.debut.localeCompare(b.debut)).forEach(visit);
    return order;
  },

  // === Simulation temps réel ===
  _toggleSim(root, machines) {
    if (this.state.simPlaying) {
      if (this._simTimer) { clearInterval(this._simTimer); this._simTimer = null; }
      this.state.simPlaying = false;
      this.state.simDay = null;
      this.render(root);
      return;
    }
    this.state.simDay = this.state.simDay || D.today();
    this.state.simPlaying = true;
    this.render(root);
    this._simTimer = setInterval(() => {
      this.state.simDay = D.addWorkdays(this.state.simDay, 1);
      const blocksEl = document.getElementById('fx-blocks');
      if (blocksEl) blocksEl.innerHTML = this._blocks(machines);
      this._drawArrows();
      const simDayEl = document.getElementById('fx-simday');
      if (simDayEl) simDayEl.textContent = '📅 ' + D.fmt(this.state.simDay);
      this._setupHover(machines);
      // Re-bind block clicks
      if (!this.state.editMode) {
        document.querySelectorAll('.fx-block').forEach(el => {
          el.onclick = () => this._openPanel(el.dataset.mid);
        });
      }
      // Stop after 6 months
      if (this.state.simDay > D.addDays(D.today(), 180)) {
        if (this._simTimer) { clearInterval(this._simTimer); this._simTimer = null; }
        this.state.simPlaying = false;
        App.toast('Simulation terminée','info');
        this.render(root);
      }
    }, 800);
  },

  // === Mini-Gantt tooltip on hover ===
  _setupHover(machines) {
    let tt = document.getElementById('fx-tt');
    if (!tt) {
      tt = document.createElement('div');
      tt.id = 'fx-tt';
      tt.className = 'fx-tt';
      document.body.appendChild(tt);
    }
    document.querySelectorAll('.fx-block').forEach(el => {
      el.addEventListener('mouseenter', () => {
        if (this.state.editMode) return;
        const mid = el.dataset.mid;
        const m = (DB.state.machines||[]).find(x => x.id === mid);
        if (!m) return;
        const refDay = this.state.simDay || D.today();
        const days = Array.from({length:10}, (_, i) => D.addWorkdays(refDay, i - 2));
        const tasks = (DB.state.taches||[]).filter(t =>
          t.machineId === mid &&
          t.fin >= days[0] && t.debut <= days[days.length-1] &&
          t.avancement < 100
        ).slice(0, 5);
        const bars = days.map(d => {
          const task = tasks.find(t => t.debut <= d && t.fin >= d);
          const proj = task ? DB.projet(task.projetId) : null;
          const color = proj?.couleur || (task ? '#6b7280' : null);
          const isToday = d === refDay;
          const fill = task ? `background:${color}66;border:1px solid ${color}` : 'background:var(--border);';
          const todayMark = isToday ? 'outline:2px solid #ef4444;outline-offset:-1px;' : '';
          const tip = task ? `${task.nom} · ${D.fmt(d)}` : D.fmt(d);
          return `<div class="fx-mini-bar-cell" style="${fill};${todayMark}" title="${tip}">
            ${task && task.avancement ? `<div style="position:absolute;bottom:0;left:0;right:0;height:${task.avancement}%;background:${color};opacity:.45;"></div>` : ''}
          </div>`;
        }).join('');
        const dayLabels = days.map(d => {
          const isToday = d === refDay;
          return `<div class="fx-mini-day" style="${isToday?'color:#ef4444;font-weight:700':''}">${D.fmt(d).slice(0,5)}</div>`;
        }).join('');
        const loads = this._computeLoad(mid);
        const loadPct = Math.round(loads.filter(Boolean).length / loads.length * 100);
        tt.innerHTML = `
          <div style="font-weight:700;margin-bottom:4px">${m.nom}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">Charge 5 j : <strong style="color:${this._heatColor(loads)}">${loadPct}%</strong> · ${tasks.length} tâche(s) à venir</div>
          <div class="fx-mini-bar">${bars}</div>
          <div class="fx-mini-bar" style="margin-bottom:0">${dayLabels}</div>
          ${tasks.length ? `<div style="margin-top:8px;border-top:1px solid var(--border);padding-top:6px;max-height:80px;overflow-y:auto">
            ${tasks.map(t => {
              const proj = DB.projet(t.projetId);
              return `<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:2px;font-size:10px">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${proj?proj.code+' · ':''}${t.nom}</span>
                <span class="muted" style="flex-shrink:0">${D.fmt(t.debut)}→${D.fmt(t.fin)}</span>
              </div>`;
            }).join('')}
          </div>` : ''}
        `;
        tt.style.display = 'block';
        const rect = el.getBoundingClientRect();
        const ttW = 250;
        let left = rect.right + 10;
        let top = rect.top;
        if (left + ttW > window.innerWidth) left = rect.left - ttW - 10;
        if (left < 8) left = 8;
        if (top + 200 > window.innerHeight) top = window.innerHeight - 210;
        tt.style.left = left + 'px';
        tt.style.top = Math.max(8, top) + 'px';
      });
      el.addEventListener('mouseleave', () => {
        const ttEl = document.getElementById('fx-tt');
        if (ttEl) ttEl.style.display = 'none';
      });
    });
  },
};
