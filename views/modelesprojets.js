// Vue Modèles de projet — séquences d'étapes avec gestes chiffrés, instanciation en 1 clic
App.views.modelesprojets = {
  newItem() { this.openForm(null); },

  render(root) {
    const s = DB.state;
    const mps = s.modelesProjets || [];
    const canEdit = App.can('edit');
    root.innerHTML = `
      <div class="toolbar">
        <strong>🗂 Modèles de projet</strong>
        <span class="muted small">Séquences d'étapes réutilisables — instanciez un modèle pour créer toutes les tâches d'un projet en une fois</span>
        <span class="spacer"></span>
        ${canEdit ? '<button class="btn" id="mp-add">+ Nouveau modèle</button>' : ''}
      </div>
      <div class="grid grid-3">
        ${mps.length ? mps.map(mp => this.renderCard(mp)).join('') : '<p class="muted">Aucun modèle de projet. Cliquez sur « + Nouveau modèle » pour commencer.</p>'}
      </div>
    `;
    if (canEdit) {
      const btn = document.getElementById('mp-add');
      if (btn) btn.onclick = () => this.openForm(null);
    }
    root.querySelectorAll('.mpp-edit').forEach(b => b.onclick = () => this.openForm(b.dataset.id));
    root.querySelectorAll('.mpp-use').forEach(b => b.onclick = () => this.instancier(b.dataset.id));
  },

  renderCard(mp) {
    const cats = [...new Set((mp.etapes || []).flatMap(e => e.gestes || []).map(code => {
      const g = DB.CATALOGUE_GESTES.find(x => x.code === code);
      return g ? g.categorie : null;
    }).filter(Boolean))];
    const totalSec = (mp.etapes || []).reduce((s, e) => {
      return s + (e.gestes || []).reduce((n, code) => n + DB.tempsGeste(code), 0);
    }, 0);
    const dureeTotal = (mp.etapes || []).reduce((n, e) => n + (e.duree || 0), 0);
    return `<div class="card" style="border-left:4px solid ${mp.couleur || '#888'}">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
        <div>
          <h3 style="margin:0 0 4px">${mp.nom}</h3>
          <div class="muted small">${mp.description || ''}</div>
          ${mp.groupe ? `<span class="badge" style="margin-top:4px;display:inline-block;background:var(--primary-light,#dbeafe);color:var(--primary,#2563eb);font-size:10px">${mp.groupe}</span>` : ''}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div class="small" style="font-weight:600">${dureeTotal} j.o.</div>
          <div class="muted small">${(mp.etapes || []).length} étapes</div>
        </div>
      </div>
      <div style="margin:10px 0 6px;display:flex;flex-wrap:wrap;gap:4px">
        ${cats.map(c => `<span class="chip small">${c}</span>`).join('')}
        ${totalSec > 0 ? `<span class="chip small muted">~${this._fmtTemps(totalSec)} / pièce</span>` : ''}
      </div>
      <div style="margin-top:10px">
        ${this.renderMiniFlow(mp)}
      </div>
      <div style="margin-top:12px;display:flex;gap:6px">
        <button class="btn btn-secondary mpp-use" data-id="${mp.id}">▶ Instancier</button>
        ${App.can('edit') ? `<button class="btn-ghost mpp-edit" data-id="${mp.id}">✎ Éditer</button>` : ''}
      </div>
    </div>`;
  },

  renderMiniFlow(mp) {
    return `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px">
      ${(mp.etapes || []).map((e, i) => {
        const color = { appro:'#6366f1', prod:'#2c5fb3', etude:'#f59e0b', livraison:'#059669', jalon:'#dc2626' }[e.type] || '#888';
        return `<span style="display:inline-flex;align-items:center;gap:2px">
          <span style="background:${color}22;color:${color};border:1px solid ${color}55;border-radius:4px;padding:2px 6px;font-size:10px;white-space:nowrap">${e.jalon ? '🏁' : ''}${e.nom}</span>
          ${i < (mp.etapes.length - 1) ? '<span style="color:var(--text-muted);font-size:10px">→</span>' : ''}
        </span>`;
      }).join('')}
    </div>`;
  },

  _fmtTemps(sec) {
    if (sec < 60) return sec + 's';
    const m = Math.round(sec / 60);
    if (m < 60) return m + 'min';
    return Math.floor(m / 60) + 'h' + (m % 60 ? (m % 60) + 'min' : '');
  },

  // ── Formulaire création/édition ─────────────────────────────────────────────

  openForm(id) {
    if (!App.can('edit')) { App.toast('Lecture seule', 'error'); return; }
    const s = DB.state;
    const isNew = !id;
    let mp = id ? (s.modelesProjets || []).find(x => x.id === id) : null;
    if (!mp) {
      mp = { id: DB.uid('MPRJ'), nom: '', couleur: '#2c5fb3', description: '', etapes: [] };
    }
    // Clone deep pour édition non-destructive
    mp = JSON.parse(JSON.stringify(mp));

    const renderEtapes = () => {
      const cats = [...new Set(DB.CATALOGUE_GESTES.map(g => g.categorie))];
      return (mp.etapes || []).map((e, idx) => {
        const prevEtapes = mp.etapes.slice(0, idx);
        const gestesParCat = DB.CATALOGUE_GESTES.reduce((acc, g) => {
          if (!acc[g.categorie]) acc[g.categorie] = [];
          acc[g.categorie].push(g);
          return acc;
        }, {});
        const tempsTotalEtape = (e.gestes || []).reduce((n, code) => n + DB.tempsGeste(code), 0);
        return `<div class="card" style="margin-bottom:8px;border-left:3px solid ${{ appro:'#6366f1', prod:'#2c5fb3', etude:'#f59e0b', livraison:'#059669', jalon:'#dc2626' }[e.type] || '#888'}">
          <div style="display:flex;gap:8px;align-items:start;flex-wrap:wrap">
            <div class="field" style="flex:2;min-width:140px">
              <label style="font-size:11px">Nom de l'étape</label>
              <input class="ep-nom" data-i="${idx}" value="${e.nom}" placeholder="Ex: Réception marchandise">
            </div>
            <div class="field" style="flex:1;min-width:90px">
              <label style="font-size:11px">Type</label>
              <select class="ep-type" data-i="${idx}">
                ${['appro','prod','etude','livraison','jalon'].map(t => `<option value="${t}" ${t === e.type ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </div>
            <div class="field" style="min-width:70px">
              <label style="font-size:11px">Durée (j.o.)</label>
              <input type="number" class="ep-duree" data-i="${idx}" min="0" value="${e.duree || 0}" style="width:64px">
            </div>
            <div style="display:flex;gap:4px;margin-top:18px;flex-shrink:0">
              ${idx > 0 ? `<button class="btn-ghost ep-up" data-i="${idx}" title="Monter">↑</button>` : ''}
              ${idx < mp.etapes.length - 1 ? `<button class="btn-ghost ep-down" data-i="${idx}" title="Descendre">↓</button>` : ''}
              <button class="btn-ghost ep-del" data-i="${idx}" style="color:var(--danger)" title="Supprimer">✕</button>
            </div>
          </div>
          <div class="field" style="margin-top:6px">
            <label style="font-size:11px">Gestes associés <span class="muted small">(temps/pièce estimé : ${this._fmtTemps(tempsTotalEtape)})</span></label>
            <div style="display:flex;align-items:stretch;gap:4px">
              <button class="btn-ghost ep-cat-prev" data-i="${idx}" title="Catégorie précédente" style="flex-shrink:0;padding:2px 8px;font-size:18px;line-height:1;align-self:center">‹</button>
              <div class="ep-geste-scroll" data-i="${idx}" style="max-height:140px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:6px;background:var(--surface-2);flex:1">
                ${Object.entries(gestesParCat).map(([cat, gestes], catIdx) => `
                  <div class="ep-cat-section" data-cat-idx="${catIdx}" style="margin-bottom:4px">
                    <div class="muted small" style="font-weight:600;margin-bottom:2px">${cat}</div>
                    <div style="display:flex;flex-wrap:wrap;gap:4px">
                      ${gestes.map(g => {
                        const sel = (e.gestes || []).includes(g.code);
                        return `<label title="${g.description} — ${g.notes}" style="display:flex;align-items:center;gap:3px;cursor:pointer;padding:2px 6px;border-radius:4px;font-size:10px;border:1px solid ${sel ? 'var(--primary)' : 'var(--border)'};background:${sel ? 'var(--primary-weak)' : 'transparent'}">
                          <input type="checkbox" class="ep-geste" data-i="${idx}" data-code="${g.code}" ${sel ? 'checked' : ''} style="margin:0">
                          ${g.code}
                        </label>`;
                      }).join('')}
                    </div>
                  </div>`).join('')}
              </div>
              <button class="btn-ghost ep-cat-next" data-i="${idx}" title="Catégorie suivante" style="flex-shrink:0;padding:2px 8px;font-size:18px;line-height:1;align-self:center">›</button>
            </div>
          </div>
          ${prevEtapes.length ? `<div class="field" style="margin-top:4px">
            <label style="font-size:11px">Dépend de</label>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${prevEtapes.map(pe => {
                const sel = (e.dependsDe || []).includes(pe.id);
                return `<label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:11px;padding:2px 6px;border-radius:4px;border:1px solid ${sel ? 'var(--primary)' : 'var(--border)'};background:${sel ? 'var(--primary-weak)' : 'transparent'}">
                  <input type="checkbox" class="ep-dep" data-i="${idx}" data-depid="${pe.id}" ${sel ? 'checked' : ''} style="margin:0">
                  ${pe.nom || '—'}
                </label>`;
              }).join('')}
            </div>
          </div>` : ''}
          <div class="field" style="margin-top:4px">
            <label style="font-size:11px">Notes</label>
            <input class="ep-notes" data-i="${idx}" value="${e.notes || ''}" placeholder="Instructions pour cette étape…">
          </div>
        </div>`;
      }).join('');
    };

    const existingGroups = [...new Set((s.projets||[]).map(p => p.groupe||'').filter(Boolean))].sort();
    const body = `
      <div class="row">
        <div class="field"><label>Nom du modèle</label><input id="mpf-nom" value="${mp.nom}" placeholder="Logistique complète…"></div>
        <div class="field"><label>Couleur</label><input type="color" id="mpf-col" value="${mp.couleur || '#2c5fb3'}"></div>
      </div>
      <div class="row">
        <div class="field">
          <label>Groupe associé <span class="muted small">(ex: PRJ-Log — s'applique aux projets de ce groupe)</span></label>
          <input id="mpf-groupe" list="mpf-groupe-list" value="${mp.groupe||''}" placeholder="Laisser vide = modèle générique">
          <datalist id="mpf-groupe-list">${existingGroups.map(g=>`<option value="${g}">`).join('')}</datalist>
        </div>
      </div>
      <div class="field"><label>Description</label><input id="mpf-desc" value="${mp.description || ''}" placeholder="Description du flux couvert par ce modèle…"></div>
      <div style="display:flex;align-items:center;gap:8px;margin:12px 0 6px">
        <strong>Étapes</strong>
        <button class="btn-ghost" id="mpf-add-step" style="font-size:12px">+ Ajouter étape</button>
      </div>
      <div id="mpf-etapes">${renderEtapes()}</div>
    `;
    const foot = `
      ${!isNew ? '<button class="btn btn-danger" id="mpf-del">Supprimer</button>' : ''}
      <span class="spacer" style="flex:1"></span>
      <button class="btn btn-secondary" onclick="App.closeModal()">Annuler</button>
      <button class="btn" id="mpf-save">${isNew ? 'Créer' : 'Enregistrer'}</button>
    `;
    App.openModal(isNew ? 'Nouveau modèle de projet' : mp.nom, body, foot);

    const rebind = () => {
      document.getElementById('mpf-etapes').innerHTML = renderEtapes();
      bindEtapes();
    };

    const bindEtapes = () => {
      document.querySelectorAll('.ep-nom').forEach(el => el.oninput = e => { mp.etapes[+e.target.dataset.i].nom = e.target.value; });
      document.querySelectorAll('.ep-type').forEach(el => el.onchange = e => {
        const i = +e.target.dataset.i;
        mp.etapes[i].type = e.target.value;
        mp.etapes[i].jalon = e.target.value === 'jalon';
        if (mp.etapes[i].jalon) mp.etapes[i].duree = 0;
        rebind();
      });
      document.querySelectorAll('.ep-duree').forEach(el => el.oninput = e => { mp.etapes[+e.target.dataset.i].duree = +e.target.value || 0; });
      document.querySelectorAll('.ep-notes').forEach(el => el.oninput = e => { mp.etapes[+e.target.dataset.i].notes = e.target.value; });
      document.querySelectorAll('.ep-geste').forEach(el => el.onchange = e => {
        const i = +e.target.dataset.i;
        const code = e.target.dataset.code;
        const gestes = mp.etapes[i].gestes || [];
        if (e.target.checked) { if (!gestes.includes(code)) gestes.push(code); }
        else { const idx2 = gestes.indexOf(code); if (idx2 >= 0) gestes.splice(idx2, 1); }
        mp.etapes[i].gestes = gestes;
        rebind();
      });
      document.querySelectorAll('.ep-dep').forEach(el => el.onchange = e => {
        const i = +e.target.dataset.i;
        const depId = e.target.dataset.depid;
        const deps = mp.etapes[i].dependsDe || [];
        if (e.target.checked) { if (!deps.includes(depId)) deps.push(depId); }
        else { const idx2 = deps.indexOf(depId); if (idx2 >= 0) deps.splice(idx2, 1); }
        mp.etapes[i].dependsDe = deps;
      });
      document.querySelectorAll('.ep-up').forEach(el => el.onclick = e => {
        const i = +e.target.dataset.i;
        if (i <= 0 || i >= mp.etapes.length) return;
        [mp.etapes[i-1], mp.etapes[i]] = [mp.etapes[i], mp.etapes[i-1]];
        rebind();
      });
      document.querySelectorAll('.ep-down').forEach(el => el.onclick = e => {
        const i = +e.target.dataset.i;
        if (i < 0 || i >= mp.etapes.length - 1) return;
        [mp.etapes[i], mp.etapes[i+1]] = [mp.etapes[i+1], mp.etapes[i]];
        rebind();
      });
      document.querySelectorAll('.ep-del').forEach(el => el.onclick = e => {
        mp.etapes.splice(+e.target.dataset.i, 1);
        rebind();
      });
      document.querySelectorAll('.ep-cat-prev, .ep-cat-next').forEach(el => el.onclick = e => {
        const i = e.currentTarget.dataset.i;
        const container = document.querySelector(`.ep-geste-scroll[data-i="${i}"]`);
        if (!container) return;
        const sections = container.querySelectorAll('.ep-cat-section');
        if (!sections.length) return;
        const dir = e.currentTarget.classList.contains('ep-cat-next') ? 1 : -1;
        let currentIdx = 0;
        sections.forEach((sec, si) => { if (sec.offsetTop <= container.scrollTop + 8) currentIdx = si; });
        const next = Math.max(0, Math.min(sections.length - 1, currentIdx + dir));
        container.scrollTop = sections[next].offsetTop;
      });
    };
    bindEtapes();

    document.getElementById('mpf-add-step').onclick = () => {
      mp.etapes.push({ id: DB.uid('EP'), nom: '', type: 'prod', duree: 1, gestes: [], dependsDe: [], notes: '' });
      rebind();
    };

    document.getElementById('mpf-save').onclick = () => {
      mp.nom = document.getElementById('mpf-nom').value.trim();
      mp.couleur = document.getElementById('mpf-col').value;
      mp.description = document.getElementById('mpf-desc').value.trim();
      mp.groupe = document.getElementById('mpf-groupe').value.trim();
      if (!mp.nom) { App.toast('Nom requis', 'error'); return; }
      if (!s.modelesProjets) s.modelesProjets = [];
      if (isNew) { s.modelesProjets.push(mp); DB.logAudit('create', 'modele-projet', mp.id, mp.nom); }
      else {
        const idx = s.modelesProjets.findIndex(x => x.id === mp.id);
        if (idx >= 0) s.modelesProjets[idx] = mp;
        DB.logAudit('update', 'modele-projet', mp.id, mp.nom);
      }
      DB.save(); App.closeModal(); App.refresh(); App.toast('Modèle enregistré', 'success');
    };

    const delBtn = document.getElementById('mpf-del');
    if (delBtn) delBtn.onclick = () => {
      if (!confirm('Supprimer ce modèle de projet ?')) return;
      s.modelesProjets = s.modelesProjets.filter(x => x.id !== mp.id);
      DB.logAudit('delete', 'modele-projet', mp.id, mp.nom);
      DB.save(); App.closeModal(); App.refresh(); App.toast('Modèle supprimé', 'info');
    };
  },

  // ── Instanciation ────────────────────────────────────────────────────────────

  instancier(id, presetProjetId = null) {
    if (!App.can('edit')) { App.toast('Lecture seule', 'error'); return; }
    const s = DB.state;
    const mp = (s.modelesProjets || []).find(x => x.id === id);
    if (!mp) return;
    if (!s.projets.length) { App.toast('Créer d\'abord un projet', 'error'); App.navigate('projets'); return; }

    const preview = (projetId, debut, qte) => {
      const etapes = mp.etapes || [];
      const result = [];
      // Calcul dates en tenant compte des dépendances (topologique)
      const finMap = {};
      etapes.forEach(e => {
        const depFins = (e.dependsDe || []).map(depId => finMap[depId]).filter(Boolean);
        const start = depFins.length
          ? D.nextWorkday(D.addDays(depFins.sort()[depFins.length - 1], 1))
          : D.nextWorkday(debut);
        const fin = e.jalon ? start : D.addWorkdays(start, Math.max(0, (e.duree || 1) - 1));
        finMap[e.id] = fin;
        const tempsSec = (e.gestes || []).reduce((n, code) => n + DB.tempsGeste(code), 0);
        const tempsTotal = tempsSec * (qte || 1);
        result.push({ ...e, calcDebut: start, calcFin: fin, tempsTotal });
      });
      return result;
    };

    const renderPreview = () => {
      const projEl = document.getElementById('mpi-proj');
      const debutEl = document.getElementById('mpi-debut');
      if (!projEl || !debutEl) return '<p class="muted small">Choisir un projet et une date de début</p>';
      const pid = projEl.dataset.pid || projEl.value;
      const debut = debutEl.value;
      const qte = +(document.getElementById('mpi-qte')?.value) || 1;
      if (!pid || !debut) return '<p class="muted small">Choisir un projet et une date de début</p>';
      const rows = preview(pid, debut, qte);
      return `<table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:4px 6px">Étape</th>
          <th style="padding:4px 6px">Type</th>
          <th style="padding:4px 6px">Début</th>
          <th style="padding:4px 6px">Fin</th>
          <th style="padding:4px 6px">Durée</th>
          <th style="padding:4px 6px">Tps/total</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:4px 6px">${r.jalon ? '🏁 ' : ''}${r.nom}</td>
            <td style="padding:4px 6px;text-align:center"><span class="badge">${r.type}</span></td>
            <td style="padding:4px 6px;text-align:center">${D.fmt(r.calcDebut)}</td>
            <td style="padding:4px 6px;text-align:center">${r.jalon ? '—' : D.fmt(r.calcFin)}</td>
            <td style="padding:4px 6px;text-align:center">${r.jalon ? 'Jalon' : (r.duree || 1) + ' j.o.'}</td>
            <td style="padding:4px 6px;text-align:center;color:var(--text-muted)">${r.tempsTotal ? this._fmtTemps(r.tempsTotal) : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    };

    const today = D.today();
    const presetProjet = presetProjetId ? s.projets.find(p => p.id === presetProjetId) : null;
    const body = `
      <div class="row">
        <div class="field">
          <label>Projet d'affectation</label>
          ${presetProjet
            ? `<input id="mpi-proj" value="${presetProjet.code} — ${presetProjet.nom}" readonly style="background:var(--surface-2);color:var(--text-muted)" data-pid="${presetProjet.id}">`
            : `<select id="mpi-proj">${App.projetsOptions(presetProjetId||'', '— Choisir un projet —')}</select>`
          }
        </div>
        <div class="field">
          <label>Date de début</label>
          <input type="date" id="mpi-debut" value="${D.nextWorkday(today)}">
        </div>
      </div>
      <div class="field" style="max-width:200px">
        <label>Quantité d'articles <span class="muted small">(pour estimer le temps total)</span></label>
        <input type="number" id="mpi-qte" min="1" value="1">
      </div>
      <div style="margin-top:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <strong style="font-size:13px">Aperçu des tâches créées</strong>
          <button class="btn-ghost" id="mpi-refresh" style="font-size:11px">↺ Actualiser</button>
        </div>
        <div id="mpi-preview" style="overflow-x:auto"><p class="muted small">Choisir un projet et une date de début</p></div>
      </div>
      <p class="muted small" style="margin-top:10px">Les gestes seront notés dans les notes de chaque tâche pour référence.</p>
    `;
    const foot = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Annuler</button>
      <span class="spacer" style="flex:1"></span>
      <button class="btn" id="mpi-ok">▶ Créer ${(mp.etapes || []).length} tâche(s)</button>
    `;
    App.openModal(`Instancier : ${mp.nom}`, body, foot);

    const getPid = () => {
      const el = document.getElementById('mpi-proj');
      if (!el) return '';
      return el.dataset.pid || el.value;
    };
    const refreshPreview = () => {
      document.getElementById('mpi-preview').innerHTML = renderPreview();
    };
    document.getElementById('mpi-proj').onchange = refreshPreview;
    document.getElementById('mpi-debut').onchange = refreshPreview;
    document.getElementById('mpi-qte').oninput = refreshPreview;
    document.getElementById('mpi-refresh').onclick = refreshPreview;
    refreshPreview();

    document.getElementById('mpi-ok').onclick = () => {
      const pid = getPid();
      const debut = document.getElementById('mpi-debut').value;
      const qte = +document.getElementById('mpi-qte').value || 1;
      if (!pid || !debut) { App.toast('Projet et date requis', 'error'); return; }
      const rows = preview(pid, debut, qte);
      // Mapper les ids d'étapes vers les ids de tâches créées (pour les dépendances)
      const etapeIdToTacheId = {};
      const tachesCreees = [];
      rows.forEach(r => {
        const tacheId = DB.uid('T');
        etapeIdToTacheId[r.id] = tacheId;
        const gestes = (r.gestes || []).map(code => {
          const g = DB.CATALOGUE_GESTES.find(x => x.code === code);
          return g ? `${code} — ${g.description}` : code;
        });
        const tache = {
          id: tacheId,
          projetId: pid,
          nom: r.nom,
          debut: r.calcDebut,
          fin: r.calcFin,
          type: r.jalon ? 'jalon' : (r.type || 'prod'),
          jalon: !!r.jalon,
          avancement: 0,
          assignes: [],
          machineId: null,
          lieuId: null,
          dependances: [],
          notes: gestes.length ? `Gestes : ${gestes.join(' · ')}` : (r.notes || ''),
          checklist: [],
          tempsLog: [],
        };
        tachesCreees.push({ tache, etapeId: r.id, dependsDe: r.dependsDe || [] });
      });
      // Résoudre les dépendances
      tachesCreees.forEach(({ tache, dependsDe }) => {
        tache.dependances = dependsDe.map(depEtapeId => etapeIdToTacheId[depEtapeId]).filter(Boolean);
        s.taches.push(tache);
      });
      DB.logAudit('create', 'modele-projet-instanciation', mp.id, `${mp.nom} → ${rows.length} tâches sur ${pid}`);
      DB.save();
      App.closeModal();
      App.toast(`${rows.length} tâche(s) créée(s) depuis le modèle`, 'success');
      // Naviguer vers le Gantt filtré sur le projet
      App.views.gantt.state.projetFilter = pid;
      App.navigate('gantt');
    };
  },
};
