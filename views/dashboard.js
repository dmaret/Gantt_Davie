App.views.dashboard = {
  render(root) {
    const s = DB.state;
    const conflicts = App.detectConflicts();
    const today = D.today();

    const projetsEnCours = s.projets.filter(p => p.statut === 'en-cours').length;
    const horizon = D.addWorkdays(today, 7);
    const tachesSemaine = s.taches.filter(t => t.fin >= today && t.debut <= horizon).length;
    const stockBas = s.stock.filter(x => x.quantite < x.seuilAlerte).length;
    const cmdBloq = s.commandes.filter(c => c.statut !== 'engagée').length;

    root.innerHTML = `
      <div class="grid grid-4">
        <div class="kpi"><div class="label">Personnes</div><div class="value">${s.personnes.length}</div><div class="sub">dans ${s.lieux.filter(l=>l.type==='production').length} lieux de production</div></div>
        <div class="kpi"><div class="label">Projets en cours</div><div class="value">${projetsEnCours}</div><div class="sub">${s.projets.length} au total</div></div>
        <div class="kpi ${tachesSemaine>20?'warn':''}"><div class="label">Tâches 7 j. ouvrés</div><div class="value">${tachesSemaine}</div><div class="sub">à venir ou en cours</div></div>
        <div class="kpi ${stockBas>0?'bad':'good'}"><div class="label">Alertes stock</div><div class="value">${stockBas}</div><div class="sub">sous seuil</div></div>
      </div>

      <div class="grid grid-2" style="margin-top:16px">
        <div class="card">
          <h2>⚠ Conflits détectés</h2>
          ${this.renderConflicts(conflicts)}
        </div>
        <div class="card">
          <h2>📦 Commandes — workflow 4A</h2>
          <p class="muted small" style="margin-top:-4px">${s.regle4A.libelle}. Une commande n'est engagée qu'après validation des 4 axes obligatoires.</p>
          ${this.renderCommandes(s)}
        </div>
      </div>

      <div class="grid grid-2" style="margin-top:16px">
        <div class="card">
          <h2>🗓 Prochaines tâches (7 jours ouvrés)</h2>
          ${this.renderNextTasks(s, today)}
        </div>
        <div class="card">
          <h2>🚚 Déplacements à venir</h2>
          ${this.renderNextMoves(s, today)}
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <h2>📊 Charge par lieu de production (5 jours ouvrés)</h2>
        ${this.renderChargeLieux(s, today)}
      </div>
    `;
  },

  renderConflicts(c) {
    const total = c.personnes.length + c.machines.length + c.stock.length + c.commandes.length;
    if (total === 0) return `<p class="muted">Aucun conflit détecté. ✔</p>`;
    const rows = [];
    if (c.personnes.length) rows.push(`<li><span class="badge bad">Personnes</span> ${c.personnes.length} chevauchement(s) d'affectation</li>`);
    if (c.machines.length)  rows.push(`<li><span class="badge bad">Machines</span> ${c.machines.length} conflit(s) d'utilisation</li>`);
    if (c.stock.length)     rows.push(`<li><span class="badge warn">Stock</span> ${c.stock.length} article(s) sous seuil</li>`);
    if (c.commandes.length) rows.push(`<li><span class="badge warn">Commandes</span> ${c.commandes.length} en attente de validations 4A</li>`);
    return `<ul class="list">${rows.join('')}</ul>`;
  },

  renderCommandes(s) {
    if (!s.commandes.length) return `<p class="muted">Aucune commande.</p>`;
    return `<table class="data">
      <thead><tr><th>Réf</th><th>Fournisseur</th><th>Projet</th><th class="right">HT</th><th class="right">TTC</th><th>A1</th><th>A2</th><th>A3</th><th>A4</th><th>Statut</th></tr></thead>
      <tbody>
      ${s.commandes.map(c => {
        const prj = DB.projet(c.projetId);
        const ht = c.montantHT !== undefined ? c.montantHT : (c.montant || 0);
        const taux = c.tauxTVA !== undefined ? c.tauxTVA : 8.1;
        const cell = k => c.validations[k] ? '<span class="badge good">✓</span>' : '<span class="badge muted">·</span>';
        const statutBadge = c.statut==='engagée' ? 'good' : c.statut==='en-attente' ? 'warn' : 'muted';
        return `<tr>
          <td class="mono">${c.ref}</td>
          <td>${c.fournisseur}</td>
          <td>${prj?prj.code:'—'}</td>
          <td class="right">${Money.chf(ht)}</td>
          <td class="right"><strong>${Money.chf(Money.ttc(ht,taux))}</strong></td>
          <td>${cell('A1')}</td><td>${cell('A2')}</td><td>${cell('A3')}</td><td>${cell('A4')}</td>
          <td><span class="badge ${statutBadge}">${c.statut}</span></td>
        </tr>`;
      }).join('')}
      </tbody></table>`;
  },

  renderNextTasks(s, today) {
    const ts = s.taches
      .filter(t => t.fin >= today && t.debut <= D.addWorkdays(today, 7) && !t.jalon)
      .sort((a,b) => a.debut.localeCompare(b.debut))
      .slice(0, 8);
    if (!ts.length) return `<p class="muted">Rien à venir cette semaine.</p>`;
    return `<ul class="list">${ts.map(t => {
      const prj = DB.projet(t.projetId);
      const lieu = DB.lieu(t.lieuId);
      const assigns = (t.assignes||[]).map(id => App.personneLabel(DB.personne(id))).join(', ');
      return `<li>
        <div>
          <div><strong>${t.nom}</strong> · <span class="muted small">${prj?prj.code:''}</span></div>
          <div class="small muted">${D.fmt(t.debut)} → ${D.fmt(t.fin)} · ${lieu?lieu.nom:'—'} · ${assigns||'—'}</div>
        </div>
        <span class="badge" style="background:${prj?prj.couleur+'33':''};color:${prj?prj.couleur:''}">${prj?prj.code:''}</span>
      </li>`;
    }).join('')}</ul>`;
  },

  renderNextMoves(s, today) {
    const ds = s.deplacements
      .filter(d => d.date >= today)
      .sort((a,b) => a.date.localeCompare(b.date))
      .slice(0,8);
    if (!ds.length) return `<p class="muted">Aucun déplacement prévu.</p>`;
    return `<ul class="list">${ds.map(d => {
      const p = DB.personne(d.personneId);
      const o = DB.lieu(d.origineId), de = DB.lieu(d.destinationId);
      return `<li>
        <div>
          <div><strong>${App.personneLabel(p)}</strong> · ${d.motif}</div>
          <div class="small muted">${D.fmt(d.date)} · ${o?o.nom:'—'} → ${de?de.nom:'—'} · ${d.duree}</div>
        </div>
        <span class="badge muted">${d.projetId||''}</span>
      </li>`;
    }).join('')}</ul>`;
  },

  renderChargeLieux(s, today) {
    const lieuxProd = s.lieux.filter(l => l.type === 'production');
    const end = D.addWorkdays(today, 4); // 5 jours ouvrés (jour 0 inclus + 4)
    const rows = lieuxProd.map(l => {
      const tasks = s.taches.filter(t => t.lieuId === l.id && t.fin >= today && t.debut <= end);
      // Calcul en jours ouvrés seulement
      const jours = tasks.reduce((n,t) => {
        const a = t.debut < today ? today : t.debut;
        const b = t.fin > end ? end : t.fin;
        return n + D.workdaysBetween(a, b);
      }, 0);
      const capa = l.capacite * 5; // 5 jours ouvrés
      const pct = Math.min(100, Math.round(jours / capa * 100));
      const cls = pct > 90 ? 'bad' : pct > 70 ? 'warn' : '';
      return `<tr>
        <td><strong>${l.nom}</strong> <span class="muted small">· ${l.etage}</span></td>
        <td>${tasks.length}</td>
        <td>${jours} j-h</td>
        <td>${capa} j-h</td>
        <td><div class="bar-inline ${cls}"><div class="fill" style="width:${pct}%"></div></div></td>
        <td class="right">${pct}%</td>
      </tr>`;
    }).join('');
    return `<table class="data">
      <thead><tr><th>Lieu</th><th>Tâches</th><th>Charge</th><th>Capacité</th><th></th><th class="right">%</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  },
};
