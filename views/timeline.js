// Vue Timeline — planning mural personnes × jours avec barres tâches
App.views.timeline = {
  state: { rangeStart: null, rangeDays: 14, lieuFilter: '', search: '' },

  render(root) {
    const st = this.state;
    const s = DB.state;
    if (!st.rangeStart) st.rangeStart = D.addDays(D.today(), -1);

    const lieuxProd = s.lieux.filter(l => l.type === 'production');

    root.innerHTML = `
      <div class="toolbar">
        <strong>Timeline</strong>
        <select id="tl-lieu">
          <option value="">Tous les lieux</option>
          ${lieuxProd.map(l => `<option value="${l.id}" ${st.lieuFilter === l.id ? 'selected' : ''}>${l.nom}</option>`).join('')}
        </select>
        <input id="tl-search" type="search" placeholder="Rechercher personne…" value="${st.search || ''}" style="width:160px">
        <button class="btn-ghost" id="tl-prev">◀</button>
        <button class="btn-ghost" id="tl-today">Aujourd'hui</button>
        <button class="btn-ghost" id="tl-next">▶</button>
        <select id="tl-range">
          <option value="7"  ${st.rangeDays === 7  ? 'selected' : ''}>1 sem</option>
          <option value="14" ${st.rangeDays === 14 ? 'selected' : ''}>2 sem</option>
          <option value="30" ${st.rangeDays === 30 ? 'selected' : ''}>1 mois</option>
        </select>
        <button class="btn-ghost" id="tl-print" title="Imprimer la timeline">⎙ Imprimer</button>
      </div>
      <div class="card" style="overflow:auto;padding:0">
        <div id="tl-grid"></div>
      </div>
    `;

    document.getElementById('tl-lieu').onchange = e => { st.lieuFilter = e.target.value; this.draw(); };
    document.getElementById('tl-search').oninput = e => { st.search = e.target.value.toLowerCase(); this.draw(); };
    document.getElementById('tl-prev').onclick = () => { st.rangeStart = D.addDays(st.rangeStart, -7); this.draw(); };
    document.getElementById('tl-today').onclick = () => { st.rangeStart = D.addDays(D.today(), -1); this.draw(); };
    document.getElementById('tl-next').onclick = () => { st.rangeStart = D.addDays(st.rangeStart, 7); this.draw(); };
    document.getElementById('tl-range').onchange = e => { st.rangeDays = +e.target.value; this.draw(); };
    document.getElementById('tl-print').onclick = () => this._printTimeline();

    this.draw();
  },

  draw() {
    const st = this.state;
    const s = DB.state;
    const start = st.rangeStart;
    const days = st.rangeDays;
    const today = D.today();

    const LABEL_W = 180;
    const CELL_W = 28;
    const ROW_H = 36;
    const BAR_H = 22;
    const BAR_TOP = 6;
    const dowLetters = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

    // Filtrer les personnes
    let personnes = s.personnes.slice();
    if (st.lieuFilter) personnes = personnes.filter(p => p.lieuPrincipalId === st.lieuFilter);
    if (st.search) personnes = personnes.filter(p => App.personneLabel(p).toLowerCase().includes(st.search));

    const gridCols = `${LABEL_W}px repeat(${days}, ${CELL_W}px)`;
    const totalW = LABEL_W + days * CELL_W;

    // --- En-tête ---
    let headerHTML = `<div style="
      position:sticky;top:0;z-index:10;
      display:grid;grid-template-columns:${gridCols};
      background:var(--surface);border-bottom:1px solid var(--border);">`;

    // Cellule "Personne"
    headerHTML += `<div style="
      padding:4px 8px;font-size:11px;font-weight:600;color:var(--text-muted);
      border-right:1px solid var(--border);display:flex;align-items:center;">Personne</div>`;

    // Cellules jours
    for (let i = 0; i < days; i++) {
      const d = D.addDays(start, i);
      const dt = D.parse(d);
      const dow = dt.getUTCDay();
      const isWE = dow === 0 || dow === 6;
      const isToday = d === today;
      const dayNum = dt.getUTCDate();
      const letter = dowLetters[dow];
      const monthShort = dt.toLocaleDateString('fr-CH', { month: 'short', timeZone: 'UTC' });

      headerHTML += `<div style="
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        font-size:10px;line-height:1.2;
        background:${isToday ? 'var(--primary)' : isWE ? 'var(--surface-2)' : 'var(--surface)'};
        color:${isToday ? '#fff' : isWE ? 'var(--text-muted)' : 'var(--text)'};
        border-right:1px solid var(--border);
        ${i === 0 ? '' : ''}">
        <span style="font-size:8px;opacity:.7">${monthShort}</span>
        <span style="font-weight:${isToday ? '700' : '500'}">${dayNum}</span>
        <span style="opacity:.75">${letter}</span>
      </div>`;
    }
    headerHTML += `</div>`;

    // --- Lignes personnes ---
    let bodyHTML = '';
    const barsData = []; // { persIdx, t, prj, offsetDays, spanDays }

    personnes.forEach((p, persIdx) => {
      const label = App.personneLabel(p);

      // Vérifier les absences pour chaque jour de la plage
      const absenceDays = new Set();
      (p.absences || []).forEach(a => {
        for (let i = 0; i < days; i++) {
          const d = D.addDays(start, i);
          if (d >= a.debut && d <= a.fin) absenceDays.add(i);
        }
      });

      // Tâches de cette personne dans la plage
      const tachesPers = s.taches.filter(t =>
        !t.jalon &&
        (t.assignes || []).includes(p.id) &&
        t.fin >= start &&
        t.debut <= D.addDays(start, days - 1)
      );

      tachesPers.forEach(t => {
        const offsetDays = D.diffDays(start, t.debut);
        const endOffset = D.diffDays(start, t.fin);
        const clampedStart = Math.max(0, offsetDays);
        const clampedEnd = Math.min(days - 1, endOffset);
        if (clampedEnd < 0 || clampedStart > days - 1) return;
        barsData.push({ persIdx, t, offsetDays: clampedStart, spanDays: clampedEnd - clampedStart + 1 });
      });

      // Grille de la ligne personne
      let rowHTML = `<div style="
        position:relative;
        display:grid;grid-template-columns:${gridCols};
        height:${ROW_H}px;
        border-bottom:1px solid var(--border);">`;

      // Cellule nom
      rowHTML += `<div style="
        padding:0 8px;display:flex;align-items:center;
        font-size:12px;font-weight:500;color:var(--text);
        border-right:1px solid var(--border);
        background:var(--surface);
        position:sticky;left:0;z-index:2;
        overflow:hidden;white-space:nowrap;text-overflow:ellipsis;" title="${label}">${label}</div>`;

      // Cellules jours
      for (let i = 0; i < days; i++) {
        const d = D.addDays(start, i);
        const dt = D.parse(d);
        const dow = dt.getUTCDay();
        const isWE = dow === 0 || dow === 6;
        const isToday = d === today;
        const isAbsent = absenceDays.has(i);

        let bg = 'transparent';
        if (isToday) bg = 'rgba(var(--primary-rgb, 59,130,246),.08)';
        else if (isAbsent) bg = 'rgba(234,88,12,.13)';
        else if (isWE) bg = 'var(--surface-2)';

        const borderLeft = isToday
          ? `border-left:2px dashed var(--primary);`
          : i > 0 ? `border-left:1px solid var(--border);` : '';

        rowHTML += `<div style="height:${ROW_H}px;background:${bg};${borderLeft}${isAbsent ? 'box-shadow:inset 0 0 0 1px rgba(234,88,12,.22);' : ''}"></div>`;
      }

      rowHTML += `</div>`;
      bodyHTML += rowHTML;
    });

    // Message vide
    if (!personnes.length) {
      bodyHTML = `<div style="padding:32px;text-align:center;color:var(--text-muted)">Aucune personne à afficher.</div>`;
    }

    // --- Overlay des barres ---
    // Les barres sont injectées après via JS direct sur le DOM pour position absolute correcte.
    const container = document.getElementById('tl-grid');
    container.innerHTML = headerHTML + `<div id="tl-body" style="position:relative;">${bodyHTML}</div>`;

    // Ajouter les barres en position absolute dans chaque ligne
    const bodyEl = document.getElementById('tl-body');
    const rows = bodyEl.querySelectorAll(':scope > div[style*="position:relative"]');

    barsData.forEach(({ persIdx, t, offsetDays, spanDays }) => {
      const prj = DB.projet(t.projetId);
      const color = (prj && prj.couleur) ? prj.couleur : '#888';
      const left = LABEL_W + offsetDays * CELL_W + 2;
      const width = Math.max(CELL_W - 4, spanDays * CELL_W - 4);
      const avPct = Math.min(100, Math.max(0, t.avancement || 0));
      const progressW = Math.round(avPct / 100 * width);
      const showLabel = width >= 40;
      const prjLabel = prj ? prj.code : '';
      const barLabel = showLabel ? (prjLabel ? `${prjLabel} · ${t.nom}` : t.nom) : '';

      const tooltip = [
        t.nom,
        prj ? `Projet : ${prj.nom}` : '',
        `Du ${D.fmt(t.debut)} au ${D.fmt(t.fin)}`,
        `Avancement : ${avPct}%`,
      ].filter(Boolean).join('\n');

      const row = rows[persIdx];
      if (!row) return;

      const bar = document.createElement('div');
      bar.style.cssText = `
        position:absolute;
        left:${left}px;
        top:${BAR_TOP}px;
        width:${width}px;
        height:${BAR_H}px;
        background:${color};
        border-radius:3px;
        cursor:pointer;
        overflow:hidden;
        display:flex;align-items:center;
        box-shadow:0 1px 3px rgba(0,0,0,.18);
        z-index:3;
      `;
      bar.title = tooltip;
      bar.setAttribute('data-tid', t.id);

      // Barre de progression
      const progress = document.createElement('div');
      progress.style.cssText = `
        position:absolute;left:0;top:0;height:100%;
        width:${progressW}px;
        background:rgba(255,255,255,.22);
        pointer-events:none;
      `;
      bar.appendChild(progress);

      // Label texte
      if (showLabel) {
        const lbl = document.createElement('span');
        lbl.style.cssText = `
          position:relative;z-index:1;
          padding:0 6px;
          font-size:10px;font-weight:500;
          color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
          text-shadow:0 1px 2px rgba(0,0,0,.35);
          pointer-events:none;
          max-width:100%;
        `;
        lbl.textContent = barLabel;
        bar.appendChild(lbl);
      }

      bar.onclick = () => App.navigateToTarget({ view: 'gantt', tacheId: t.id });

      row.appendChild(bar);
    });

    // Ligne verticale "aujourd'hui" sur tout le body (pointillés bleus)
    const todayOffset = D.diffDays(start, today);
    if (todayOffset >= 0 && todayOffset < days) {
      const todayLine = document.createElement('div');
      const todayLeft = LABEL_W + todayOffset * CELL_W + CELL_W / 2;
      todayLine.style.cssText = `
        position:absolute;
        left:${todayLeft}px;
        top:0;
        width:2px;
        height:100%;
        border-left:2px dashed var(--primary);
        opacity:.5;
        pointer-events:none;
        z-index:4;
      `;
      bodyEl.appendChild(todayLine);
    }
  },

  _printTimeline() {
    const st = this.state;
    const s = DB.state;
    const start = st.rangeStart;
    const days = st.rangeDays;
    const today = D.today();
    const end = D.addDays(start, days - 1);
    const esc = v => App.escapeHTML(String(v || ''));
    const sc = c => App.safeColor(c);
    const dowLetters = ['D','L','M','M','J','V','S'];

    let personnes = s.personnes.slice();
    if (st.lieuFilter) personnes = personnes.filter(p => p.lieuPrincipalId === st.lieuFilter);
    if (st.search) personnes = personnes.filter(p => App.personneLabel(p).toLowerCase().includes(st.search));

    const dayList = Array.from({length: days}, (_, i) => D.addDays(start, i));

    const css = `body{font-family:system-ui,sans-serif;margin:20px;font-size:11px;color:#222}h1{font-size:15px;margin:0 0 2px}.sub{color:#777;font-size:9px;margin:0 0 10px}table{width:100%;border-collapse:collapse}th,td{padding:3px 5px;border:1px solid #ddd;text-align:center;font-size:9px}th{background:#f5f5f5;font-weight:600}td.name{text-align:left;font-size:10px;font-weight:500;min-width:120px;white-space:nowrap}td.we{background:#f8f8f8;color:#ccc}td.today{background:#dbeafe}.b{display:inline-block;padding:1px 3px;border-radius:2px;font-size:8px;font-weight:600}.absent{background:#fef3c7}.leg{margin-top:8px;font-size:9px;color:#555}@media print{@page{size:A4 landscape;margin:8mm}}`;

    let body = `<h1>Timeline — ${D.fmt(start)} → ${D.fmt(end)}</h1><p class="sub">${personnes.length} personne(s) · ${days} jour(s)</p>`;
    body += `<table><thead><tr><th class="name">Personne</th>`;
    dayList.forEach(d => {
      const dt = D.parse(d);
      const dow = dt.getUTCDay();
      const isWE = dow === 0 || dow === 6;
      const isToday = d === today;
      body += `<th class="${isToday ? 'today' : isWE ? 'we' : ''}" style="min-width:28px">${dowLetters[dow]}<br>${dt.getUTCDate()}</th>`;
    });
    body += `</tr></thead><tbody>`;

    personnes.forEach(p => {
      const label = App.personneLabel(p);
      const absenceDays = new Set();
      (p.absences||[]).forEach(a => { dayList.forEach(d => { if (d >= a.debut && d <= a.fin) absenceDays.add(d); }); });
      body += `<tr><td class="name">${esc(label)}</td>`;
      dayList.forEach(d => {
        const dt = D.parse(d);
        const dow = dt.getUTCDay();
        const isWE = dow === 0 || dow === 6;
        const isToday = d === today;
        const isAbsent = absenceDays.has(d);
        const taches = s.taches.filter(t => !t.jalon && (t.assignes||[]).includes(p.id) && t.debut <= d && t.fin >= d);
        let cls = isToday ? 'today' : isWE ? 'we' : '';
        if (isAbsent) cls += ' absent';
        let content = isAbsent && !taches.length ? '🏖' : taches.map(t => {
          const prj = DB.projet(t.projetId);
          const col = sc(prj?.couleur || '#888');
          return `<div class="b" style="background:${col}22;color:${col};border-left:2px solid ${col}">${esc(prj?.code||'?')}</div>`;
        }).join('');
        body += `<td class="${cls}">${content}</td>`;
      });
      body += `</tr>`;
    });
    body += `</tbody></table>`;

    const projetIds = new Set();
    personnes.forEach(p => s.taches.filter(t => !t.jalon && (t.assignes||[]).includes(p.id) && t.debut <= end && t.fin >= start).forEach(t => { if (t.projetId) projetIds.add(t.projetId); }));
    const projetsList = [...projetIds].map(id => DB.projet(id)).filter(Boolean);
    if (projetsList.length) {
      body += `<p class="leg">${projetsList.map(p => { const col = sc(p.couleur||'#888'); return `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:8px"><span style="width:8px;height:8px;border-radius:2px;background:${col};display:inline-block"></span><strong>${esc(p.code)}</strong> ${esc(p.nom)}</span>`; }).join('')}</p>`;
    }

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Timeline</title><style>${css}</style></head><body>${body}<script>setTimeout(()=>window.print(),400)<\/script></body></html>`);
    w.document.close();
  },
};
