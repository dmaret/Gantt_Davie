App.views.kanban = {
  state: { projetFilter: '', search: '' },

  newItem() {
    if (App.views.gantt) App.views.gantt.openTacheForm(null);
  },

  render(root) {
    const s = DB.state;
    root.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:14px 20px 10px;flex-wrap:wrap;border-bottom:1px solid var(--border);background:var(--surface);">
        <strong style="font-size:15px;margin-right:4px;">Kanban</strong>
        <select id="kb-proj-filter" style="padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px;">
          ${App.projetsOptions(this.state.projetFilter||'', 'Tous les projets')}
        </select>
        <input id="kb-search" type="search" placeholder="Rechercher une tâche…"
          style="padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px;min-width:180px;"
          value="${this.state.search}">
        <button id="kb-new" class="btn" data-perm="edit"
          style="margin-left:auto;">+ Nouvelle tâche</button>
      </div>
      <div id="kb-board" style="display:flex;flex-direction:row;gap:14px;padding:16px 20px;overflow-x:auto;flex:1;min-height:0;align-items:flex-start;"></div>
    `;

    const projSel = root.querySelector('#kb-proj-filter');
    projSel.value = this.state.projetFilter;
    projSel.onchange = () => { this.state.projetFilter = projSel.value; this.draw(); };

    const searchEl = root.querySelector('#kb-search');
    searchEl.oninput = () => { this.state.search = searchEl.value; this.draw(); };

    root.querySelector('#kb-new').onclick = () => this.newItem();

    this.draw();
  },

  draw() {
    const board = document.getElementById('kb-board');
    if (!board) return;
    const s = DB.state;
    const today = D.today();
    const q = this.state.search.trim().toLowerCase();

    const taches = s.taches.filter(t => {
      if (this.state.projetFilter && t.projetId !== this.state.projetFilter) return false;
      if (q && !t.nom.toLowerCase().includes(q)) return false;
      return true;
    });

    const cols = [
      {
        id: 'a-demarrer',
        label: 'À démarrer',
        color: '#2563eb',
        bg: '#eff6ff',
        filter: t => t.avancement === 0 && t.fin >= today,
        drop: null,
      },
      {
        id: 'en-cours',
        label: 'En cours',
        color: '#b45309',
        bg: '#fffbeb',
        filter: t => t.avancement > 0 && t.avancement < 100,
        drop: 'en-cours',
      },
      {
        id: 'en-retard',
        label: 'En retard',
        color: '#dc2626',
        bg: '#fef2f2',
        filter: t => t.fin < today && t.avancement < 100,
        drop: 'en-retard',
      },
      {
        id: 'termine',
        label: 'Terminé',
        color: '#16a34a',
        bg: '#f0fdf4',
        filter: t => t.avancement === 100,
        drop: 'termine',
      },
    ];

    if (!DB.state.taches.length) {
      board.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text-muted);width:100%">
        <div style="font-size:48px;margin-bottom:12px">📋</div>
        <strong style="font-size:16px;color:var(--text);display:block;margin-bottom:6px">Aucune tâche</strong>
        <p style="margin:0 0 20px;font-size:13px">Crée une tâche depuis le Gantt pour la voir apparaître ici.</p>
        <button class="btn" onclick="App.views.kanban.newItem()">+ Créer une tâche</button>
      </div>`;
      return;
    }

    board.innerHTML = cols.map(col => {
      const items = taches.filter(col.filter);
      const cards = items.map(t => this._card(t, today)).join('');
      return `
        <div class="kb-col" data-col="${col.id}"
          style="flex:0 0 260px;min-width:220px;max-width:300px;background:${col.bg};border:1px solid var(--border);border-radius:10px;display:flex;flex-direction:column;max-height:calc(100vh - 140px);">
          <div style="padding:12px 14px 8px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${col.color};flex-shrink:0;"></span>
            <span style="font-weight:600;font-size:13px;color:${col.color};">${col.label}</span>
            <span class="badge" style="margin-left:auto;background:${col.color}22;color:${col.color};font-size:11px;">${items.length}</span>
          </div>
          <div class="kb-drop-zone" data-col="${col.id}"
            style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:8px;min-height:60px;">
            ${cards}
          </div>
        </div>
      `;
    }).join('');

    board.querySelectorAll('.kb-drop-zone').forEach(zone => {
      zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.style.outline = '2px dashed var(--primary)';
      });
      zone.addEventListener('dragleave', () => {
        zone.style.outline = '';
      });
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.style.outline = '';
        const tid = e.dataTransfer.getData('text/plain');
        if (!tid) return;
        this._handleDrop(tid, zone.dataset.col);
      });
    });

    board.querySelectorAll('.kb-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', card.dataset.tid);
        card.style.opacity = '0.5';
      });
      card.addEventListener('dragend', () => {
        card.style.opacity = '';
      });
      card.addEventListener('click', () => {
        App.navigateToTarget({ view: 'gantt', tacheId: card.dataset.tid });
      });
    });
  },

  _card(t, today) {
    const proj = DB.projet(t.projetId);
    const pColor = proj ? (proj.couleur || '#6b7280') : '#6b7280';
    const pCode  = proj ? proj.code : '—';

    const debut = t.debut ? D.fmt(t.debut) : '—';
    const fin   = t.fin   ? D.fmt(t.fin)   : '—';
    const duree = (t.debut && t.fin) ? D.workdaysBetween(t.debut, t.fin) : 0;

    const assignes = (t.assignes || []);
    const shown = assignes.slice(0, 3).map(pid => {
      const p = DB.personne(pid);
      return p
        ? `<span class="badge small" style="background:var(--primary-weak);color:var(--primary);font-size:10px;padding:1px 5px;">${App.personneLabel(p).split(' ')[0]}</span>`
        : '';
    }).join('');
    const extra = assignes.length > 3
      ? `<span class="muted small" style="font-size:10px;">+${assignes.length - 3}</span>`
      : '';

    const retard = t.fin < today && t.avancement < 100;
    const retardBadge = retard
      ? `<span title="En retard" style="color:#dc2626;font-size:12px;">⚠</span>`
      : '';

    const pct = t.avancement || 0;
    const barColor = pct === 100 ? '#16a34a' : retard ? '#dc2626' : '#2563eb';

    return `
      <div class="kb-card card" data-tid="${t.id}" draggable="true"
        style="cursor:pointer;padding:10px 12px;border-radius:8px;background:var(--surface);border:1px solid var(--border);user-select:none;transition:box-shadow .15s;"
        onmouseenter="this.style.boxShadow='0 4px 16px rgba(0,0,0,.10)'"
        onmouseleave="this.style.boxShadow=''">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
          <span class="badge small" style="background:${App.safeColor(pColor)}22;color:${App.safeColor(pColor)};font-weight:700;font-size:10px;padding:1px 6px;border-radius:4px;">${App.escapeHTML(pCode)}</span>
          ${retardBadge}
        </div>
        <div style="font-weight:600;font-size:13px;margin-bottom:5px;line-height:1.3;">${App.escapeHTML(t.nom)}</div>
        <div class="muted small" style="font-size:11px;margin-bottom:6px;">
          ${debut} → ${fin}${duree ? ` · ${duree} j.o.` : ''}
        </div>
        ${shown || extra ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px;">${shown}${extra}</div>` : ''}
        <div class="bar-inline" style="height:5px;border-radius:3px;background:var(--border);overflow:hidden;margin-top:2px;">
          <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px;transition:width .2s;"></div>
        </div>
        <div class="muted small" style="font-size:10px;text-align:right;margin-top:2px;">${pct}%</div>
      </div>
    `;
  },

  _handleDrop(tid, colId) {
    if (!App.can('edit')) { App.toast('Permission refusée', 'error'); return; }
    const t = DB.tache(tid);
    if (!t) return;

    if (colId === 'a-demarrer') {
      t.avancement = 0;
    } else if (colId === 'en-cours') {
      t.avancement = Math.max(1, t.avancement || 0);
    } else if (colId === 'termine') {
      t.avancement = 100;
    } else {
      return;
    }

    DB.logAudit('update', 'tache', t.id, `avancement=${t.avancement} via kanban`);
    DB.save();
    this.draw();
  },
};
