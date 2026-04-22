App.views.dashboard = {
  // Définition des cartes : id, titre, taille (1 = demi-largeur, 2 = pleine), rendu
  panels: {
    'conflits':    { title:'⚠ Conflits détectés',                          size:1, render(s, today, conflicts) { return App.views.dashboard.renderConflicts(conflicts); } },
    'alertes':     { title:'🔔 Alertes proactives (10 j ouvrés)',          size:1, render() { return App.views.dashboard.renderProactive(); } },
    'predictions': { title:'📈 Prédiction fin de projet',                   size:1, render(s) { return App.views.dashboard.renderPredictions(s); } },
    'commandes-4a':{ title:'📦 Commandes — workflow 4A',                    size:1, render(s) {
      return `<p class="muted small" style="margin-top:-4px">${s.regle4A.libelle}. Une commande n'est engagée qu'après validation des 4 axes obligatoires.</p>${App.views.dashboard.renderCommandes(s)}`;
    } },
    'next-tasks':  { title:'🗓 Prochaines tâches (7 jours ouvrés)',         size:1, render(s, today) { return App.views.dashboard.renderNextTasks(s, today); } },
    'next-moves':  { title:'🚚 Déplacements à venir',                       size:1, render(s, today) { return App.views.dashboard.renderNextMoves(s, today); } },
    'charge-lieux':{ title:'📊 Charge par lieu de production (5 j ouvrés)', size:2, render(s, today) { return App.views.dashboard.renderChargeLieux(s, today); } },
  },

  render(root) {
    const s = DB.state;
    const conflicts = App.detectConflicts();
    const today = D.today();

    const projetsEnCours = s.projets.filter(p => p.statut === 'en-cours').length;
    const horizon = D.addWorkdays(today, 7);
    const tachesSemaine = s.taches.filter(t => t.fin >= today && t.debut <= horizon).length;
    const stockBas = s.stock.filter(x => x.quantite < x.seuilAlerte).length;

    // Ordre actuel, en gardant les cartes nouvelles non listées à la fin
    if (!s.dashboardOrder) s.dashboardOrder = Object.keys(this.panels);
    const known = new Set(Object.keys(this.panels));
    const order = s.dashboardOrder.filter(id => known.has(id));
    Object.keys(this.panels).forEach(id => { if (!order.includes(id)) order.push(id); });

    const canDrag = App.can('admin');
    const panelsHtml = order.map(id => {
      const p = this.panels[id];
      if (!p) return '';
      const cls = p.size === 2 ? 'card panel panel-full' : 'card panel';
      return `<div class="${cls}" data-panel="${id}" ${canDrag?'draggable="true"':''}>
        ${canDrag ? '<span class="panel-handle" title="Glisser pour réorganiser">⋮⋮</span>' : ''}
        <h2>${p.title}</h2>
        ${p.render(s, today, conflicts)}
      </div>`;
    }).join('');

    root.innerHTML = `
      <div class="grid grid-4">
        <div class="kpi"><div class="label">Personnes</div><div class="value">${s.personnes.length}</div><div class="sub">dans ${s.lieux.filter(l=>l.type==='production').length} lieux de production</div></div>
        <div class="kpi"><div class="label">Projets en cours</div><div class="value">${projetsEnCours}</div><div class="sub">${s.projets.length} au total</div></div>
        <div class="kpi ${tachesSemaine>20?'warn':''}"><div class="label">Tâches 7 j. ouvrés</div><div class="value">${tachesSemaine}</div><div class="sub">à venir ou en cours</div></div>
        <div class="kpi ${stockBas>0?'bad':'good'}"><div class="label">Alertes stock</div><div class="value">${stockBas}</div><div class="sub">sous seuil</div></div>
      </div>

      ${canDrag ? `<div class="muted small" style="margin:14px 0 -6px 0">🎛 Admin : glisse-dépose les cartes ci-dessous pour réorganiser ton tableau de bord. <button class="btn-ghost" id="db-reset" style="padding:2px 10px">Réinitialiser l'ordre</button></div>` : ''}

      <div class="dashboard-grid" id="db-grid" style="margin-top:16px">${panelsHtml}</div>
    `;

    if (canDrag) {
      this.bindDnD();
      const r = document.getElementById('db-reset');
      if (r) r.onclick = () => {
        DB.state.dashboardOrder = Object.keys(this.panels);
        DB.save(); App.refresh(); App.toast('Ordre par défaut restauré','info');
      };
    }
  },

  bindDnD() {
    const grid = document.getElementById('db-grid');
    if (!grid) return;
    let dragged = null;
    grid.querySelectorAll('.panel').forEach(el => {
      el.addEventListener('dragstart', e => {
        dragged = el;
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', el.dataset.panel); } catch (err) {}
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        grid.querySelectorAll('.panel').forEach(p => p.classList.remove('drop-target'));
      });
      el.addEventListener('dragover', e => {
        if (!dragged || dragged === el) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        grid.querySelectorAll('.panel').forEach(p => p.classList.remove('drop-target'));
        el.classList.add('drop-target');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
      el.addEventListener('drop', e => {
        e.preventDefault();
        el.classList.remove('drop-target');
        if (!dragged || dragged === el) return;
        const fromId = dragged.dataset.panel;
        const toId = el.dataset.panel;
        const order = DB.state.dashboardOrder.slice();
        const fromIdx = order.indexOf(fromId);
        const toIdx = order.indexOf(toId);
        if (fromIdx < 0 || toIdx < 0) return;
        order.splice(fromIdx, 1);
        order.splice(toIdx, 0, fromId);
        DB.state.dashboardOrder = order;
        DB.save();
        App.refresh();
        App.toast('Ordre enregistré','success');
      });
    });
  },

  renderProactive() {
    const alerts = App.proactiveAlerts();
    if (!alerts.length) return `<p class="muted">Tout est bon. ✔</p>`;
    return `<ul class="list">${alerts.slice(0, 10).map(a => `<li><span class="badge ${a.niveau}">${a.kind}</span> <span>${a.msg}</span></li>`).join('')}</ul>${alerts.length > 10 ? `<p class="muted small">+${alerts.length-10} autre(s)</p>` : ''}`;
  },

  renderPredictions(s) {
    const active = s.projets.filter(p => p.statut === 'en-cours');
    if (!active.length) return `<p class="muted">Aucun projet en cours.</p>`;
    return `<table class="data">
      <thead><tr><th>Projet</th><th>Fin planifiée</th><th>Fin prédite</th><th class="right">Écart</th><th class="right">Vitesse</th></tr></thead>
      <tbody>${active.map(p => {
        const pr = App.predictProjectEnd(p.id);
        if (!pr || !pr.predEnd) return `<tr><td>${p.code}</td><td colspan="4" class="muted">—</td></tr>`;
        const badge = pr.delayDays >= 3 ? 'bad' : pr.delayDays >= 1 ? 'warn' : pr.delayDays <= -1 ? 'good' : 'muted';
        const sign = pr.delayDays > 0 ? '+' : '';
        return `<tr>
          <td><span class="badge" style="background:${p.couleur}22;color:${p.couleur}">${p.code}</span> ${p.nom}</td>
          <td>${D.fmt(p.fin)}</td>
          <td><strong>${D.fmt(pr.predEnd)}</strong></td>
          <td class="right"><span class="badge ${badge}">${sign}${pr.delayDays} j</span></td>
          <td class="right muted">${pr.vitesse}×</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
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
      const jours = tasks.reduce((n,t) => {
        const a = t.debut < today ? today : t.debut;
        const b = t.fin > end ? end : t.fin;
        return n + D.workdaysBetween(a, b);
      }, 0);
      const capa = l.capacite * 5;
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
