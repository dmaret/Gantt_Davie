App.views.capacite = {
  state: { weeks: 12, dim: 'lieu' }, // 'lieu' | 'machine' | 'personne'
  render(root) {
    root.innerHTML = `
      <div class="toolbar">
        <strong>Capacité vs. Demande</strong>
        <select id="cap-dim">
          <option value="lieu">Lieux de production</option>
          <option value="machine">Machines</option>
          <option value="personne">Personnes</option>
        </select>
        <select id="cap-weeks">
          <option value="8">8 semaines</option>
          <option value="12" selected>12 semaines</option>
          <option value="24">24 semaines</option>
        </select>
        <span class="spacer"></span>
        <span class="muted small">Vert = OK · Bleu = chargé · Orange = tendu · Rouge = saturé</span>
      </div>
      <div class="card"><div id="cap-grid"></div></div>
    `;
    document.getElementById('cap-dim').value = this.state.dim;
    document.getElementById('cap-weeks').value = this.state.weeks;
    document.getElementById('cap-dim').onchange = e => { this.state.dim = e.target.value; this.draw(); };
    document.getElementById('cap-weeks').onchange = e => { this.state.weeks = +e.target.value; this.draw(); };
    this.draw();
  },
  draw() {
    const st = this.state, s = DB.state;
    const today = D.today();
    const mondayOf = iso => { const d = D.parse(iso); while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate()-1); return D.iso(d); };
    const firstMon = mondayOf(today);
    const weeks = [];
    for (let w=0; w<st.weeks; w++) {
      const start = D.addDays(firstMon, w*7);
      const end = D.addDays(start, 4); // vendredi
      weeks.push({ idx: w, start, end, label: D.fmt(start) });
    }

    let dims = [];
    if (st.dim === 'lieu') dims = s.lieux.filter(l => l.type === 'production').map(l => ({ id: l.id, label: l.nom + ' ('+l.etage+')', capa: l.capacite }));
    else if (st.dim === 'machine') dims = s.machines.map(m => ({ id: m.id, label: m.nom, capa: m.capaciteJour || 8 }));
    else dims = s.personnes.map(p => ({ id: p.id, label: App.personneLabel(p), capa: (p.capaciteHebdo||35)/5 }));

    const charge = (dimId, w) => {
      let tasks;
      if (st.dim === 'lieu') tasks = s.taches.filter(t => t.lieuId === dimId);
      else if (st.dim === 'machine') tasks = s.taches.filter(t => t.machineId === dimId);
      else tasks = s.taches.filter(t => (t.assignes||[]).includes(dimId));
      tasks = tasks.filter(t => t.fin >= w.start && t.debut <= w.end);
      return tasks.reduce((n,t) => {
        const a = t.debut > w.start ? t.debut : w.start;
        const b = t.fin < w.end ? t.fin : w.end;
        return n + D.workdaysBetween(a, b);
      }, 0);
    };
    const level = (load, capaJ) => {
      const weekCapa = capaJ * 5;
      if (weekCapa === 0) return 0;
      const pct = load / weekCapa;
      if (pct === 0) return 0;
      if (pct < 0.5) return 1;
      if (pct < 0.85) return 2;
      if (pct < 1.05) return 3;
      return 4;
    };

    // Filter dims avec au moins une tâche pour lisibilité
    const active = dims.filter(d => weeks.some(w => charge(d.id, w) > 0));
    const capaUnit = st.dim === 'lieu' ? 'j' : 'h';
    const cols = `250px 72px repeat(${weeks.length}, minmax(50px, 1fr))`;
    const head = `<div class="h-label" style="background:transparent">${st.dim}</div>`
      + `<div class="h-head">Cap./sem.</div>`
      + weeks.map(w => `<div class="h-head">${w.label}</div>`).join('');
    const rows = active.map(d => {
      const weekCapa = d.capa * 5;
      const capaDisplay = weekCapa % 1 === 0 ? weekCapa : weekCapa.toFixed(1);
      const cells = weeks.map(w => {
        const load = charge(d.id, w);
        const lvl = level(load, d.capa);
        const pct = weekCapa ? Math.round(load / weekCapa * 100) : 0;
        return `<div class="h-cell" data-lvl="${lvl}" title="${load}${capaUnit} chargé · capacité ${weekCapa}${capaUnit}/sem. (${pct}%)">${pct}%</div>`;
      }).join('');
      return `<div class="h-label">${d.label}</div><div class="h-capa">${capaDisplay}${capaUnit}</div>${cells}`;
    }).join('');
    document.getElementById('cap-grid').innerHTML = `
      <div class="heatmap-grid" style="grid-template-columns:${cols}">
        ${head}${rows}
      </div>
      <p class="muted small" style="margin-top:12px">${active.length} ${st.dim}(s) avec charge · ${weeks.length} semaines · valeurs = utilisation en % de la capacité hebdomadaire</p>
    `;
  },
};
