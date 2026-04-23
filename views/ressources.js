// Vue Ressources : cartographie personnes × jours × demi-journées
App.views.ressources = {
  state: { search:'', lieuFilter:'', compFilter:'', onlyDispo:false, weeks:1 },

  render(root) {
    const s = DB.state;
    const weeksOpts = [1, 2, 4, 8];
    root.innerHTML = `
      <div class="toolbar">
        <input type="search" id="r-search" placeholder="Rechercher nom, rôle..." value="${this.state.search}">
        <select id="r-lieu"><option value="">Tous lieux</option>${s.lieux.filter(l=>l.type==='production').map(l=>`<option value="${l.id}" ${l.id===this.state.lieuFilter?'selected':''}>${l.nom}</option>`).join('')}</select>
        <select id="r-comp"><option value="">Toutes compétences</option>${[...new Set(s.personnes.flatMap(p=>p.competences||[]))].sort().map(c=>`<option value="${c}" ${c===this.state.compFilter?'selected':''}>${c}</option>`).join('')}</select>
        <label class="small"><input type="checkbox" id="r-dispo" ${this.state.onlyDispo?'checked':''}> Seulement les disponibles aujourd'hui</label>
        <span class="spacer"></span>
        <div class="etage-pills" title="Nombre de semaines affichées">
          ${weeksOpts.map(w => `<button class="pill ${this.state.weeks===w?'on':''}" data-weeks="${w}">${w} sem.</button>`).join('')}
        </div>
        <span class="muted small">🟢 dispo · 🟠 occupé·e · hachuré = off · grisé = week-end · violet = absent</span>
      </div>
      <div class="card"><div id="r-grid" class="r-scroll"></div></div>
    `;
    document.getElementById('r-search').oninput = e => { this.state.search = e.target.value.toLowerCase(); this.draw(); };
    document.getElementById('r-lieu').onchange = e => { this.state.lieuFilter = e.target.value; this.draw(); };
    document.getElementById('r-comp').onchange = e => { this.state.compFilter = e.target.value; this.draw(); };
    document.getElementById('r-dispo').onchange = e => { this.state.onlyDispo = e.target.checked; this.draw(); };
    document.querySelectorAll('.etage-pills .pill[data-weeks]').forEach(b => b.onclick = () => {
      this.state.weeks = +b.dataset.weeks; this.draw();
    });
    this.draw();
  },

  // Renvoie true si la personne a une tâche active ce jour-là
  occupéCeJour(personne, isoDate) {
    return DB.state.taches.some(t => (t.assignes||[]).includes(personne.id) && t.debut <= isoDate && t.fin >= isoDate && !t.jalon);
  },

  draw() {
    const st = this.state, s = DB.state;
    let list = s.personnes.slice();
    if (st.search) list = list.filter(p => (p.prenom+' '+p.nom+' '+p.role+' '+(p.competences||[]).join(' ')).toLowerCase().includes(st.search));
    if (st.lieuFilter) list = list.filter(p => p.lieuPrincipalId === st.lieuFilter);
    if (st.compFilter) list = list.filter(p => (p.competences||[]).includes(st.compFilter));

    const today = D.today();
    const todayDow = JOURS_SEMAINE[(D.parse(today).getUTCDay()+6)%7];
    if (st.onlyDispo) list = list.filter(p => {
      const h = p.horaires || defaultHoraires();
      return (h[todayDow]?.matin || h[todayDow]?.aprem) && !this.occupéCeJour(p, today);
    });

    const weeks = Math.max(1, st.weeks || 1);
    const monday = this.mondayOf(today);
    const days = [];
    for (let i=0; i<7*weeks; i++) days.push(D.addDays(monday, i));

    // Compact classes selon la densité
    const dense = weeks >= 4 ? ' r-dense' : weeks >= 2 ? ' r-medium' : '';

    // En-tête : une ligne "semaines" (si > 1), puis jours, puis M/A
    const weekRow = weeks > 1 ? `<tr class="r-week-row">
      <th></th><th></th>
      ${Array.from({length:weeks}).map((_,wi) => `<th colspan="14" class="r-week-sep">Semaine du ${D.fmt(D.addDays(monday, wi*7))}</th>`).join('')}
      <th></th>
    </tr>` : '';

    const dowShort = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
    const dayHeaderRow = `<tr>
      <th style="text-align:left">Personne</th>
      <th style="text-align:left">Rôle / Compétences</th>
      ${days.map((d,i) => {
        const dowIdx = i % 7;
        const isToday = d === today;
        const isWeekEnd = dowIdx >= 5;
        const isFirstOfWeek = dowIdx === 0 && i > 0;
        return `<th colspan="2" class="${isToday?'is-today':''} ${isWeekEnd?'is-weekend':''} ${isFirstOfWeek?'week-start':''}"><div class="r-head"><div>${dowShort[dowIdx]}</div><div class="muted small">${D.fmt(d)}</div></div></th>`;
      }).join('')}
      <th class="right">Dispo</th>
    </tr>`;

    const halfRow = `<tr class="sub">
      <th></th><th></th>
      ${days.map((d,i) => {
        const isFirstOfWeek = (i % 7) === 0 && i > 0;
        return `<th class="r-half ${isFirstOfWeek?'week-start':''}">M</th><th class="r-half">A</th>`;
      }).join('')}
      <th></th>
    </tr>`;

    const head = `<thead>${weekRow}${dayHeaderRow}${halfRow}</thead>`;

    const rows = list.map(p => {
      const h = p.horaires || defaultHoraires();
      let dispoCount = 0, totalDJ = 0;
      const cells = days.map((d, i) => {
        const dow = JOURS_SEMAINE[(D.parse(d).getUTCDay()+6)%7];
        const isWeekEnd = i % 7 >= 5;
        const matinOn = !!h[dow]?.matin;
        const apremOn = !!h[dow]?.aprem;
        const absent = DB.personneAbsenteLe(p.id, d);
        const absInfo = absent ? (p.absences||[]).find(a => a.debut <= d && a.fin >= d) : null;
        const occupé = !absent && this.occupéCeJour(p, d);
        if (matinOn) totalDJ++;
        if (apremOn) totalDJ++;
        if (matinOn && !absent) dispoCount++;
        if (apremOn && !absent) dispoCount++;
        const state = (on) => !on ? 'off' : (absent ? 'absent' : (occupé ? 'busy' : 'free'));
        const isFirstOfWeek = (i % 7) === 0 && i > 0;
        const weCls = isWeekEnd ? ' r-weekend' : '';
        const mkCell = (on, label, extra) => {
          const stCls = isWeekEnd ? 'weekend' : state(on);
          const tt = isWeekEnd ? '' : `${p.prenom} ${p.nom} — ${D.fmt(d)} ${label} : ${!on?'off':absent?'absent ('+absInfo.motif+')':occupé?'occupé·e':'dispo'}`;
          return `<td class="r-cell r-${stCls}${weCls}${extra||''}" title="${tt}"></td>`;
        };
        return mkCell(matinOn,'matin', isFirstOfWeek ? ' week-start' : '') + mkCell(apremOn,'après-midi', '');
      }).join('');
      const lieu = DB.lieu(p.lieuPrincipalId);
      return `<tr>
        <td><strong>${App.personneLabel(p)}</strong><div class="muted small">${lieu?lieu.nom:'—'}</div></td>
        <td>${p.role}<div>${(p.competences||[]).map(c=>`<span class="chip small">${c}</span>`).join('')}</div></td>
        ${cells}
        <td class="right mono">${dispoCount}/${totalDJ}</td>
      </tr>`;
    }).join('');

    document.getElementById('r-grid').innerHTML = `
      <table class="data ressources-grid${dense}">
        ${head}
        <tbody>${rows || `<tr><td colspan="${days.length*2+3}" class="muted" style="text-align:center;padding:20px">Aucune personne ne correspond aux filtres.</td></tr>`}</tbody>
      </table>
      <p class="muted small" style="margin-top:10px">${list.length} personne(s) · ${weeks} semaine${weeks>1?'s':''} · du ${D.fmt(days[0])} au ${D.fmt(days[days.length-1])}</p>
    `;
  },

  mondayOf(iso) {
    const dow = (D.parse(iso).getUTCDay()+6)%7;
    return D.addDays(iso, -dow);
  },
};
