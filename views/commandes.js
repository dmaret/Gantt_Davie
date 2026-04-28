App.views.commandes = {
  render(root) {
    const s = DB.state;
    root.innerHTML = `
      <div class="toolbar">
        <strong>Commandes</strong>
        <span class="muted small">Règle « ${s.regle4A.libelle} » : engagement bloqué tant que les ${s.regle4A.axes.length} axes ne sont pas tous validés.</span>
        <span class="spacer"></span>
        <input type="file" id="c-import-file" accept=".csv,.json" hidden>
        <button class="btn-ghost" id="c-tpl" data-perm="admin">⬇ Modèle</button>
        <button class="btn-ghost" id="c-import" data-perm="admin">⬆ Importer</button>
        <button class="btn-ghost" id="c-csv">⤓ Exporter CSV</button>
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
    document.getElementById('c-csv').onclick = () => this.exportCSV();
    document.getElementById('c-tpl').onclick = () => this.downloadTemplate();
    document.getElementById('c-import').onclick = () => document.getElementById('c-import-file').click();
    document.getElementById('c-import-file').onchange = e => { if (e.target.files[0]) this.importFile(e.target.files[0]); e.target.value = ''; };
    this.draw();
  },
  migrate(c) {
    if (c.montantHT === undefined) { c.montantHT = c.montant || 0; }
    if (c.tauxTVA === undefined) { c.tauxTVA = 8.1; }
    if (!c.validationLog) c.validationLog = [];
    return c;
  },
  currentUser() { return App.currentUser().nom; },
  draw() {
    const s = DB.state;
    s.commandes.forEach(c => this.migrate(c));
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
      const tva = Money.tva(c.montantHT, c.tauxTVA);
      const ttc = Money.ttc(c.montantHT, c.tauxTVA);
      return `<tr data-id="${c.id}">
        <td class="mono">${c.ref}</td>
        <td>${c.fournisseur}</td>
        <td>${prj?`<span class="badge" style="background:${prj.couleur}22;color:${prj.couleur}">${prj.code}</span>`:'—'}</td>
        <td class="right">${Money.chf(c.montantHT)}</td>
        <td class="right muted small">${c.tauxTVA}% · ${Money.chf(tva)}</td>
        <td class="right"><strong>${Money.chf(ttc)}</strong></td>
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
      <div class="tbl-wrap"><table class="data col-freeze-1">
        <thead><tr>
          <th>Réf</th><th>Fournisseur</th><th>Projet</th>
          <th class="right">HT</th><th class="right">TVA</th><th class="right">TTC</th>
          <th>Demande</th>
          ${DB.state.regle4A.axes.map(a=>`<th title="${a.nom}">${a.code}</th>`).join('')}
          <th>Progression</th><th>Statut</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    `;
    document.querySelectorAll('.axe-tg').forEach(b => b.onclick = () => {
      const c = DB.state.commandes.find(x => x.id === b.dataset.cmd);
      this.migrate(c);
      const axe = b.dataset.axe;
      if (!App.canSignAxe(axe)) {
        App.toast(`${App.currentUser().nom} n'est pas autorisé·e à signer ${axe}`, 'error');
        return;
      }
      c.validations[axe] = !c.validations[axe];
      c.validationLog.push({ axe, action: c.validations[axe]?'validé':'invalidé', valideur: this.currentUser(), date: new Date().toISOString() });
      const axes = DB.state.regle4A.axes;
      if (axes.every(a => c.validations[a.code])) {
        if (c.statut === 'brouillon') c.statut = 'en-attente';
      } else if (c.statut === 'engagée') {
        c.statut = 'en-attente';
      } else if (c.statut === 'en-attente' && Object.values(c.validations).every(v=>!v)) {
        c.statut = 'brouillon';
      }
      DB.save(); this.draw();
    });
    document.querySelectorAll('[data-engage]').forEach(b => b.onclick = () => {
      const c = DB.state.commandes.find(x => x.id === b.dataset.engage);
      this.migrate(c);
      const axes = DB.state.regle4A.axes;
      const missing = axes.filter(a => !c.validations[a.code]);
      if (missing.length) { App.toast(`Bloqué · manque ${missing.map(a=>a.code).join(', ')}`, 'error'); return; }
      c.statut = 'engagée';
      c.validationLog.push({ axe: '—', action: 'engagement', valideur: this.currentUser(), date: new Date().toISOString() });
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
        <div class="field"><label>Montant HT (CHF)</label><input type="number" step="0.01" id="cf-ht" value="${c.montantHT||0}"></div>
        <div class="field"><label>Taux TVA (%)</label><input type="number" step="0.1" id="cf-tva" value="${c.tauxTVA!==undefined?c.tauxTVA:8.1}"></div>
      </div>
      <div class="muted small" id="cf-ttc-line" style="margin:-6px 0 10px 0">TVA · TTC calculés automatiquement</div>
      <div class="field"><label>Projet</label>
        <select id="cf-prj">${App.projetsOptions(c.projetId, '— Aucun projet —')}</select>
      </div>
      <h3 style="margin-top:10px">Lignes</h3>
      <div id="cf-lignes">${(c.lignes||[]).map((l,i)=>this.ligneRow(l,i)).join('')}</div>
      <button class="btn btn-secondary" id="cf-add-ligne" style="margin-top:6px">+ Ligne</button>
      <h3 style="margin-top:14px">Validations 4A <span class="muted small">· utilisateur courant <strong>${this.currentUser()}</strong> (modifiable dans la topbar)</span></h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${s.regle4A.axes.map(a => {
          const ok = App.canSignAxe(a.code);
          return `<label class="chip" title="${ok?'Autorisé':'Non autorisé pour cet utilisateur'}" style="${ok?'':'opacity:.45'}"><input type="checkbox" data-axe="${a.code}" ${c.validations[a.code]?'checked':''} ${ok?'':'disabled'}> ${a.code} · ${a.nom}</label>`;
        }).join('')}
      </div>
      ${(c.validationLog||[]).length ? `<h3 style="margin-top:14px">Historique (${c.validationLog.length})</h3>
      <ul class="list" style="max-height:160px;overflow:auto">${c.validationLog.slice().reverse().map(l => `<li style="font-size:12px"><div><strong>${l.axe}</strong> · ${l.action}</div><div class="muted small">${l.valideur} · ${new Date(l.date).toLocaleString('fr-CH')}</div></li>`).join('')}</ul>` : ''}
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
    const refreshTTC = () => {
      const ht = +document.getElementById('cf-ht').value;
      const taux = +document.getElementById('cf-tva').value;
      document.getElementById('cf-ttc-line').textContent = `TVA ${taux}% = ${Money.chf(Money.tva(ht,taux))} · TTC = ${Money.chf(Money.ttc(ht,taux))}`;
    };
    document.getElementById('cf-ht').oninput = refreshTTC;
    document.getElementById('cf-tva').oninput = refreshTTC;
    refreshTTC();
    document.getElementById('cf-cancel').onclick = () => App.closeModal();
    document.getElementById('cf-save').onclick = () => {
      c.ref = document.getElementById('cf-ref').value.trim();
      c.dateDemande = document.getElementById('cf-date').value;
      c.fournisseur = document.getElementById('cf-four').value.trim();
      c.montantHT = +document.getElementById('cf-ht').value;
      c.tauxTVA = +document.getElementById('cf-tva').value;
      delete c.montant; // ancienne clé obsolète
      c.projetId = document.getElementById('cf-prj').value;
      document.querySelectorAll('#modal-body input[data-axe]').forEach(cb => {
        const axe = cb.dataset.axe;
        const before = !!c.validations[axe];
        const after = cb.checked;
        if (before !== after) {
          if (!App.canSignAxe(axe)) { App.toast(`Axe ${axe} non modifiable par ${App.currentUser().nom}`, 'error'); return; }
          c.validations[axe] = after;
          c.validationLog.push({ axe, action: after?'validé':'invalidé', valideur: this.currentUser(), date: new Date().toISOString() });
        }
      });
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
  downloadTemplate() {
    CSV.download('modele-import-commandes.csv', [
      ['Référence','Fournisseur','Projet (code)','Montant HT','Taux TVA (%)'],
      ['CMD-2026-010','Fournisseur SA','PRJ-A','5000','8.1'],
    ]);
  },

  importFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        let text = e.target.result;
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const sep = text.includes(';') ? ';' : ',';
        const norm = s => (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const hdrs = lines[0].split(sep).map(h => norm(h.replace(/^"|"$/g,'')));
        const rows = lines.slice(1).map(l => {
          const v = l.split(sep).map(c => c.trim().replace(/^"|"$/g,''));
          const o = {}; hdrs.forEach((h,i) => o[h] = v[i]||''); return o;
        }).filter(r => Object.values(r).some(v => v));
        const s = DB.state;
        const parsed = rows.map(r => {
          const ref = r['reference'] || r['référence'] || r['ref'] || '';
          const fournisseur = r['fournisseur'] || '';
          const pCode = norm(r['projet (code)'] || r['projet'] || '');
          const prj = s.projets.find(p => norm(p.code) === pCode);
          const montantHT = parseFloat(r['montant ht'] || r['montant'] || 0);
          const tauxTVA = parseFloat(r['taux tva (%)'] || r['taux tva'] || r['tva'] || 8.1);
          const existing = s.commandes.find(c => c.ref === ref);
          const errors = [];
          if (!ref) errors.push('référence manquante');
          if (!fournisseur) errors.push('fournisseur manquant');
          return { ref, fournisseur, prj, montantHT, tauxTVA, existing, errors };
        }).filter(r => r.ref || r.fournisseur);
        if (!parsed.length) { App.toast('Aucune commande à importer','warn'); return; }
        const body = `<p class="muted small">${parsed.filter(r=>!r.existing&&!r.errors.length).length} à créer · ${parsed.filter(r=>r.existing).length} à màj · ${parsed.filter(r=>r.errors.length).length} erreur(s)</p>
          <table class="data"><thead><tr><th>Réf</th><th>Fournisseur</th><th>Projet</th><th class="right">HT</th><th>Statut</th></tr></thead><tbody>
          ${parsed.map(r => `<tr>
            <td class="mono">${r.ref}</td><td>${r.fournisseur}</td>
            <td>${r.prj?r.prj.code:'<span class="muted">—</span>'}</td>
            <td class="right">${r.montantHT}</td>
            <td>${r.errors.length?`<span class="badge bad">${r.errors.join(', ')}</span>`:r.existing?'<span class="badge warn">màj</span>':'<span class="badge good">nouveau</span>'}</td>
          </tr>`).join('')}
          </tbody></table>`;
        const importable = parsed.filter(r => !r.errors.length);
        const foot = `<button class="btn btn-secondary" onclick="App.closeModal()">Annuler</button>
          <button class="btn" id="c-import-ok">Importer (${importable.length})</button>`;
        App.openModal('Aperçu import — Commandes', body, foot);
        document.getElementById('c-import-ok').onclick = () => {
          let created = 0, updated = 0;
          importable.forEach(r => {
            if (r.existing) {
              if (r.fournisseur) r.existing.fournisseur = r.fournisseur;
              if (r.montantHT) r.existing.montantHT = r.montantHT;
              if (r.prj) r.existing.projetId = r.prj.id;
              r.existing.tauxTVA = r.tauxTVA;
              DB.logAudit('update','commande',r.existing.id,r.ref+' (import)');
              updated++;
            } else {
              const axes = s.regle4A?.axes || [];
              const validations = {}; axes.forEach(a => validations[a.code] = false);
              const cmd = { id: DB.uid('CMD'), ref: r.ref, fournisseur: r.fournisseur, projetId: r.prj?.id||null, montantHT: r.montantHT, tauxTVA: r.tauxTVA, dateDemande: D.today(), validations, statut:'brouillon', lignes:[] };
              s.commandes.push(cmd);
              DB.logAudit('create','commande',cmd.id,cmd.ref+' (import)');
              created++;
            }
          });
          DB.save(); App.closeModal(); App.refresh();
          App.toast(`${created} créée(s) · ${updated} mise(s) à jour`, 'success');
        };
      } catch(err) { App.toast('Erreur : ' + err.message, 'error'); }
    };
    reader.readAsText(file, 'UTF-8');
  },

  exportCSV() {
    const s = DB.state;
    const head = ['Réf','Fournisseur','Projet','Date demande','Montant HT','Taux TVA','TVA','TTC','Statut','A1','A2','A3','A4','Bloquée'];
    const rows = [head];
    s.commandes.forEach(c => {
      this.migrate(c);
      const prj = DB.projet(c.projetId);
      const axes = s.regle4A.axes;
      const blocked = axes.some(a => !c.validations[a.code]) && c.statut !== 'brouillon';
      rows.push([
        c.ref, c.fournisseur, prj?prj.code:'', c.dateDemande,
        c.montantHT, c.tauxTVA, Money.tva(c.montantHT,c.tauxTVA), Money.ttc(c.montantHT,c.tauxTVA),
        c.statut,
        c.validations.A1?'OUI':'', c.validations.A2?'OUI':'', c.validations.A3?'OUI':'', c.validations.A4?'OUI':'',
        blocked?'OUI':''
      ]);
    });
    CSV.download('commandes-' + D.today() + '.csv', rows);
    App.toast('Export CSV téléchargé','success');
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
