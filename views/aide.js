// Vue Aide & Flux de travail — guide interactif avec parcours cliquables
App.views.aide = {
  state: { tab: 'start' },

  render(root) {
    const st = this.state;
    const tabs = [
      { id:'start',     label:'🚀 Démarrer'           },
      { id:'daily',     label:'📅 Quotidien'           },
      { id:'urgence',   label:'⚠ Surcharge / Urgence' },
      { id:'fin',       label:'✅ Clôture projet'      },
      { id:'shortcuts', label:'⌨ Raccourcis'          },
    ];
    root.innerHTML = `
      <div style="padding:16px 20px">
        <div class="toolbar" style="margin-bottom:16px">
          <strong>📖 Aide &amp; Flux de travail</strong>
          <span class="muted small">Clique sur une étape pour ouvrir directement la vue concernée</span>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap">
          ${tabs.map(t => `<button class="btn ${st.tab === t.id ? '' : 'btn-secondary'} aide-tab-btn" data-tab="${t.id}">${t.label}</button>`).join('')}
        </div>
        <div id="aide-content"></div>
      </div>
    `;
    root.querySelectorAll('.aide-tab-btn').forEach(btn => {
      btn.onclick = () => { st.tab = btn.dataset.tab; this.render(root); };
    });
    this.renderTab(root.querySelector('#aide-content'));
  },

  renderTab(el) {
    const map = { start: 'tabStart', daily: 'tabDaily', urgence: 'tabUrgence', fin: 'tabFin', shortcuts: 'tabShortcuts' };
    el.innerHTML = this[map[this.state.tab] || 'tabStart']();
    el.querySelectorAll('[data-nav]').forEach(card => {
      card.onclick = () => App.navigate(card.dataset.nav);
    });
  },

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _step(num, icon, title, desc, view, color) {
    const border = color ? `border-top:3px solid ${color}` : '';
    const dot = color ? `background:${color}` : '';
    return `<div class="flux-step" data-nav="${view}" title="→ Ouvrir : ${title}" style="${border}">
      <div class="flux-num" style="${dot}">${num}</div>
      <div class="flux-icon">${icon}</div>
      <div class="flux-title">${title}</div>
      <div class="flux-desc">${desc}</div>
    </div>`;
  },

  _arrow(label) {
    return `<div class="flux-arrow">${label ? `<span class="flux-arrow-label">${label}</span>` : ''}→</div>`;
  },

  _section(title, subtitle, stepsHTML, tipHTML) {
    return `<div class="card" style="margin-bottom:16px">
      <h3 style="margin:0 0 4px">${title}</h3>
      ${subtitle ? `<p class="muted small" style="margin:0 0 14px">${subtitle}</p>` : '<div style="height:14px"></div>'}
      <div class="flux-flow">${stepsHTML}</div>
      ${tipHTML ? `<div class="flux-tip">${tipHTML}</div>` : ''}
    </div>`;
  },

  // ── Onglets ──────────────────────────────────────────────────────────────────

  tabStart() {
    const C1 = '#6366f1', C2 = '#2c5fb3', C3 = '#059669';
    return `
      ${this._section(
        '1 · Mise en place de la structure (une seule fois)',
        'Avant de planifier, configure les éléments permanents de l\'atelier.',
        this._step(1,'🏭','Lieux','Espaces de production, stockage, bureaux','lieux',C1) +
        this._arrow() +
        this._step(2,'⚙','Machines','Équipements et capacités par lieu','machines',C1) +
        this._arrow() +
        this._step(3,'👥','Personnes','Collaborateurs, compétences, capacité hebdo','personnes',C1) +
        this._arrow() +
        this._step(4,'🤝','Équipes','Regrouper les personnes par équipe','equipes',C1),
        '💡 Ces données sont réutilisées par tous les projets. Une seule fois suffit.'
      )}
      ${this._section(
        '2 · Créer et planifier un projet',
        'Flux principal de planification — répété pour chaque nouveau projet.',
        this._step(1,'📁','Projet','Créer : code, nom, client, statut','projets',C2) +
        this._arrow() +
        this._step(2,'🗂','Modèles projet','Instancier une séquence complète de tâches','modelesprojets',C2) +
        this._arrow() +
        this._step(3,'📅','Gantt','Ajouter tâches, durées, dépendances','gantt',C2) +
        this._arrow() +
        this._step(4,'👤','Affecter','Personnes · machines · lieux sur chaque tâche','gantt',C2) +
        this._arrow() +
        this._step(5,'📸','Baseline','Sauver le planning de référence','gantt',C2),
        '💡 Dans le Gantt : glisse sur la grille vide pour créer une tâche, clic-droit sur une barre pour les actions rapides.'
      )}
      ${this._section(
        '3 · Gérer les achats & stocks liés au projet',
        'Si le projet nécessite des composants ou matériaux.',
        this._step(1,'🔩','BOM','Nomenclature — articles nécessaires','bom',C3) +
        this._arrow() +
        this._step(2,'📦','Stock','Vérifier les niveaux disponibles','stock',C3) +
        this._arrow() +
        this._step(3,'🛒','Commandes','Passer les commandes pour les manques','commandes',C3) +
        this._arrow() +
        this._step(4,'📦','Réception','Mettre à jour le stock à la réception','stock',C3),
        '💡 Le dashboard affiche une alerte automatique quand le stock passe sous le seuil minimal.'
      )}
    `;
  },

  tabDaily() {
    const C1 = '#f59e0b', C2 = '#2c5fb3', C3 = '#dc2626';
    return `
      ${this._section(
        'Routine du matin',
        'Ce que tu fais en arrivant à l\'atelier.',
        this._step(1,'☀','Ma journée','Mes tâches d\'aujourd\'hui et de la semaine','majourney',C1) +
        this._arrow() +
        this._step(2,'🔔','Alertes','Vérifier la cloche (rouge = urgent)','dashboard',C1) +
        this._arrow() +
        this._step(3,'📋','Kanban','État des tâches en cours / bloquées','kanban',C1) +
        this._arrow() +
        this._step(4,'📅','Calendrier','Vue jour/semaine pour l\'équipe','calendrier',C1)
      )}
      ${this._section(
        'Mettre à jour l\'avancement',
        'Tenir le planning à jour au fil de la journée.',
        this._step(1,'📅','Gantt','Ouvrir le Gantt — filtrer le projet','gantt',C2) +
        this._arrow('clic-droit') +
        this._step(2,'✏','Avancement','Choisir 0 / 25 / 50 / 75 / 100 %','gantt',C2) +
        this._arrow() +
        this._step(3,'⏱','Temps réel','Logger les heures dans la fiche tâche','gantt',C2) +
        this._arrow() +
        this._step(4,'📈','Capacité','Vérifier le taux de charge prévisionnel','capacite',C2),
        '💡 Ctrl+clic sur les barres Gantt pour sélectionner plusieurs tâches et les décaler en une fois.'
      )}
      ${this._section(
        'Signaler une absence ou un déplacement',
        '',
        this._step(1,'🏖','Absences','Saisir congé, maladie, formation…','absences',C3) +
        this._arrow('ou') +
        this._step(2,'🚗','Déplacements','Livraison client, tournée, déplacement','deplacements',C3) +
        this._arrow() +
        this._step(3,'👥','Personnes','Vérifier l\'impact sur la charge','personnes',C3) +
        this._arrow() +
        this._step(4,'📅','Gantt','Ajuster les affectations si besoin','gantt',C3)
      )}
    `;
  },

  tabUrgence() {
    const C1 = '#dc2626', C2 = '#f59e0b';
    return `
      ${this._section(
        'Résoudre une surcharge de ressources',
        'Une personne ou une machine est sur-affectée sur la même période.',
        this._step(1,'🔔','Alertes','Cloche rouge → badge sur l\'onglet Personnes','dashboard',C1) +
        this._arrow() +
        this._step(2,'👥','Personnes','Clic sur une semaine rouge → liste des conflits','personnes',C1) +
        this._arrow() +
        this._step(3,'📏','Timeline','Vue mur : toutes personnes × jours en un coup d\'œil','timeline',C1) +
        this._arrow() +
        this._step(4,'⚖','Équilibrer','Gantt → bouton ⚖ pour le rééquilibrage auto','gantt',C1) +
        this._arrow() +
        this._step(5,'📈','Vérifier','Recheck la vue Capacité pour confirmer','capacite',C1),
        '💡 L\'équilibrage ne déplace que les tâches hors chemin critique pour préserver les jalons.'
      )}
      ${this._section(
        'Gérer un retard de projet',
        'Le dashboard prédit un retard sur un projet en cours.',
        this._step(1,'📊','Dashboard','Indicateur retard prédit (zone rouge)','dashboard',C2) +
        this._arrow() +
        this._step(2,'📅','Gantt','Filtrer le projet → activer "Chemin critique"','gantt',C2) +
        this._arrow('simuler ?') +
        this._step(3,'🔮','What-if','Scénario alternatif sans toucher au plan réel','whatif',C2) +
        this._arrow() +
        this._step(4,'🔁','Modèle','Ajouter une tâche d\'urgence via un modèle','modeles',C2) +
        this._arrow() +
        this._step(5,'📸','Baseline','Nouvelle baseline après ajustements','gantt',C2),
        '💡 Le mode What-if te permet de tester un décalage ou une compression sans risquer le planning de production.'
      )}
    `;
  },

  tabFin() {
    const C1 = '#059669', C2 = '#6366f1';
    return `
      ${this._section(
        'Clôture et archivage d\'un projet',
        'Quand toutes les tâches sont à 100 %.',
        this._step(1,'📅','Gantt','Vérifier que toutes les tâches sont à 100 %','gantt',C1) +
        this._arrow() +
        this._step(2,'📋','Rapport','Générer le rapport hebdomadaire imprimable','gantt',C1) +
        this._arrow() +
        this._step(3,'⤓','Export CSV','Exporter le planning pour archivage','gantt',C1) +
        this._arrow() +
        this._step(4,'📅','Export .ics','Envoyer vers Outlook / Google Agenda','gantt',C1) +
        this._arrow() +
        this._step(5,'📁','Projet','Passer le statut à "Terminé"','projets',C1),
        '💡 Garde toujours la baseline de référence pour pouvoir comparer prévu vs réalisé plus tard.'
      )}
      ${this._section(
        'Capitaliser pour le prochain projet',
        'Transformer l\'expérience en efficacité future.',
        this._step(1,'📜','Historique','Consulter l\'audit pour le retour d\'expérience','audit',C2) +
        this._arrow() +
        this._step(2,'🔁','Modèles','Créer des modèles depuis les tâches récurrentes','modeles',C2) +
        this._arrow() +
        this._step(3,'📁','Nouveau projet','Démarrer le prochain projet — structure déjà en place','projets',C2),
        '💡 Un bon modèle de tâche récurrente (nettoyage, réception, préparation commandes…) fait gagner 2 min à chaque planification.'
      )}
    `;
  },

  tabShortcuts() {
    const nav = [
      ['D','Dashboard'], ['G','Gantt'], ['C','Calendrier'], ['P','Personnes'],
      ['L','Lieux'], ['M','Machines'], ['J','Projets'], ['S','Stock'],
      ['V','Déplacements'], ['O','Commandes'], ['B','BOM'], ['X','Capacité'],
      ['R','Ressources'], ['E','Équipes'], ['A','Plan atelier'], ['F','Absences'],
      ['T','Modèles'], ['H','Historique'], ['W','What-if'], ['I','🎓 Guide'],
    ];
    const special = [
      ['Ctrl+K', 'Recherche globale — personnes, projets, tâches, articles, commandes'],
      ['Ctrl+P', 'Palette de commandes — naviguer ou lancer une action rapidement'],
      ['N', 'Créer un nouvel élément dans la vue courante'],
      ['/', 'Focus la barre de recherche de la vue'],
      ['?', 'Afficher le panneau raccourcis clavier'],
      ['Ctrl+Z', 'Annuler la dernière action'],
      ['Ctrl+Shift+Z', 'Refaire'],
      ['Alt+←', 'Retour à la vue précédente'],
      ['Esc', 'Fermer le modal ou l\'overlay ouvert'],
    ];
    const gantt = [
      ['Clic-droit sur une barre', 'Avancement rapide : 0 / 25 / 50 / 75 / 100 %'],
      ['Ctrl+clic sur plusieurs barres', 'Sélection multiple → décaler, changer projet, supprimer'],
      ['Glisser sur la grille vide', 'Créer une nouvelle tâche directement'],
      ['Bouton ⚖ Équilibrer', 'Rééquilibrage auto des ressources surchargées'],
      ['Bouton 📸 Baseline', 'Sauvegarder le planning actuel comme référence'],
      ['Select Comparer', 'Superposer une baseline passée sur le Gantt actuel'],
    ];
    return `
      <div class="grid grid-2" style="gap:16px">
        <div class="card">
          <h3 style="margin:0 0 10px">Navigation par lettre</h3>
          <p class="muted small" style="margin:0 0 12px">Depuis n'importe quelle vue (hors champ de saisie)</p>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
            ${nav.map(([k,v]) => `<div style="display:flex;align-items:center;gap:6px"><kbd class="aide-kbd">${k}</kbd><span class="small">${v}</span></div>`).join('')}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="card">
            <h3 style="margin:0 0 10px">Raccourcis spéciaux</h3>
            <table style="width:100%;border-collapse:collapse">
              ${special.map(([k,v]) => `<tr><td style="padding:5px 10px 5px 0;white-space:nowrap;vertical-align:top"><kbd class="aide-kbd">${k}</kbd></td><td class="small muted" style="padding:5px 0">${v}</td></tr>`).join('')}
            </table>
          </div>
          <div class="card">
            <h3 style="margin:0 0 10px">Actions Gantt</h3>
            <table style="width:100%;border-collapse:collapse">
              ${gantt.map(([k,v]) => `<tr><td style="padding:5px 10px 5px 0;white-space:nowrap;vertical-align:top;font-size:12px;color:var(--text-muted)">${k}</td><td class="small" style="padding:5px 0">${v}</td></tr>`).join('')}
            </table>
          </div>
        </div>
      </div>
    `;
  },
};
