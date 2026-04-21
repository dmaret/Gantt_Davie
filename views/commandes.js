App.views.commandes = {
  render(root) {
    const s = DB.state;
    root.innerHTML = `
      <div class="toolbar">
        <strong>Commandes</strong>
        <span class="muted small">Règle « ${s.regle4A.libelle} » : engagement bloqué tant que les ${s.regle4A.axes.length} axes ne sont pas tous validés.</span>
        <span class="spacer"></span>
        <button class="btn" id="c-add">+ Nouvelle commande</button>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3>Axes de validation</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${s.regle4A.axes.map(a => `<span class="chip"><strong>${a.code}</strong> · ${a.nom}${a.obligatoire?' ·  obligatoire':''}</span>`).join('')}
        </div>
      </div>

      <div class="card"><div id="c-table"></div></div>
    `;
    document.getElementById('c-add').onclick = () => this.openForm(null);
    this.draw();
  },
  draw() {
    const s = DB.state;
    const rows = s.commandes.slice().sort((a,b)=>b.dateDemande.localeCompare(a.dateDemande)).map(c => {
      const prj = DB.projet(c.projetId);
      const axes = s.regle4A.axes;
      const validCount = axes.filter(a => c.validations[a.code]).length;
      const pct = Math.round(validCount / axes.length * 100);
      const blocked = validCount < axes.length && c.statut !== 'brouillon';
      const cellAxe = a => {
        const ok = c.validations[a.code];
        return `<td style="text-align:center"><button class="btn-ghost axe-tg" data-cmd="${c.id}" data-axe="${a.code}" title="${a.nom}" style="padding:2px 8px">${ok?'<span class="badge good">✓</span>':'<span class="badge muted">·</span>'}</button></td>`;
      };
      const statutBadge = c.statut==='engagée' ? 'good' : c.statut==='en-attente' ? 'warn' : 'muted';
      return `<tr data-id="${c.id}">
        <td class="mono">${c.ref}</td>
        <td>${c.fournisseur}</td>
        <td>${prj?`<span class="badge" style="background:${prj.couleur}22;color:${prj.couleur}">${prj.code}</span>`:'—'}</td>
        <td class="right">${c.montant.toLocaleString('fr-CH')} CHF</td>
        <td class="mono small">${D.fmt(c.dateDemande)}</td>
        ${axes.map(cellAxe).join('')}
        <td><div class="bar-inline ${pct<100?'warn':''}"><div class="fill" style="width:${pct}%;background:${pct===100?'var(--success)':'var(--warning)'}"></div></div></td>
        <td><span class="badge ${statutBadge}">${c.statut}</span></td>
        <td>
          ${validCount===axes.length && c.statut!=='engagée' ? `<button class="btn" data-engage="${c.id}" style="padding:4px 10px">Engager</button>` : ''}
          ${blocked ? `<span class="badge bad small">bloquée</span>` : ''}
          <button class="btn btn-secondary" data-edit="${c.id}" style="padding:4px 10px;margin-left:4px">✎</button>
        </td>
      </tr>`;
    }).join('');
    document.getElementById('c-table').innerHTML = `
      <table class="data">
        <thead><tr>
          <th>Réf</th><th>Fournisseur</th><th>Projet</th><th class="right">Montant</th><th>Demande</th>
          ${DB.state.regle4A.axes.map(a=>`<th title="${a.nom}">${a.code}</th>`).join('')}
          <th>Progression</th><th>Statut</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    document.querySelectorAll('.axe-tg').forEach(b => b.onclick = () => {
      const c = DB.state.commandes.find(x => x.id === b.dataset.cmd);
      c.validations[b.dataset.axe] = !c.validations[b.dataset.axe];
      const axes = DB.state.regle4A.axes;
      if (axes.every(a => c.validations[a.code])) {
        if (c.statut === 'brouillon') c.statut = 'en-attente';
      } else if (c.statut === 'engagée') {
        // invalidation after engagement
        c.statut = 'en-attente';
      } else if (c.statut === 'en-attente' && Object.values(c.validations).every(v=>!v)) {
        c.statut = 'brouillon';
      }
      DB.save(); this.draw();
    });
    document.querySelectorAll('[data-engage]').forEach(b => b.onclick = () => {
      const c = DB.state.commandes.find(x => x.id === b.dataset.engage);
      const axes = DB.state.regle4A.axes;
      const missing = axes.filter(a => !c.validations[a.code]);
      if (missing.length) { App.toast(`Bloqué · manque ${missing.map(a=>a.code).join(', ')}`, 'error'); return; }
      c.statut = 'engagée';
      DB.save(); this.draw();
      App.toast(`Commande ${c.ref} engagée`,'success');
    });
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => this.openForm(b.dataset.edit));
  },
  openForm(id) {
    const isNew = !id;
    const s = DB.state;
    const c = id ? s.commandes.find(x => x.id === id) : {
      id: DB.uid('CMD'), ref:'CMD-'+ new Date().getFullYear() + '-' + String(s.commandes.length+1).padStart(3,'0'),
      fournisseur:'', projetId: s.projets[0].id, montant:0, dateDemande: D.today(),
      validations:{A1:false,A2:false,A3:false,A4:false}, statut:'brouillon', lignes:[]
    };
    const body = `
      <div class="row">
        <div class="field"><label>Référence</label><input id="cf-ref" value="${c.ref}"></div>
        <div class="field"><label>Date demande</label><input type="date" id="cf-date" value="${c.dateDemande}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Fournisseur</label><input id="cf-four" value="${c.fournisseur||''}"></div>
        <div class="field"><label>Montant (CHF)</label><input type="number" id="cf-mont" value="${c.montant||0}"></div>
      </div>
      <div class="field"><label>Projet</label>
        <select id="cf-prj">${s.projets.map(p=>`<option value="${p.id}" ${p.id===c.projetId?'selected':''}>${p.code} — ${p.nom}</option>`).join('')}</select>
      </div>
      <h3 style="margin-top:10px">Lignes</h3>
      <div id="cf-lignes">${(c.lignes||[]).map((l,i)=>this.ligneRow(l,i)).join('')}</div>
      <button class="btn btn-secondary" id="cf-add-ligne" style="margin-top:6px">+ Ligne</button>
      <h3 style="margin-top:14px">Validations 4A</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${s.regle4A.axes.map(a => `<label class="chip"><input type="checkbox" data-axe="${a.code}" ${c.validations[a.code]?'checked':''}> ${a.code} · ${a.nom}</label>`).join('')}
      </div>
    `;
    const foot = `${!isNew?'<button class="btn btn-danger" id="cf-del">Supprimer</button>':''}<span class="spacer" style="flex:1"></span>
      <button class="btn btn-secondary" id="cf-cancel">Annuler</button>
      <button class="btn" id="cf-save">${isNew?'Créer':'Enregistrer'}</button>`;
    App.openModal(isNew?'Nouvelle commande':c.ref, body, foot);

    const lignesEl = document.getElementById('cf-lignes');
    document.getElementById('cf-add-ligne').onclick = () => {
      const idx = (c.lignes||[]).length;
      c.lignes = c.lignes || [];
      c.lignes.push({ articleId: s.stock[0].id, qte: 1 });
      lignesEl.insertAdjacentHTML('beforeend', this.ligneRow(c.lignes[idx], idx));
    };
    document.getElementById('cf-cancel').onclick = () => App.closeModal();
    document.getElementById('cf-save').onclick = () => {
      c.ref = document.getElementById('cf-ref').value.trim();
      c.dateDemande = document.getElementById('cf-date').value;
      c.fournisseur = document.getElementById('cf-four').value.trim();
      c.montant = +document.getElementById('cf-mont').value;
      c.projetId = document.getElementById('cf-prj').value;
      document.querySelectorAll('[data-axe]').forEach(cb => c.validations[cb.dataset.axe] = cb.checked);
      // Collect lines
      const lignes = [];
      document.querySelectorAll('.ligne-row').forEach(row => {
        const aid = row.querySelector('[data-k="art"]').value;
        const qte = +row.querySelector('[data-k="qte"]').value;
        if (aid && qte > 0) lignes.push({ articleId: aid, qte });
      });
      c.lignes = lignes;
      if (!c.ref || !c.fournisseur) { App.toast('Réf et fournisseur requis','error'); return; }
      if (isNew) s.commandes.push(c);
      DB.save(); App.closeModal(); App.refresh();
    };
    if (!isNew) document.getElementById('cf-del').onclick = () => {
      if (!confirm('Supprimer ?')) return;
      s.commandes = s.commandes.filter(x => x.id !== c.id);
      DB.save(); App.closeModal(); App.refresh();
    };
  },
  ligneRow(l, i) {
    const s = DB.state;
    return `<div class="ligne-row row" style="align-items:end;margin-bottom:6px">
      <div class="field" style="flex:3"><label>Article</label>
        <select data-k="art">${s.stock.map(x => `<option value="${x.id}" ${x.id===l.articleId?'selected':''}>${x.ref} — ${x.nom}</option>`).join('')}</select>
      </div>
      <div class="field" style="flex:1"><label>Qté</label><input type="number" data-k="qte" value="${l.qte}" min="0"></div>
      <button class="btn-ghost" onclick="this.parentElement.remove()" style="margin-bottom:10px">✕</button>
    </div>`;
  },
};
