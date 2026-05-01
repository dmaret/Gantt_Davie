App.views.whatif = {
  SNAP_KEY: 'atelier_plan_v3_snapshot',
  HISTORY_KEY: 'atelier_plan_v3_validations',
  render(root) {
    const hasSnap = !!localStorage.getItem(this.SNAP_KEY);
    root.innerHTML = `
      <div class="toolbar">
        <strong>Simulation what-if</strong>
        <span class="spacer"></span>
        ${hasSnap ? '<button class="btn btn-danger" id="wi-reset">↶ Rejeter et revenir au snapshot</button><button class="btn btn-success" id="wi-commit">✓ Valider les changements</button>' : '<button class="btn" id="wi-start">⎘ Prendre un snapshot et simuler</button>'}
      </div>
      <div class="card">
        <h2>Principe</h2>
        <p>Cette vue permet de <strong>tester un changement</strong> sans risque :</p>
        <ol>
          <li>Cliquer sur « Prendre un snapshot » : l'état actuel est sauvegardé.</li>
          <li>Modifier librement le planning (Gantt, stock, commandes...) dans les autres vues.</li>
          <li>Revenir ici pour voir le <strong>diff</strong> et :
            <ul>
              <li><strong>Valider</strong> : les changements deviennent définitifs.</li>
              <li><strong>Rejeter</strong> : on revient à l'état du snapshot.</li>
            </ul>
          </li>
        </ol>
        ${hasSnap ? (() => { try { const sd = JSON.parse(localStorage.getItem(this.SNAP_KEY) || '{}')._snapDate; return '<div class="badge warn" style="margin-top:10px">Simulation en cours. Snapshot pris le ' + new Date(sd || Date.now()).toLocaleString('fr-CH') + '</div>'; } catch(e) { return '<div class="badge bad">Snapshot corrompu</div>'; } })() : ''}
      </div>
      ${hasSnap ? '<div class="card" style="margin-top:14px"><h2>Différences</h2><div id="wi-diff"></div></div>' : ''}
      ${this.renderHistory()}
    `;
    if (hasSnap) {
      this.drawDiff();
      document.getElementById('wi-reset').onclick = () => {
        if (!confirm('Rejeter toutes les modifications et revenir au snapshot ?')) return;
        const snap = JSON.parse(localStorage.getItem(this.SNAP_KEY));
        delete snap._snapDate;
        DB.state = snap;
        DB.save();
        this.addToHistory({ action: 'reject', date: new Date().toISOString(), diff: document.getElementById('wi-diff')?.textContent });
        localStorage.removeItem(this.SNAP_KEY);
        App.toast('Snapshot restauré','info');
        App.refresh();
      };
      document.getElementById('wi-commit').onclick = () => {
        if (!confirm('Valider définitivement ces changements ?')) return;
        this.addToHistory({ action: 'accept', date: new Date().toISOString(), diff: document.getElementById('wi-diff')?.textContent });
        localStorage.removeItem(this.SNAP_KEY);
        App.toast('Changements validés','success');
        App.refresh();
      };
    } else {
      document.getElementById('wi-start').onclick = () => {
        const snap = JSON.parse(JSON.stringify(DB.state));
        snap._snapDate = new Date().toISOString();
        localStorage.setItem(this.SNAP_KEY, JSON.stringify(snap));
        App.toast('Snapshot pris. Modifiez librement.','success');
        App.refresh();
      };
    }
  },
  renderHistory() {
    const history = this.getHistory();
    if (!history.length) return '';
    return `<div class="card" style="margin-top:14px">
      <h2>Historique des validations / rejets</h2>
      <ul class="list">
        ${history.slice().reverse().map(h => `
          <li>
            <span class="badge ${h.action === 'accept' ? 'good' : 'bad'}">${h.action === 'accept' ? '✓' : '↶'}</span>
            <strong>${h.action === 'accept' ? 'Validé' : 'Rejeté'}</strong>
            <span class="muted small" style="margin-left:8px">${new Date(h.date).toLocaleString('fr-CH')}</span>
          </li>
        `).join('')}
      </ul>
    </div>`;
  },
  addToHistory(entry) {
    const history = this.getHistory();
    history.push(entry);
    localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
  },
  getHistory() {
    try {
      return JSON.parse(localStorage.getItem(this.HISTORY_KEY) || '[]');
    } catch {
      return [];
    }
  },
  drawDiff() {
    const snap = JSON.parse(localStorage.getItem(this.SNAP_KEY));
    const cur = DB.state;
    const diff = {
      taches: this.diffSet(snap.taches || [], cur.taches || [], 'id'),
      commandes: this.diffSet(snap.commandes || [], cur.commandes || [], 'id'),
      stock: this.diffSet(snap.stock || [], cur.stock || [], 'id'),
      projets: this.diffSet(snap.projets || [], cur.projets || [], 'id'),
    };
    const sections = Object.entries(diff).map(([k, d]) => {
      if (!d.added.length && !d.removed.length && !d.modified.length) return '';
      return `<h3>${k} (${d.added.length} ajoutée(s), ${d.removed.length} supprimée(s), ${d.modified.length} modifiée(s))</h3>
        <ul class="list">
          ${d.added.map(x => `<li><span class="badge good">+</span> <strong>${App.escapeHTML(this.labelOf(k,x))}</strong></li>`).join('')}
          ${d.removed.map(x => `<li><span class="badge bad">−</span> ${App.escapeHTML(this.labelOf(k,x))}</li>`).join('')}
          ${d.modified.map(m => `<li><span class="badge warn">~</span> <strong>${App.escapeHTML(this.labelOf(k,m.new))}</strong><div class="small muted">${m.fields.map(f => `${App.escapeHTML(f.k)}: ${App.escapeHTML(f.a)} → ${App.escapeHTML(f.b)}`).join(' · ')}</div></li>`).join('')}
        </ul>`;
    }).join('');
    document.getElementById('wi-diff').innerHTML = sections || '<p class="muted">Aucune différence détectée.</p>';
  },
  diffSet(a, b, key) {
    const ai = Object.fromEntries((a || []).map(x => [x[key], x]));
    const bi = Object.fromEntries((b || []).map(x => [x[key], x]));
    const added = (b || []).filter(x => !ai[x[key]]);
    const removed = (a || []).filter(x => !bi[x[key]]);
    const modified = [];
    for (const id in bi) {
      if (!ai[id]) continue;
      const oa = ai[id], ob = bi[id];
      const fields = [];
      const keys = new Set([...Object.keys(oa), ...Object.keys(ob)]);
      for (const k of keys) {
        const va = JSON.stringify(oa[k]), vb = JSON.stringify(ob[k]);
        if (va !== vb) fields.push({ k, a: va, b: vb });
      }
      if (fields.length) modified.push({ new: ob, fields });
    }
    return { added, removed, modified };
  },
  labelOf(kind, x) {
    if (kind === 'taches') return x.nom + ' · ' + x.debut + '→' + x.fin;
    if (kind === 'commandes') return x.ref + ' · ' + x.fournisseur;
    if (kind === 'stock') return x.ref + ' · ' + x.nom;
    if (kind === 'projets') return x.code + ' · ' + x.nom;
    return x.id;
  },
};
