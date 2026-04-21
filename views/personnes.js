App.views.personnes = {
  state: { search:'', roleFilter:'', lieuFilter:'' },
  render(root) {
    const s = DB.state;
    root.innerHTML = `
      <div class="toolbar">
        <input type="search" id="p-search" placeholder="Rechercher nom, rôle, compétence...">
        <select id="p-role"><option value="">Tous rôles</option>${[...new Set(s.personnes.map(p=>p.role))].map(r=>`<option>${r}</option>`).join('')}</select>
        <select id="p-lieu"><option value="">Tous lieux</option>${s.lieux.filter(l=>l.type==='production').map(l=>`<option value="${l.id}">${l.nom}</option>`).join('')}</select>
        <span class="spacer"></span>
        <button class="btn" id="p-add">+ Ajouter une personne</button>
      </div>
      <div class="card"><div id="p-table"></div></div>
    `;
    document.getElementById('p-search').oninput = e => { this.state.search = e.target.value.toLowerCase(); this.draw(); };
    document.getElementById('p-role').onchange = e => { this.state.roleFilter = e.target.value; this.draw(); };
    document.getElementById('p-lieu').onchange = e => { this.state.lieuFilter = e.target.value; this.draw(); };
    document.getElementById('p-add').onclick = () => this.openForm(null);
    this.draw();
  },
  draw() {
    const st = this.state, s = DB.state;
    let list = s.personnes.slice();
    if (st.search) list = list.filter(p => (p.prenom+' '+p.nom+' '+p.role+' '+(p.competences||[]).join(' ')).toLowerCase().includes(st.search));
    if (st.roleFilter) list = list.filter(p => p.role === st.roleFilter);
    if (st.lieuFilter) list = list.filter(p => p.lieuPrincipalId === st.lieuFilter);

    const today = D.today();
    // Charge sur 4 semaines glissantes
    const weeks = [];
    let weekStart = today;
    for (let w=0; w<4; w++) {
      const weekEnd = D.addWorkdays(weekStart, 4);
      weeks.push({ start: weekStart, end: weekEnd });
      weekStart = D.addWorkdays(weekEnd, 1);
    }
    const rows = list.map(p => {
      const ts = s.taches.filter(t => (t.assignes||[]).includes(p.id));
      const perWeek = weeks.map(w => {
        const inW = ts.filter(t => t.fin >= w.start && t.debut <= w.end);
        const h = inW.reduce((n,t) => n + (D.weekdaysBetween(t.debut > w.start ? t.debut : w.start, t.fin < w.end ? t.fin : w.end)) * 7, 0);
        const pct = Math.min(100, Math.round(h / p.capaciteHebdo * 100));
        return { h, pct };
      });
      const totalH = perWeek.reduce((n,w) => n + w.h, 0);
      const avgPct = Math.round(perWeek.reduce((n,w) => n + w.pct, 0) / weeks.length);
      const tsNow = ts.filter(t => t.fin >= today && t.debut <= D.addWorkdays(today, 4));
      const cells = perWeek.map(w => {
        const cls = w.pct > 95 ? 'bad' : w.pct > 80 ? 'warn' : '';
        return `<div class="bar-inline ${cls}" title="${w.h}h"><div class="fill" style="width:${w.pct}%"></div></div>`;
      }).join('');
      const avgCls = avgPct > 95 ? 'bad' : avgPct > 80 ? 'warn' : '';
      return `<tr data-id="${p.id}" style="cursor:pointer">
        <td><strong>${App.personneLabel(p)}</strong></td>
        <td>${p.role}</td>
        <td><span class="muted">${DB.lieu(p.lieuPrincipalId)?.nom || '—'}</span></td>
        <td>${(p.competences||[]).map(c => `<span class="chip">${c}</span>`).join('')}</td>
        <td>${tsNow.length}</td>
        <td><div style="display:flex;gap:3px">${cells}</div></td>
        <td class="right"><span class="badge ${avgCls==='bad'?'bad':avgCls==='warn'?'warn':'good'}">${avgPct}%</span></td>
      </tr>`;
    }).join('');

    document.getElementById('p-table').innerHTML = `
      <table class="data">
        <thead><tr><th>Personne</th><th>Rôle</th><th>Lieu principal</th><th>Compétences</th><th>Tâches 7j</th><th>Charge 4 semaines</th><th class="right">Moy.</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="muted small" style="margin-top:10px">${list.length} personne(s) · 4 barres = 4 semaines glissantes · cliquer pour éditer</p>
    `;
    document.querySelectorAll('#p-table tbody tr').forEach(tr => tr.onclick = () => this.openForm(tr.dataset.id));
  },
  openForm(id) {
    const isNew = !id;
    const s = DB.state;
    const p = id ? DB.personne(id) : {
      id: DB.uid('P'), prenom:'', nom:'', role:'Technicien·ne', lieuPrincipalId:s.lieux[0].id, competences:[], capaciteHebdo:35, couleur:'#2c5fb3',
    };
    const allComps = ['CNC','Laser','Pliage','Soudure','Peinture','Montage','Contrôle','Élec','CAO','Logistique','Management','Qualité'];
    const body = `
      <div class="row">
        <div class="field"><label>Prénom</label><input id="pf-prenom" value="${p.prenom||''}"></div>
        <div class="field"><label>Nom</label><input id="pf-nom" value="${p.nom||''}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Rôle</label><input id="pf-role" value="${p.role||''}"></div>
        <div class="field"><label>Capacité hebdo (h)</label><input type="number" id="pf-capa" value="${p.capaciteHebdo||35}"></div>
      </div>
      <div class="field"><label>Lieu principal</label>
        <select id="pf-lieu">${s.lieux.filter(l=>l.type==='production').map(l=>`<option value="${l.id}" ${l.id===p.lieuPrincipalId?'selected':''}>${l.nom}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Compétences (Ctrl/Cmd)</label>
        <select id="pf-comps" multiple size="6">
          ${allComps.map(c => `<option value="${c}" ${(p.competences||[]).includes(c)?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
    `;
    const foot = `
      ${!isNew?'<button class="btn btn-danger" id="pf-del">Supprimer</button>':''}
      <span class="spacer" style="flex:1"></span>
      <button class="btn btn-secondary" id="pf-cancel">Annuler</button>
      <button class="btn" id="pf-save">${isNew?'Créer':'Enregistrer'}</button>
    `;
    App.openModal(isNew?'Nouvelle personne':App.personneLabel(p), body, foot);
    document.getElementById('pf-cancel').onclick = () => App.closeModal();
    document.getElementById('pf-save').onclick = () => {
      p.prenom = document.getElementById('pf-prenom').value.trim();
      p.nom    = document.getElementById('pf-nom').value.trim();
      p.role   = document.getElementById('pf-role').value.trim();
      p.capaciteHebdo = +document.getElementById('pf-capa').value;
      p.lieuPrincipalId = document.getElementById('pf-lieu').value;
      p.competences = Array.from(document.getElementById('pf-comps').selectedOptions).map(o=>o.value);
      if (!p.prenom || !p.nom) { App.toast('Prénom et nom requis','error'); return; }
      if (isNew) s.personnes.push(p);
      DB.save(); App.closeModal(); App.toast('Enregistré','success'); App.refresh();
    };
    if (!isNew) {
      document.getElementById('pf-del').onclick = () => {
        if (!confirm('Supprimer cette personne ? Ses affectations de tâches seront retirées.')) return;
        s.personnes = s.personnes.filter(x => x.id !== p.id);
        s.taches.forEach(t => t.assignes = (t.assignes||[]).filter(a => a !== p.id));
        DB.save(); App.closeModal(); App.toast('Supprimée','info'); App.refresh();
      };
    }
  },
};
