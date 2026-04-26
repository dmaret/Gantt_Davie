// Vue Flux atelier — schéma visuel machines connectées par dépendances de tâches
App.views.flux = {
  state: { projet: '', lieu: '', editMode: false },

  render(root) {
    const s = DB.state;
    if (!s.fluxLayout) s.fluxLayout = {};
    const machines = this._filtered();

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
          <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;user-select:none">
            <input type="checkbox" id="fx-edit" ${this.state.editMode?'checked':''}> Déplacer blocs
          </label>
          <button class="btn-ghost" id="fx-auto" title="Réorganiser en grille automatique">⚡ Auto</button>
          ${App.can('edit') ? `<button class="btn-ghost" id="fx-save">💾 Sauver</button>` : ''}
        </div>
        <div class="flux-body">
          <div class="flux-sidebar" id="fx-sidebar">${this._sidebar(machines)}</div>
          <div class="flux-canvas" id="fx-canvas">
            <svg id="fx-svg" style="position:absolute;top:0;left:0;width:2400px;height:1600px;pointer-events:none;z-index:2" viewBox="0 0 2400 1600"></svg>
            <div id="fx-blocks" style="position:absolute;top:0;left:0;width:2400px;height:1600px;z-index:3">
              ${this._blocks(machines)}
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('fx-proj').onchange = e => { this.state.projet = e.target.value; this.render(root); };
    document.getElementById('fx-lieu').onchange = e => { this.state.lieu = e.target.value; this.render(root); };
    document.getElementById('fx-edit').onchange = e => { this.state.editMode = e.target.checked; this.render(root); };
    document.getElementById('fx-auto').onclick = () => { this._autoLayout(machines); this.render(root); };
    const sv = document.getElementById('fx-save');
    if (sv) sv.onclick = () => { DB.save(); App.toast('Disposition sauvegardée', 'success'); };

    if (!this.state.editMode) {
      root.querySelectorAll('.fx-block').forEach(el => {
        el.onclick = () => this._openPanel(el.dataset.mid);
      });
    }

    this._drawArrows();
    if (this.state.editMode) this._setupDrag(root);
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
    if (running.length > 1) return { code:'surcharge', label:'Surchargé',  color:'#dc2626', tasks: running };
    if (late.length)         return { code:'retard',    label:'En retard',  color:'#f59e0b', tasks: late    };
    if (running.length)      return { code:'actif',     label:'En cours',   color:'#2c5fb3', tasks: running };
    return                          { code:'libre',     label:'Libre',      color:'#059669', tasks: []      };
  },

  _blocks(machines) {
    const layout = DB.state.fluxLayout;
    const cols = Math.max(1, Math.ceil(Math.sqrt(machines.length || 1)));
    machines.forEach((m, i) => {
      if (!layout[m.id]) {
        layout[m.id] = { x: 40 + (i % cols) * 230, y: 40 + Math.floor(i / cols) * 180 };
      }
    });

    return machines.map(m => {
      const pos = layout[m.id];
      const st  = this._status(m.id);
      const lieu = (DB.state.lieux || []).find(l => l.id === m.lieuId);
      const task = st.tasks[0];
      return `<div class="fx-block${this.state.editMode ? ' fx-draggable' : ''}" data-mid="${m.id}"
          style="left:${pos.x}px;top:${pos.y}px;border-top:3px solid ${st.color}">
        <div class="fx-block-name">${m.nom}</div>
        ${lieu ? `<div class="fx-block-lieu">${lieu.nom}</div>` : ''}
        <div class="fx-block-status" style="color:${st.color}">● ${st.label}${st.code==='surcharge'?' ('+st.tasks.length+')':''}</div>
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
