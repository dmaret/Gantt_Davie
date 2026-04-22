// Vue Plan 2D interactif de l'atelier
App.views.plan = {
  state: { etageFilter:'', edit:false, selectedLieu:null },

  render(root) {
    const s = DB.state;
    // Garantir positions
    s.lieux.forEach(l => { if (l.x === undefined) Object.assign(l, autoPosition(l, s.lieux)); });
    const etages = ETAGES_ORDER.filter(e => s.lieux.some(l => l.etage === e));
    const canAdmin = App.can('admin');
    root.innerHTML = `
      <div class="toolbar">
        <strong>🗺 Plan de l'atelier</strong>
        <div class="etage-pills">
          <button class="pill ${!this.state.etageFilter?'on':''}" data-etage="">Tous étages</button>
          ${etages.map(e => `<button class="pill ${this.state.etageFilter===e?'on':''}" data-etage="${e}">${e}</button>`).join('')}
        </div>
        <span class="spacer"></span>
        <span class="muted small">Charge sur 5 j. ouvrés · 🟢 ≤50% · 🟡 ≤80% · 🟠 ≤95% · 🔴 >95%</span>
        ${canAdmin ? `<label class="small"><input type="checkbox" id="plan-edit" ${this.state.edit?'checked':''}> Mode édition (drag)</label>` : ''}
        ${canAdmin && this.state.edit ? `<button class="btn-ghost" id="plan-autopos">↻ Réorganiser auto</button>` : ''}
      </div>

      <div class="grid" style="grid-template-columns: 1fr 320px; gap:14px; align-items:start">
        <div class="card plan-wrap">
          <div id="plan-svg-wrap"></div>
        </div>
        <div class="card plan-side">
          <h3 style="margin-top:0">Détail</h3>
          <div id="plan-detail"><p class="muted">Clic sur un lieu pour voir ses tâches et personnes en cours.</p></div>
        </div>
      </div>
    `;
    document.querySelectorAll('.etage-pills .pill').forEach(b => b.onclick = () => { this.state.etageFilter = b.dataset.etage; this.state.selectedLieu = null; App.refresh(); });
    const editCb = document.getElementById('plan-edit');
    if (editCb) editCb.onchange = e => { this.state.edit = e.target.checked; App.refresh(); };
    const autoBtn = document.getElementById('plan-autopos');
    if (autoBtn) autoBtn.onclick = () => {
      if (!confirm('Réorganiser automatiquement tous les lieux selon la grille par défaut ?')) return;
      s.lieux.forEach(l => Object.assign(l, autoPosition(l, s.lieux)));
      DB.save(); App.refresh();
    };
    this.drawSvg();
    this.drawDetail();
  },

  // Calcule la charge d'un lieu sur 5 jours ouvrés
  chargeLieu(lieu, today) {
    const s = DB.state;
    const end = D.addWorkdays(today, 4);
    const tasks = s.taches.filter(t => t.lieuId === lieu.id && t.fin >= today && t.debut <= end);
    const jours = tasks.reduce((n,t) => {
      const a = t.debut < today ? today : t.debut;
      const b = t.fin > end ? end : t.fin;
      return n + D.workdaysBetween(a, b);
    }, 0);
    const capa = (lieu.capacite || 1) * 5;
    const pct = Math.min(200, Math.round(jours / capa * 100));
    return { tasks, jours, capa, pct };
  },

  colorForLoad(pct) {
    if (pct === 0)  return { fill:'var(--surface-2)', stroke:'var(--border)' };
    if (pct <= 50)  return { fill:'#d4f5e0', stroke:'#1f8a4c' };
    if (pct <= 80)  return { fill:'#fff4d1', stroke:'#c47800' };
    if (pct <= 95)  return { fill:'#ffe0c2', stroke:'#d97706' };
    return              { fill:'#ffd1d1', stroke:'#c43b3b' };
  },

  // Personnes "actives" dans un lieu aujourd'hui = celles qui ont une tâche dans ce lieu today
  personnesDansLieu(lieu, today) {
    const s = DB.state;
    const tasksHere = s.taches.filter(t => t.lieuId === lieu.id && t.debut <= today && t.fin >= today && !t.jalon);
    const ids = new Set();
    tasksHere.forEach(t => (t.assignes||[]).forEach(id => ids.add(id)));
    return Array.from(ids).map(id => DB.personne(id)).filter(Boolean);
  },

  drawSvg() {
    const s = DB.state;
    const today = D.today();
    const st = this.state;
    let lieux = s.lieux.slice();
    if (st.etageFilter) lieux = lieux.filter(l => l.etage === st.etageFilter);
    // Bounds
    const xs = lieux.map(l => (l.x||0) + (l.w||180));
    const ys = lieux.map(l => (l.y||0) + (l.h||110));
    const maxX = Math.max(...xs, 400) + 20;
    const maxY = Math.max(...ys, 300) + 40;

    // Bandes d'étages (labels) — uniquement si on affiche plusieurs étages
    const etagesPresents = [...new Set(lieux.map(l => l.etage))];
    const etageLabels = etagesPresents.map(e => {
      const lieuxE = lieux.filter(l => l.etage === e);
      const yMin = Math.min(...lieuxE.map(l => l.y||0));
      const yMax = Math.max(...lieuxE.map(l => (l.y||0) + (l.h||110)));
      return `<text class="plan-etage-label" x="4" y="${(yMin+yMax)/2}" dy="4">${e}</text>
        <line class="plan-etage-line" x1="0" x2="${maxX}" y1="${yMin-14}" y2="${yMin-14}"/>`;
    }).join('');

    const rects = lieux.map(l => {
      const charge = this.chargeLieu(l, today);
      const col = this.colorForLoad(charge.pct);
      const people = this.personnesDansLieu(l, today);
      const isSel = st.selectedLieu === l.id;
      const typeIcon = l.type === 'production' ? '🛠' : '📦';
      const dotsCount = Math.min(people.length, 12);
      const dots = [];
      for (let i=0; i<dotsCount; i++) {
        const p = people[i];
        const cx = (l.x||0) + 12 + (i%6) * 16;
        const cy = (l.y||0) + (l.h||110) - 14 - Math.floor(i/6) * 14;
        dots.push(`<circle class="plan-person" cx="${cx}" cy="${cy}" r="5" fill="${p.couleur||'#2c5fb3'}" title="${p.prenom} ${p.nom}"><title>${p.prenom} ${p.nom} · ${p.role}</title></circle>`);
      }
      if (people.length > 12) {
        const cx = (l.x||0) + 12 + (12%6) * 16;
        const cy = (l.y||0) + (l.h||110) - 14 - Math.floor(12/6) * 14;
        dots.push(`<text class="plan-person-more" x="${cx-4}" y="${cy+3}">+${people.length-12}</text>`);
      }
      const editClass = st.edit ? 'editable' : '';
      return `<g class="plan-lieu ${isSel?'selected':''} ${editClass}" data-lieu="${l.id}">
        <rect x="${l.x||0}" y="${l.y||0}" width="${l.w||180}" height="${l.h||110}" rx="8" fill="${col.fill}" stroke="${col.stroke}" stroke-width="2"/>
        <text class="plan-lieu-title" x="${(l.x||0)+10}" y="${(l.y||0)+20}">${typeIcon} ${l.nom}</text>
        <text class="plan-lieu-meta" x="${(l.x||0)+10}" y="${(l.y||0)+38}">${charge.tasks.length} tâche${charge.tasks.length>1?'s':''} · ${charge.pct}% charge</text>
        <text class="plan-lieu-cap" x="${(l.x||0)+(l.w||180)-10}" y="${(l.y||0)+20}" text-anchor="end">cap ${l.capacite}</text>
        ${dots.join('')}
      </g>`;
    }).join('');

    const html = `<svg class="plan-svg" viewBox="0 0 ${maxX} ${maxY}" preserveAspectRatio="xMinYMin meet" width="100%" style="min-height:${Math.min(maxY, 700)}px">
      ${etageLabels}
      ${rects}
    </svg>`;
    document.getElementById('plan-svg-wrap').innerHTML = html;

    const wrap = document.getElementById('plan-svg-wrap');
    wrap.querySelectorAll('.plan-lieu').forEach(g => {
      g.addEventListener('click', (e) => {
        if (this.state.edit) return; // pas de sélection en mode édition
        this.state.selectedLieu = g.dataset.lieu;
        App.refresh();
      });
      if (this.state.edit) this.makeDraggable(g);
    });
  },

  makeDraggable(g) {
    const lieuId = g.dataset.lieu;
    const lieu = DB.lieu(lieuId);
    if (!lieu) return;
    const rect = g.querySelector('rect');
    const texts = g.querySelectorAll('text');
    const dots = g.querySelectorAll('circle, text.plan-person-more');
    let start = null;
    const svg = g.closest('svg');
    const toSvg = (e) => {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      return pt.matrixTransform(svg.getScreenCTM().inverse());
    };
    g.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const p = toSvg(e);
      start = { mx: p.x, my: p.y, lx: lieu.x, ly: lieu.y };
      g.classList.add('dragging');
    });
    window.addEventListener('mousemove', (e) => {
      if (!start) return;
      const p = toSvg(e);
      const dx = p.x - start.mx;
      const dy = p.y - start.my;
      lieu.x = Math.max(0, Math.round(start.lx + dx));
      lieu.y = Math.max(0, Math.round(start.ly + dy));
      // Mettre à jour positions sans re-render complet
      rect.setAttribute('x', lieu.x);
      rect.setAttribute('y', lieu.y);
      texts[0].setAttribute('x', lieu.x + 10); texts[0].setAttribute('y', lieu.y + 20);
      texts[1].setAttribute('x', lieu.x + 10); texts[1].setAttribute('y', lieu.y + 38);
      if (texts[2]) { texts[2].setAttribute('x', lieu.x + lieu.w - 10); texts[2].setAttribute('y', lieu.y + 20); }
    });
    window.addEventListener('mouseup', () => {
      if (!start) return;
      start = null;
      g.classList.remove('dragging');
      DB.save();
    }, { once: false });
  },

  drawDetail() {
    const st = this.state;
    const s = DB.state;
    const today = D.today();
    const target = document.getElementById('plan-detail');
    if (!st.selectedLieu) {
      target.innerHTML = `<p class="muted">Clic sur un lieu pour voir ses tâches et personnes en cours.</p>`;
      return;
    }
    const l = DB.lieu(st.selectedLieu);
    if (!l) { target.innerHTML = `<p class="muted">Lieu introuvable.</p>`; return; }
    const charge = this.chargeLieu(l, today);
    const col = this.colorForLoad(charge.pct);
    const people = this.personnesDansLieu(l, today);
    const end = D.addWorkdays(today, 4);
    const tasks = s.taches.filter(t => t.lieuId === l.id && t.fin >= today && t.debut <= end);
    tasks.sort((a,b) => a.debut.localeCompare(b.debut));

    target.innerHTML = `
      <h3 style="margin:0">${l.nom}</h3>
      <div class="muted small">${l.type} · étage ${l.etage} · capacité ${l.capacite}</div>
      <div style="margin-top:10px;padding:8px;border-radius:6px;background:${col.fill};border-left:3px solid ${col.stroke}">
        <div><strong>${charge.pct}%</strong> de charge sur 5 j. ouvrés</div>
        <div class="muted small">${charge.jours} / ${charge.capa} j-personne occupés</div>
      </div>
      <h4>👥 Personnes présentes aujourd'hui (${people.length})</h4>
      ${people.length ? `<ul class="list">${people.map(p => `<li><strong>${App.personneLabel(p)}</strong> <span class="muted small">${p.role}</span></li>`).join('')}</ul>` : '<p class="muted small">Personne aujourd\'hui.</p>'}
      <h4>📋 Tâches prévues (5 j. ouvrés) · ${tasks.length}</h4>
      ${tasks.length ? `<ul class="list">${tasks.map(t => {
        const prj = DB.projet(t.projetId);
        return `<li><div><strong>${t.nom}</strong><div class="small muted">${prj?prj.code:''} · ${D.fmt(t.debut)} → ${D.fmt(t.fin)} · ${(t.assignes||[]).length} pers.</div></div><span class="badge" style="background:${prj?prj.couleur+'33':''};color:${prj?prj.couleur:''}">${prj?prj.code:''}</span></li>`;
      }).join('')}</ul>` : '<p class="muted small">Aucune tâche prévue.</p>'}
    `;
  },
};
