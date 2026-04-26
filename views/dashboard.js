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
    'absences':    { title:'🏖 Absences en cours & à venir',                size:1, render(s, today) { return App.views.dashboard.renderAbsences(s, today); } },
    'kpi-velocity':{ title:'📐 Respect des délais',                         size:1, render(s) { return App.views.dashboard.renderVelocity(s); } },
    'top-articles':{ title:'🏷 Top articles (besoins BOM)',                 size:1, render(s) { return App.views.dashboard.renderTopArticles(s); } },
    'avancement-projets': { title:'📊 Avancement par projet',              size:1, render(s) { return App.views.dashboard.renderAvancementProjets(s); } },
    'sante-donnees':      { title:'🩺 Santé des données',                   size:1, render() { return App.views.dashboard.renderIntegrity(); } },
    'flux-machines':      { title:'🔗 Flux machines — état en temps réel',   size:1, render(s, today) { return App.views.dashboard.renderFluxMachines(s, today); } },
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

    const absentsAjd = s.personnes.filter(p => (p.absences||[]).some(a => a.debut <= today && a.fin >= today)).length;
    const projetsRetard = s.projets.filter(p => {
      if (p.statut !== 'en-cours') return false;
      const pr = App.predictProjectEnd(p.id);
      return pr && pr.delayDays >= 3;
    }).length;

    root.innerHTML = `
      <div class="grid grid-4 kpi-grid">
        <div class="kpi"><div class="label">Personnes</div><div class="value">${s.personnes.length}</div><div class="sub">dans ${s.lieux.filter(l=>l.type==='production').length} lieux de production</div></div>
        <div class="kpi ${absentsAjd>0?'warn':''}"><div class="label">Absents aujourd'hui</div><div class="value">${absentsAjd}</div><div class="sub">${s.personnes.length-absentsAjd} dispo</div></div>
        <div class="kpi"><div class="label">Projets en cours</div><div class="value">${projetsEnCours}</div><div class="sub">${s.projets.length} au total</div></div>
        <div class="kpi ${projetsRetard>0?'bad':'good'}"><div class="label">Projets en retard</div><div class="value">${projetsRetard}</div><div class="sub">prédiction +3 j</div></div>
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
        let toIdx = order.indexOf(toId);
        if (fromIdx < 0 || toIdx < 0) return;
        order.splice(fromIdx, 1);
        if (fromIdx < toIdx) toIdx--;
        order.splice(toIdx, 0, fromId);
        DB.state.dashboardOrder = order;
        DB.save();
        // Déplace le nœud DOM directement — évite un re-render complet et le flash
        const fromEl = grid.querySelector(`[data-panel="${fromId}"]`);
        const toEl   = grid.querySelector(`[data-panel="${toId}"]`);
        if (fromEl && toEl) toEl.before(fromEl);
        dragged = null;
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
    const row = (badge, kind, text, view) => `<li class="alert-row" onclick="App.navigateToTarget({view:'${view}'})" role="button" tabindex="0"><span class="badge ${badge}">${kind}</span> <span class="alert-msg">${text}</span> <span class="alert-arrow">›</span></li>`;
    const rows = [];
    if (c.personnes.length) rows.push(row('bad','Personnes',`${c.personnes.length} chevauchement(s) d'affectation`, 'gantt'));
    if (c.machines.length)  rows.push(row('bad','Machines', `${c.machines.length} conflit(s) d'utilisation`, 'machines'));
    if (c.stock.length)     rows.push(row('warn','Stock',   `${c.stock.length} article(s) sous seuil`, 'stock'));
    if (c.commandes.length) rows.push(row('warn','Commandes',`${c.commandes.length} en attente de validations 4A`, 'commandes'));
    return `<ul class="list list-clickable">${rows.join('')}</ul>`;
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
    return `<ul class="list list-clickable">${ts.map(t => {
      const prj = DB.projet(t.projetId);
      const lieu = DB.lieu(t.lieuId);
      const assigns = (t.assignes||[]).map(id => App.personneLabel(DB.personne(id))).join(', ');
      return `<li class="alert-row" onclick="App.navigateToTarget({view:'gantt',tacheId:'${t.id}'})" role="button" tabindex="0">
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

  renderAbsences(s, today) {
    const horizon = D.addWorkdays(today, 9);
    const entries = [];
    s.personnes.forEach(p => (p.absences||[]).forEach(a => {
      if (a.fin >= today && a.debut <= horizon) entries.push({ ...a, p });
    }));
    if (!entries.length) return `<p class="muted">Personne d'absent dans les 10 j ouvrés.</p>`;
    entries.sort((a,b) => a.debut.localeCompare(b.debut));
    return `<ul class="list list-clickable">${entries.slice(0,8).map(e => {
      const encours = e.debut <= today && e.fin >= today;
      return `<li class="alert-row" onclick="App.navigate('absences')" role="button" tabindex="0">
        <div>
          <strong>${App.personneLabel(e.p)}</strong>
          <div class="small muted">${D.fmt(e.debut)} → ${D.fmt(e.fin)} · ${e.motif}${e.note?' · '+e.note:''}</div>
        </div>
        <span class="badge ${encours?'bad':'warn'}">${encours?'en cours':'à venir'}</span>
        <span class="alert-arrow">›</span>
      </li>`;
    }).join('')}</ul>${entries.length>8?`<p class="muted small">+${entries.length-8} autre(s)</p>`:''}`;
  },

  renderVelocity(s) {
    const active = s.projets.filter(p => p.statut === 'en-cours');
    if (!active.length) return `<p class="muted">Aucun projet en cours.</p>`;
    let onTime = 0, late = 0, totalDelay = 0, count = 0;
    active.forEach(p => {
      const pr = App.predictProjectEnd(p.id);
      if (!pr) return;
      count++;
      if (pr.delayDays >= 3) { late++; totalDelay += pr.delayDays; }
      else onTime++;
    });
    if (!count) return `<p class="muted">Pas assez de données pour prédire.</p>`;
    const pct = Math.round(onTime / count * 100);
    const moy = late ? Math.round(totalDelay / late) : 0;
    const cls = pct >= 80 ? 'good' : pct >= 60 ? 'warn' : 'bad';
    return `<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px">
        <div style="flex:1">
          <div class="muted small">Taux respect délais</div>
          <div style="font-size:28px;font-weight:700" class="${cls}">${pct}%</div>
        </div>
        <div style="flex:1">
          <div class="muted small">Retard moyen (retardés)</div>
          <div style="font-size:28px;font-weight:700">${moy} j</div>
        </div>
      </div>
      <div class="bar-inline ${cls}"><div class="fill" style="width:${pct}%"></div></div>
      <div class="small muted" style="margin-top:6px">${onTime} projet(s) à l'heure · ${late} en retard</div>`;
  },

  renderTopArticles(s) {
    const besoins = {};
    s.projets.forEach(p => (p.bom||[]).forEach(l => {
      besoins[l.articleId] = (besoins[l.articleId]||0) + l.quantite;
    }));
    const arts = Object.entries(besoins)
      .map(([aid, qte]) => ({ art: DB.stock(aid), qte }))
      .filter(x => x.art)
      .sort((a,b) => b.qte - a.qte)
      .slice(0, 5);
    if (!arts.length) return `<p class="muted">Aucun besoin BOM défini.</p>`;
    const max = arts[0].qte;
    return `<ul class="list">${arts.map(x => {
      const pct = Math.round(x.qte / max * 100);
      const rupture = x.art.quantite < x.qte;
      return `<li class="alert-row" onclick="App.navigateToTarget({view:'stock',articleId:'${x.art.id}'})" role="button" tabindex="0">
        <div style="flex:1">
          <strong>${x.art.ref}</strong> · ${x.art.nom}
          <div class="small muted">besoin : ${x.qte} ${x.art.unite} · stock : ${x.art.quantite} ${x.art.unite} ${rupture?'<span class="badge bad">rupture</span>':''}</div>
          <div class="bar-inline ${rupture?'bad':'good'}" style="margin-top:4px;height:6px"><div class="fill" style="width:${pct}%"></div></div>
        </div>
        <span class="alert-arrow">›</span>
      </li>`;
    }).join('')}</ul>`;
  },

  renderAvancementProjets(s) {
    const actifs = s.projets.filter(p => p.statut === 'en-cours');
    if (!actifs.length) return `<p class="muted">Aucun projet en cours.</p>`;
    return `<ul class="list" style="padding:0">${actifs.map(p => {
      const taches = s.taches.filter(t => t.projetId === p.id && !t.jalon);
      const total = taches.length;
      if (!total) return '';
      const done = taches.filter(t => t.avancement === 100).length;
      const inProg = taches.filter(t => t.avancement > 0 && t.avancement < 100).length;
      const pct = Math.round(done / total * 100);
      const blendPct = Math.round((done + inProg * 0.5) / total * 100);
      const today = D.today();
      const isLate = taches.some(t => t.fin < today && t.avancement < 100);
      return `<li class="alert-row" onclick="App.navigateToTarget({view:'projets',projetId:'${p.id}'})" role="button" tabindex="0" style="display:block;padding:8px 10px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
          <span><span class="badge" style="background:${p.couleur}22;color:${p.couleur}">${p.code}</span> <strong>${p.nom}</strong>${isLate?' <span class="badge bad" style="font-size:9px">retard</span>':''}</span>
          <span class="small mono" style="margin-left:8px">${pct}%</span>
        </div>
        <div style="position:relative;height:8px;background:var(--surface-2);border-radius:4px;overflow:hidden">
          <div style="position:absolute;left:0;top:0;bottom:0;width:${blendPct}%;background:${p.couleur};opacity:.3;border-radius:4px"></div>
          <div style="position:absolute;left:0;top:0;bottom:0;width:${pct}%;background:${p.couleur};border-radius:4px"></div>
        </div>
        <div class="small muted" style="margin-top:3px">${done}/${total} terminées · ${inProg} en cours · fin ${D.fmt(p.fin)}</div>
      </li>`;
    }).join('')}</ul>`;
  },

  renderIntegrity() {
    const issues = DB.checkIntegrity();
    if (!issues.length) {
      return `<p style="color:var(--green,#22a55a);font-weight:600">✔ Données cohérentes</p>`;
    }

    const viewForEntity = { tache: 'gantt', personne: 'personnes', absence: 'absences', stock: 'stock' };
    const badgeClass = { error: 'bad', warn: 'warn', info: 'info' };
    const typeLabel  = { error: 'Erreur', warn: 'Alerte', info: 'Info' };

    const rows = issues.map(issue => {
      const view = viewForEntity[issue.entity] || 'gantt';
      const navTarget = issue.entity === 'tache'
        ? `App.navigateToTarget({view:'${view}',tacheId:'${issue.id}'})`
        : `App.navigate('${view}')`;
      return `<li class="alert-row" onclick="${navTarget}" role="button" tabindex="0">
        <span class="badge ${badgeClass[issue.type]||'muted'}">${typeLabel[issue.type]||issue.type}</span>
        <span class="alert-msg">${issue.msg}</span>
        <span class="alert-arrow">›</span>
      </li>`;
    });

    const autoFix = () => {
      if (!confirm(`Corriger automatiquement ${issues.length} problème(s) ?\n\nLes références invalides (assignés, dépendances, lieu, machine) seront supprimées des tâches concernées. Cette action est irréversible (sauf Undo).`)) return;
      const s = DB.state;
      const personneIds = new Set(s.personnes.map(p => p.id));
      const lieuIds     = new Set(s.lieux.map(l => l.id));
      const machineIds  = new Set(s.machines.map(m => m.id));
      const tacheIds    = new Set(s.taches.map(t => t.id));
      s.taches.forEach(t => {
        t.assignes    = (t.assignes||[]).filter(pid => personneIds.has(pid));
        t.dependances = (t.dependances||[]).filter(did => tacheIds.has(did));
        if (t.lieuId    && !lieuIds.has(t.lieuId))     t.lieuId    = null;
        if (t.machineId && !machineIds.has(t.machineId)) t.machineId = null;
      });
      DB.save();
      App.refresh();
      App.toast('Références invalides supprimées','success');
    };
    // Expose the fix function so the inline button can call it
    App.views.dashboard._autoFix = autoFix;

    const summary = issues.filter(i => i.type === 'error').length + ' erreur(s), '
      + issues.filter(i => i.type === 'warn').length + ' alerte(s), '
      + issues.filter(i => i.type === 'info').length + ' info(s)';

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span class="small muted">${summary}</span>
        <button class="btn-ghost" style="padding:2px 10px" onclick="App.views.dashboard._autoFix()">🔧 Corriger auto</button>
      </div>
      <ul class="list list-clickable">${rows.join('')}</ul>
      ${issues.length > 12 ? `<p class="muted small">+${issues.length - 12} autre(s) — corrige pour voir la liste complète</p>` : ''}
    `;
  },

  renderFluxMachines(s, today) {
    const machines = s.machines || [];
    if (!machines.length) return `<p class="muted small">Aucune machine configurée. <a href="#" onclick="App.navigate('machines');return false">Configurer →</a></p>`;

    const status = m => {
      const taches = (s.taches || []).filter(t => t.machineId === m.id);
      const running = taches.filter(t => t.debut <= today && t.fin >= today && t.avancement < 100);
      const late    = taches.filter(t => t.fin < today && t.avancement < 100);
      if (running.length > 1) return { c: '#dc2626', l: 'Surchargé',  t: running[0] };
      if (late.length)         return { c: '#f59e0b', l: 'En retard',  t: late[0]    };
      if (running.length)      return { c: '#2c5fb3', l: 'En cours',   t: running[0] };
      return                          { c: '#059669', l: 'Libre',      t: null        };
    };

    const rows = machines.slice(0, 12).map(m => {
      const st = status(m);
      return `<li class="alert-row" onclick="App.views.flux.state.projet='';App.navigate('flux')" role="button" tabindex="0"
          style="display:flex;align-items:center;gap:8px;padding:6px 10px">
        <span style="color:${st.c};font-size:14px;flex-shrink:0">●</span>
        <span style="flex:1;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.nom}</span>
        <span style="font-size:11px;color:${st.c};flex-shrink:0">${st.l}</span>
        ${st.t ? `<span class="muted" style="font-size:10px;flex-shrink:0;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${st.t.nom}</span>` : ''}
      </li>`;
    });

    const counts = machines.reduce((a, m) => { a[status(m).l] = (a[status(m).l]||0)+1; return a; }, {});
    return `
      <div style="display:flex;gap:12px;margin-bottom:10px;flex-wrap:wrap">
        ${[['#059669','Libre'],['#2c5fb3','En cours'],['#f59e0b','En retard'],['#dc2626','Surchargé']].map(([c,l]) =>
          `<span style="font-size:12px;color:${c}">● ${l} <strong>${counts[l]||0}</strong></span>`).join('')}
      </div>
      <ul class="list list-clickable">${rows.join('')}</ul>
      ${machines.length > 12 ? `<p class="muted small">${machines.length - 12} machine(s) supplémentaires</p>` : ''}
      <div style="margin-top:8px"><button class="btn-ghost" onclick="App.navigate('flux')" style="font-size:12px">🔗 Ouvrir la vue Flux →</button></div>
    `;
  },
};
