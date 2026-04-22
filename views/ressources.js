// Vue Ressources : cartographie personnes × jours × demi-journées
App.views.ressources = {
  state: { search:'', lieuFilter:'', compFilter:'', onlyDispo:false },

  render(root) {
    const s = DB.state;
    root.innerHTML = `
      <div class="toolbar">
        <input type="search" id="r-search" placeholder="Rechercher nom, rôle..." value="${this.state.search}">
        <select id="r-lieu"><option value="">Tous lieux</option>${s.lieux.filter(l=>l.type==='production').map(l=>`<option value="${l.id}" ${l.id===this.state.lieuFilter?'selected':''}>${l.nom}</option>`).join('')}</select>
        <select id="r-comp"><option value="">Toutes compétences</option>${[...new Set(s.personnes.flatMap(p=>p.competences||[]))].sort().map(c=>`<option value="${c}" ${c===this.state.compFilter?'selected':''}>${c}</option>`).join('')}</select>
        <label class="small"><input type="checkbox" id="r-dispo" ${this.state.onlyDispo?'checked':''}> Seulement les disponibles aujourd'hui</label>
        <span class="spacer"></span>
        <span class="muted small">🟢 dispo · 🟠 occupé·e · grise hachurée = off · violet hachuré = absent</span>
      </div>
      <div class="card"><div id="r-grid"></div></div>
    `;
    document.getElementById('r-search').oninput = e => { this.state.search = e.target.value.toLowerCase(); this.draw(); };
    document.getElementById('r-lieu').onchange = e => { this.state.lieuFilter = e.target.value; this.draw(); };
    document.getElementById('r-comp').onchange = e => { this.state.compFilter = e.target.value; this.draw(); };
    document.getElementById('r-dispo').onchange = e => { this.state.onlyDispo = e.target.checked; this.draw(); };
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
    const todayDow = JOURS_SEMAINE[(D.parse(today).getUTCDay()+6)%7]; // Lundi=0 après décalage
    if (st.onlyDispo) list = list.filter(p => {
      const h = p.horaires || defaultHoraires();
      return (h[todayDow]?.matin || h[todayDow]?.aprem) && !this.occupéCeJour(p, today);
    });

    // Générer les 7 dates de la semaine courante (lundi→dimanche)
    const monday = this.mondayOf(today);
    const days = [];
    for (let i=0; i<7; i++) days.push(D.addDays(monday, i));

    const head = `<thead>
      <tr>
        <th style="text-align:left">Personne</th>
        <th style="text-align:left">Rôle / Compétences</th>
        ${days.map((d,i) => `<th colspan="2" class="${d===today?'is-today':''}"><div class="r-head"><div>${JOURS_COURT[i]==='L'&&i===0?'Lun':JOURS_COURT[i]==='M'&&i===1?'Mar':JOURS_COURT[i]==='M'&&i===2?'Mer':JOURS_COURT[i]==='J'?'Jeu':JOURS_COURT[i]==='V'?'Ven':JOURS_COURT[i]==='S'?'Sam':'Dim'}</div><div class="muted small">${D.fmt(d)}</div></div></th>`).join('')}
        <th class="right">Dispo sem.</th>
      </tr>
      <tr class="sub">
        <th></th><th></th>
        ${days.map(() => `<th class="r-half">M</th><th class="r-half">A</th>`).join('')}
        <th></th>
      </tr>
    </thead>`;

    const rows = list.map(p => {
      const h = p.horaires || defaultHoraires();
      let dispoCount = 0;
      const cells = days.map((d, i) => {
        const dow = JOURS_SEMAINE[(D.parse(d).getUTCDay()+6)%7];
        const matinOn = !!h[dow]?.matin;
        const apremOn = !!h[dow]?.aprem;
        const absent = DB.personneAbsenteLe(p.id, d);
        const absInfo = absent ? (p.absences||[]).find(a => a.debut <= d && a.fin >= d) : null;
        const occupé = !absent && this.occupéCeJour(p, d);
        if (matinOn && !absent) dispoCount++;
        if (apremOn && !absent) dispoCount++;
        const state = (on) => !on ? 'off' : (absent ? 'absent' : (occupé ? 'busy' : 'free'));
        const mkCell = (on, label) => {
          const st = state(on);
          const tt = `${p.prenom} ${p.nom} — ${dow} ${label} : ${!on?'off':absent?'absent ('+absInfo.motif+')':occupé?'occupé·e':'dispo'}`;
          return `<td class="r-cell r-${st}" title="${tt}"></td>`;
        };
        return mkCell(matinOn,'matin') + mkCell(apremOn,'après-midi');
      }).join('');
      const lieu = DB.lieu(p.lieuPrincipalId);
      return `<tr>
        <td><strong>${App.personneLabel(p)}</strong><div class="muted small">${lieu?lieu.nom:'—'}</div></td>
        <td>${p.role}<div>${(p.competences||[]).map(c=>`<span class="chip small">${c}</span>`).join('')}</div></td>
        ${cells}
        <td class="right mono">${dispoCount}/14</td>
      </tr>`;
    }).join('');

    document.getElementById('r-grid').innerHTML = `
      <table class="data ressources-grid">
        ${head}
        <tbody>${rows || `<tr><td colspan="${days.length*2+3}" class="muted" style="text-align:center;padding:20px">Aucune personne ne correspond aux filtres.</td></tr>`}</tbody>
      </table>
      <p class="muted small" style="margin-top:10px">${list.length} personne(s) · semaine du ${D.fmt(days[0])} au ${D.fmt(days[6])}</p>
    `;
  },

  // Lundi de la semaine contenant une date ISO
  mondayOf(iso) {
    const dow = (D.parse(iso).getUTCDay()+6)%7; // 0 = lundi
    return D.addDays(iso, -dow);
  },
};
