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
      { id:'nouveautes',label:'✨ Nouveautés'          },
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
    const map = { start:'tabStart', daily:'tabDaily', urgence:'tabUrgence', fin:'tabFin', nouveautes:'tabNouveautes', shortcuts:'tabShortcuts' };
    el.innerHTML = this[map[this.state.tab] || 'tabStart']();
    el.querySelectorAll('[data-nav]').forEach(card => {
      card.onclick = () => App.navigate(card.dataset.nav);
    });
  },

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _step(num, icon, title, desc, view, color) {
    const border = color ? `border-top:3px solid ${color}` : '';
    const dot    = color ? `background:${color}` : '';
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
    const C1 = '#6366f1', C2 = '#2c5fb3', C3 = '#059669', C4 = '#f59e0b';
    return `
      ${this._section(
        '1 · Mise en place de la structure (une seule fois)',
        "Avant de planifier, configure les éléments permanents de l'atelier.",
        this._step(1,'🏭','Lieux','Espaces de production, stockage, bureaux','lieux',C1) +
        this._arrow() +
        this._step(2,'⚙','Machines','Équipements et capacités par lieu','machines',C1) +
        this._arrow() +
        this._step(3,'👥','Personnes','Collaborateurs, compétences, capacité hebdo','personnes',C1) +
        this._arrow() +
        this._step(4,'🤝','Équipes','Regrouper les personnes par équipe','equipes',C1) +
        this._arrow() +
        this._step(5,'🔗','Flux atelier','Visualiser le schéma machines et le flux de production','flux',C1),
        '💡 Ces données sont réutilisées par tous les projets. Configure-les une seule fois, puis visualise le tout dans la vue Flux.'
      )}
      ${this._section(
        '2 · Créer et planifier un projet',
        'Flux principal de planification — répété pour chaque nouveau projet.',
        this._step(1,'📁','Projet','Créer : code, nom, client, statut','projets',C2) +
        this._arrow() +
        this._step(2,'🗂','Modèles projet','Instancier une séquence complète de tâches en 1 clic','modelesprojets',C2) +
        this._arrow() +
        this._step(3,'📅','Gantt','Ajouter / ajuster tâches, durées, dépendances','gantt',C2) +
        this._arrow() +
        this._step(4,'👤','Affecter','Personnes · machines · lieux sur chaque tâche','gantt',C2) +
        this._arrow() +
        this._step(5,'🔗','Flux','Vérifier le flux machines du projet','flux',C2) +
        this._arrow() +
        this._step(6,'📸','Baseline','Sauver le planning de référence','gantt',C2),
        '💡 Modèles projet : 42 gestes du catalogue atelier disponibles. Instancier crée toutes les tâches avec dates et dépendances calculées automatiquement.'
      )}
      ${this._section(
        '3 · Tâches rapides sans projet',
        "Pour une tâche ponctuelle non rattachée à un projet (nettoyage, maintenance, formation…).",
        this._step(1,'📅','Gantt','Ouvrir le Gantt','gantt',C4) +
        this._arrow() +
        this._step(2,'➕','Nouvelle tâche','Cliquer + Nouvelle tâche ou glisser sur la grille','gantt',C4) +
        this._arrow() +
        this._step(3,'🔓','Aucun projet','Choisir "— Aucun projet (tâche libre)"','gantt',C4) +
        this._arrow() +
        this._step(4,'📋','Planifier','Renseigner dates, assignés, machine, lieu','gantt',C4),
        '💡 Les tâches libres apparaissent dans un groupe "— Tâches libres (sans projet)" en bas du Gantt.'
      )}
      ${this._section(
        '4 · Gérer les achats & stocks liés au projet',
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
        "Ce que tu fais en arrivant à l'atelier.",
        this._step(1,'☀','Ma journée','Mes tâches du jour et de la semaine','majourney',C1) +
        this._arrow() +
        this._step(2,'🔔','Alertes','Vérifier la cloche (rouge = urgent)','dashboard',C1) +
        this._arrow() +
        this._step(3,'🔗','Flux atelier','Statut visuel de toutes les machines','flux',C1) +
        this._arrow() +
        this._step(4,'📋','Kanban','État des tâches en cours / bloquées','kanban',C1) +
        this._arrow() +
        this._step(5,'📅','Calendrier','Vue jour/semaine pour l\'équipe','calendrier',C1),
        '💡 La vue Flux colore chaque machine en vert/bleu/orange/rouge selon son statut — un coup d\'œil suffit pour détecter un problème.'
      )}
      ${this._section(
        "Mettre à jour l'avancement",
        'Tenir le planning à jour au fil de la journée.',
        this._step(1,'📅','Gantt','Ouvrir le Gantt — filtrer sur le projet','gantt',C2) +
        this._arrow('clic-droit') +
        this._step(2,'✏','Avancement','Choisir 0 / 25 / 50 / 75 / 100 %','gantt',C2) +
        this._arrow() +
        this._step(3,'⏱','Temps réel','Logger les heures dans la fiche tâche','gantt',C2) +
        this._arrow() +
        this._step(4,'🔗','Flux','Vérifier que les machines sont libérées','flux',C2) +
        this._arrow() +
        this._step(5,'📈','Capacité','Vérifier le taux de charge prévisionnel','capacite',C2),
        '💡 Ctrl+clic sur les barres Gantt pour sélectionner plusieurs tâches et les décaler en une fois. Bouton 🔗 Flux dans la barre Gantt pour basculer directement.'
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
        this._step(1,'🔗','Flux atelier','Vue d\'ensemble : machines rouges = surchargées','flux',C1) +
        this._arrow() +
        this._step(2,'🔔','Alertes','Cloche rouge → badge sur les onglets concernés','dashboard',C1) +
        this._arrow() +
        this._step(3,'👥','Personnes','Clic sur une semaine rouge → liste des conflits','personnes',C1) +
        this._arrow() +
        this._step(4,'📏','Timeline','Vue mur : toutes personnes × jours en un coup d\'œil','timeline',C1) +
        this._arrow() +
        this._step(5,'⚖','Équilibrer','Gantt → bouton ⚖ pour le rééquilibrage auto','gantt',C1) +
        this._arrow() +
        this._step(6,'📈','Vérifier','Recheck Capacité + Flux pour confirmer','capacite',C1),
        '💡 Commence toujours par la vue Flux : les blocs rouges (Surchargé) et orange (En retard) identifient immédiatement les machines à problème.'
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
        this._step(4,'🗂','Modèles','Ajouter des tâches d\'urgence via un modèle projet','modelesprojets',C2) +
        this._arrow() +
        this._step(5,'🔗','Flux','Vérifier que les machines cibles sont disponibles','flux',C2) +
        this._arrow() +
        this._step(6,'📸','Baseline','Nouvelle baseline après ajustements','gantt',C2),
        '💡 Le mode What-if permet de tester un décalage ou une compression sans risquer le planning de production.'
      )}
    `;
  },

  tabFin() {
    const C1 = '#059669', C2 = '#6366f1';
    return `
      ${this._section(
        "Clôture et archivage d'un projet",
        'Quand toutes les tâches sont à 100 %.',
        this._step(1,'📅','Gantt','Vérifier que toutes les tâches sont à 100 %','gantt',C1) +
        this._arrow() +
        this._step(2,'🔗','Flux','Confirmer que toutes les machines sont libres','flux',C1) +
        this._arrow() +
        this._step(3,'📋','Rapport','Générer le rapport hebdomadaire imprimable','gantt',C1) +
        this._arrow() +
        this._step(4,'⤓','Export CSV','Exporter le planning pour archivage','gantt',C1) +
        this._arrow() +
        this._step(5,'📁','Projet','Passer le statut à "Terminé"','projets',C1),
        '💡 Garde toujours la baseline de référence pour pouvoir comparer prévu vs réalisé plus tard.'
      )}
      ${this._section(
        'Capitaliser pour le prochain projet',
        'Transformer l\'expérience en efficacité future.',
        this._step(1,'📜','Historique','Consulter l\'audit pour le retour d\'expérience','audit',C2) +
        this._arrow() +
        this._step(2,'🗂','Modèles projet','Enrichir ou créer des modèles depuis ce projet','modelesprojets',C2) +
        this._arrow() +
        this._step(3,'🔁','Modèles tâche','Créer des modèles depuis les tâches récurrentes','modeles',C2) +
        this._arrow() +
        this._step(4,'📁','Nouveau projet','Démarrer le prochain — structure déjà en place','projets',C2),
        '💡 Un modèle de projet bien rempli (étapes + gestes du catalogue) permet de chiffrer et planifier un projet similaire en moins de 2 minutes.'
      )}
    `;
  },

  tabNouveautes() {
    const C1 = '#6366f1', C2 = '#2c5fb3', C3 = '#059669', C4 = '#f59e0b';
    return `
      ${this._section(
        '🔗 Vue Flux atelier',
        'Schéma visuel des machines connectées par dépendances de tâches — comme un synoptique de ligne.',
        this._step(1,'🔗','Ouvrir','Onglet "Flux" ou touche U','flux',C1) +
        this._arrow() +
        this._step(2,'🎨','Lire les couleurs','Vert=libre · Bleu=en cours · Orange=retard · Rouge=surcharge','flux',C1) +
        this._arrow() +
        this._step(3,'👆','Clic sur bloc','Panneau détail : tâches actives + avancement','flux',C1) +
        this._arrow() +
        this._step(4,'⚡','Disposition','Mode "Déplacer blocs" → drag-and-drop + 💾 Sauver','flux',C1),
        '💡 Filtre par projet pour ne voir que les machines impliquées dans ce chantier. Bouton 🔗 Flux disponible directement depuis le Gantt et les fiches projet.'
      )}
      ${this._section(
        '🗂 Modèles de projet',
        'Séquences d\'étapes réutilisables avec gestes du catalogue atelier — instanciation en 1 clic.',
        this._step(1,'🗂','Ouvrir','Onglet "Modèles projet"','modelesprojets',C2) +
        this._arrow() +
        this._step(2,'✎','Créer','Définir les étapes, durées, dépendances et gestes','modelesprojets',C2) +
        this._arrow('‹ › gestes') +
        this._step(3,'▶','Instancier','Choisir projet + date + quantité → aperçu des dates','modelesprojets',C2) +
        this._arrow() +
        this._step(4,'📅','Résultat','Toutes les tâches créées avec dépendances dans le Gantt','gantt',C2),
        '💡 42 gestes disponibles (Réception, Contrôle, Étiquetage, Assemblage, Stockage, Préparation, Expédition). Les flèches ‹ › permettent de naviguer entre catégories dans l\'éditeur.'
      )}
      ${this._section(
        '🔓 Tâches libres (sans projet)',
        'Créer une tâche ponctuelle sans la rattacher à un projet.',
        this._step(1,'📅','Gantt','+ Nouvelle tâche ou glisser sur la grille','gantt',C3) +
        this._arrow() +
        this._step(2,'🔓','Aucun projet','Sélectionner "— Aucun projet (tâche libre)"','gantt',C3) +
        this._arrow() +
        this._step(3,'📋','Groupe dédié','Visible en bas du Gantt : "— Tâches libres"','gantt',C3),
        '💡 Idéal pour les tâches récurrentes (maintenance, nettoyage, réunion) qui ne font pas partie d\'un projet spécifique.'
      )}
      ${this._section(
        '✨ Autres améliorations',
        '',
        this._step(1,'💾','Filtres Gantt','Zoom, mode, projet, durée sauvegardés automatiquement','gantt',C4) +
        this._arrow() +
        this._step(2,'📍','Auto-scroll','Le Gantt s\'ouvre centré sur aujourd\'hui','gantt',C4) +
        this._arrow() +
        this._step(3,'⌨','Ctrl+P','Palette de commandes — navigation rapide vers toutes les vues','dashboard',C4) +
        this._arrow() +
        this._step(4,'🔔','Badges nav','Alertes numériques sur les onglets concernés','dashboard',C4),
        '💡 Vue "Ma journée" (tâches du jour), "Timeline" (personnes × jours) et ce Guide sont également disponibles dans la barre de navigation.'
      )}
    `;
  },

  tabShortcuts() {
    const nav = [
      ['D','Dashboard'],  ['G','Gantt'],       ['C','Calendrier'],  ['P','Personnes'],
      ['L','Lieux'],      ['M','Machines'],     ['U','Flux atelier'],['J','Projets'],
      ['S','Stock'],      ['V','Déplacements'], ['O','Commandes'],   ['B','BOM'],
      ['X','Capacité'],   ['R','Ressources'],   ['E','Équipes'],     ['A','Plan atelier'],
      ['F','Absences'],   ['T','Modèles tâche'],['H','Historique'],  ['W','What-if'],
      ['I','🎓 Guide'],   ['K','Kanban'],
    ];
    const special = [
      ['Ctrl+K',       'Recherche globale — personnes, projets, tâches, articles'],
      ['Ctrl+P',       'Palette de commandes — naviguer ou lancer une action'],
      ['N',            'Créer un nouvel élément dans la vue courante'],
      ['/',            'Focus la barre de recherche de la vue'],
      ['?',            'Afficher le panneau raccourcis clavier'],
      ['Ctrl+Z',       'Annuler la dernière action'],
      ['Ctrl+Shift+Z', 'Refaire'],
      ['Alt+←',        'Retour à la vue précédente'],
      ['Esc',          'Fermer le modal ou l\'overlay ouvert'],
    ];
    const gantt = [
      ['Clic-droit sur une barre',    'Avancement rapide : 0 / 25 / 50 / 75 / 100 %'],
      ['Ctrl+clic sur plusieurs barres','Sélection multiple → décaler, changer projet, supprimer'],
      ['Glisser sur la grille vide',  'Créer une nouvelle tâche directement'],
      ['Bouton 🔗 Flux',              'Ouvrir la vue Flux filtrée sur le projet actif'],
      ['Bouton ⚖ Équilibrer',         'Rééquilibrage auto des ressources surchargées'],
      ['Bouton 📸 Baseline',          'Sauvegarder le planning actuel comme référence'],
      ['Select Comparer',             'Superposer une baseline passée sur le Gantt'],
    ];
    const flux = [
      ['Mode "Déplacer blocs"', 'Drag-and-drop des machines sur le canvas'],
      ['💾 Sauver',             'Persiste les positions des blocs en localStorage'],
      ['⚡ Auto',               'Réorganise les blocs en grille automatique'],
      ['Filtre projet',         'Affiche uniquement les connexions du projet sélectionné'],
      ['Clic sur un bloc',      'Panneau détail : tâches actives, prochaines, avancement'],
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
          <div class="card">
            <h3 style="margin:0 0 10px">Vue Flux atelier</h3>
            <table style="width:100%;border-collapse:collapse">
              ${flux.map(([k,v]) => `<tr><td style="padding:5px 10px 5px 0;white-space:nowrap;vertical-align:top;font-size:12px;color:var(--text-muted)">${k}</td><td class="small" style="padding:5px 0">${v}</td></tr>`).join('')}
            </table>
          </div>
        </div>
      </div>
    `;
  },
};
