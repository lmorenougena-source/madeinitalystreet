/* =========================================================
   MIS — COMBO BUILDER
   Modal de composition pour les 4 combos du menu.
   Intercepte les clics sur [data-mis-combo].
   Permet de choisir le burger ou panino inclus,
   et d'upgrader en Loaded Frites (+2,90 €).
   Dépend de cart.js (window.MISCart).
   Support multilingue via window.MISI18n.
   IDs encodés : "combo-classico--burger-italiano"
   Le serveur extrait "combo-classico" (avant "--")
   pour valider le prix dans catalog.json.
========================================================= */
(function () {
  'use strict';

  if (!window.MISCart) {
    if (window.console) console.warn('[MIS-ComboBuilder] cart.js manquant');
    return;
  }
  var Cart = window.MISCart;

  /* ---------- i18n ---------- */
  function tt(key, vars) {
    if (window.MISI18n && typeof window.MISI18n.t === 'function') {
      return window.MISI18n.t(key, vars);
    }
    var fr = {
      'combo.title':       'Composer ton {name}',
      'combo.labelBurger': 'Ton burger',
      'combo.labelPanino': 'Ton panino',
      'combo.labelChoice': 'Burger ou panino',
      'combo.frites':      'Tes frites',
      'combo.fritesBase':  'Frites maison (incluses)',
      'combo.fritesLoaded':'Loaded Frites · +{price}',
      'combo.total':       'Total',
      'combo.cancel':      'Annuler',
      'combo.confirm':     'Ajouter au panier'
    };
    var raw = fr[key] || key;
    if (vars) {
      raw = raw.replace(/\{(\w+)\}/g, function (_m, k) {
        return (vars[k] != null) ? String(vars[k]) : '';
      });
    }
    return raw;
  }

  /* ---------- Données catalogue ---------- */
  var LOADED_SURCHARGE = 2.9;

  var BURGERS = [
    { id: 'burger-italiano',      name: 'Burger Italiano',      desc: 'Sauce maison, pancetta, mozzarella, roquette' },
    { id: 'burger-diavolo',       name: 'Burger Diavolo',       desc: "’Nduja, oignons rouges, cheddar, sauce spicy" },
    { id: 'burger-parmigiano',    name: 'Burger Parmigiano',    desc: 'Crème de parmesan, jambon de Parme, roquette' },
    { id: 'burger-tartufo',       name: 'Burger Tartufo',       desc: 'Crème de truffe, champignons, fontina, oeuf' },
    { id: 'double-smash-classic', name: 'Double Smash Classic', desc: 'Double steak smashé, double cheddar, oignons confits' },
    { id: 'burger-vegetariano',   name: 'Burger Vegetariano',   desc: 'Galette aubergine grillée, mozza, pesto, tomate' },
    { id: 'burger-del-mese',      name: 'Burger del Mese',      desc: 'La création surprise du chef — change chaque mois' }
  ];

  var PANINI = [
    { id: 'crousty-pollo-pesto', name: 'Crousty Pollo Pesto', desc: 'Poulet croustillant, pesto genovese, mozzarella, roquette' },
    { id: 'panino-caprese',      name: 'Panino Caprese',      desc: 'Mozzarella fior di latte, tomate, basilic, huile d\'olive' },
    { id: 'panino-parma',        name: 'Panino Parma',        desc: 'Jambon de Parme 18 mois, mozza, roquette, crème balsamique' },
    { id: 'panino-calabrese',    name: 'Panino Calabrese',    desc: 'Salami piquant, provolone, poivrons grillés, roquette' },
    { id: 'panino-veggie',       name: 'Panino Veggie',       desc: 'Aubergine grillée, courgette, mozza, pesto, tomate confite' }
  ];

  var BAMBINO_ITEMS = [
    { id: 'burger-bambino', name: 'Burger Bambino', desc: 'Mini steak, cheddar fondu, sauce douce (pour les enfants)' }
  ].concat(PANINI);

  /* ---------- Config des combos ---------- */
  var COMBO_CONFIG = {
    'combo-classico': {
      basePrice:   15.9,
      loadedId:    'combo-classico-loaded',
      loadedPrice: 18.8,
      items:       BURGERS,
      labelKey:    'combo.labelBurger'
    },
    'combo-panino': {
      basePrice:   12.9,
      loadedId:    'combo-panino-loaded',
      loadedPrice: 15.8,
      items:       PANINI,
      labelKey:    'combo.labelPanino'
    },
    'menu-studente': {
      basePrice:   9.9,
      loadedId:    'menu-studente-loaded',
      loadedPrice: 12.8,
      items:       PANINI,
      labelKey:    'combo.labelPanino'
    },
    'menu-bambino': {
      basePrice:   7.9,
      loadedId:    'menu-bambino-loaded',
      loadedPrice: 10.8,
      items:       BAMBINO_ITEMS,
      labelKey:    'combo.labelChoice'
    }
  };

  /* ---------- State ---------- */
  var $overlay   = null;
  var $modal     = null;
  var currentId  = null;
  var currentName = null;

  /* ---------- Helpers DOM ---------- */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (k === 'class')      node.className = v;
        else if (k === 'text')  node.textContent = v;
        else                    node.setAttribute(k, v);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c == null) continue;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return node;
  }

  function fmt(n) {
    return Number(n).toFixed(2).replace('.', ',') + ' €';
  }

  /* Mini-toast : réutilise l'élément #mis-toast du cart-ui */
  var _toastTimer = null;
  function showToast(msg) {
    var t = document.getElementById('mis-toast');
    if (!t) return;
    t.replaceChildren();
    var span = document.createElement('span');
    span.textContent = msg;
    t.appendChild(span);
    t.classList.add('is-visible');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { t.classList.remove('is-visible'); }, 2800);
  }

  /* ---------- Création du modal (une seule fois) ---------- */
  function buildOverlay() {
    $overlay = el('div', {
      'class':          'mis-combo-overlay',
      'role':           'dialog',
      'aria-modal':     'true',
      'aria-labelledby':'mis-combo-title'
    });
    $modal = el('div', { 'class': 'mis-combo-modal' });
    $overlay.appendChild($modal);
    document.body.appendChild($overlay);

    /* Fermer sur clic fond */
    $overlay.addEventListener('click', function (e) {
      if (e.target === $overlay) closeModal();
    });
    /* Fermer sur Échap */
    document.addEventListener('keydown', function (e) {
      if (($overlay && $overlay.classList.contains('is-open')) &&
          (e.key === 'Escape' || e.keyCode === 27)) {
        closeModal();
      }
    });
  }

  /* ---------- Peuple et ouvre le modal ---------- */
  function openModal(comboId, comboName) {
    var cfg = COMBO_CONFIG[comboId];
    if (!cfg) return;
    currentId   = comboId;
    currentName = comboName;

    $modal.replaceChildren();

    /* En-tête */
    var header = el('div', { 'class': 'mis-combo-header' });
    header.appendChild(el('h2', {
      'class': 'mis-combo-title',
      id:      'mis-combo-title',
      text:    tt('combo.title', { name: comboName })
    }));
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'mis-combo-close';
    closeBtn.setAttribute('aria-label', 'Fermer');
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    closeBtn.addEventListener('click', closeModal);
    header.appendChild(closeBtn);
    $modal.appendChild(header);

    /* Section : choix du plat */
    var sectionItems = el('div', { 'class': 'mis-combo-section' });
    sectionItems.appendChild(el('p', {
      'class': 'mis-combo-section-label',
      text:    tt(cfg.labelKey)
    }));
    var radioGroup = el('div', {
      'class':      'mis-combo-radio-group',
      'role':       'radiogroup',
      'aria-label': tt(cfg.labelKey)
    });

    for (var i = 0; i < cfg.items.length; i++) {
      (function (item, idx) {
        var rowId = 'mis-ci-' + idx;
        var row   = el('label', { 'class': 'mis-combo-radio-row', 'for': rowId });
        var input = document.createElement('input');
        input.type  = 'radio';
        input.name  = 'mis-combo-choice';
        input.id    = rowId;
        input.value = item.id;
        input.className = 'mis-combo-radio-input';
        if (idx === 0) { input.checked = true; row.classList.add('is-checked'); }

        /* Mettre à jour classe is-checked sur changement */
        input.addEventListener('change', function () {
          var siblings = radioGroup.querySelectorAll('.mis-combo-radio-row');
          for (var s = 0; s < siblings.length; s++) {
            siblings[s].classList.remove('is-checked');
          }
          row.classList.add('is-checked');
        });

        var dot     = el('span', { 'class': 'mis-combo-radio-dot', 'aria-hidden': 'true' });
        var content = el('span', { 'class': 'mis-combo-radio-content' });
        content.appendChild(el('span', { 'class': 'mis-combo-radio-name', text: item.name }));
        content.appendChild(el('span', { 'class': 'mis-combo-radio-desc', text: item.desc }));

        row.appendChild(input);
        row.appendChild(dot);
        row.appendChild(content);
        radioGroup.appendChild(row);
      })(cfg.items[i], i);
    }
    sectionItems.appendChild(radioGroup);
    $modal.appendChild(sectionItems);

    /* Section : frites */
    var sectionFrites = el('div', { 'class': 'mis-combo-section' });
    sectionFrites.appendChild(el('p', { 'class': 'mis-combo-section-label', text: tt('combo.frites') }));

    /* Frites maison */
    var rowBase  = el('label', { 'class': 'mis-combo-radio-row is-frites is-checked', 'for': 'mis-cf-base' });
    var inBase   = document.createElement('input');
    inBase.type = 'radio'; inBase.name = 'mis-combo-frites';
    inBase.id = 'mis-cf-base'; inBase.value = 'base'; inBase.checked = true;
    inBase.className = 'mis-combo-radio-input';
    rowBase.appendChild(inBase);
    rowBase.appendChild(el('span', { 'class': 'mis-combo-radio-dot', 'aria-hidden': 'true' }));
    rowBase.appendChild(el('span', { 'class': 'mis-combo-radio-content' }, [
      el('span', { 'class': 'mis-combo-radio-name', text: tt('combo.fritesBase') })
    ]));
    sectionFrites.appendChild(rowBase);

    /* Loaded Frites */
    var rowLoaded = el('label', { 'class': 'mis-combo-radio-row is-frites is-loaded', 'for': 'mis-cf-loaded' });
    var inLoaded  = document.createElement('input');
    inLoaded.type = 'radio'; inLoaded.name = 'mis-combo-frites';
    inLoaded.id = 'mis-cf-loaded'; inLoaded.value = 'loaded';
    inLoaded.className = 'mis-combo-radio-input';
    rowLoaded.appendChild(inLoaded);
    rowLoaded.appendChild(el('span', { 'class': 'mis-combo-radio-dot', 'aria-hidden': 'true' }));
    var loadedContent = el('span', { 'class': 'mis-combo-radio-content' });
    loadedContent.appendChild(el('span', {
      'class': 'mis-combo-radio-name',
      text:    tt('combo.fritesLoaded', { price: fmt(LOADED_SURCHARGE) })
    }));
    rowLoaded.appendChild(loadedContent);
    sectionFrites.appendChild(rowLoaded);

    /* Toggle is-checked sur frites */
    var friteRows = [rowBase, rowLoaded];
    var friteInputs = [inBase, inLoaded];
    for (var f = 0; f < friteInputs.length; f++) {
      (function (inp, row) {
        inp.addEventListener('change', function () {
          friteRows[0].classList.remove('is-checked');
          friteRows[1].classList.remove('is-checked');
          row.classList.add('is-checked');
          updateTotal();
        });
      })(friteInputs[f], friteRows[f]);
    }

    $modal.appendChild(sectionFrites);

    /* Pied : total + boutons */
    var footer   = el('div', { 'class': 'mis-combo-footer' });
    var totalRow = el('div', { 'class': 'mis-combo-total' });
    totalRow.appendChild(el('span', { 'class': 'mis-combo-total-label', text: tt('combo.total') }));
    var totalVal = el('span', { 'class': 'mis-combo-total-value', text: fmt(cfg.basePrice) });
    totalRow.appendChild(totalVal);
    footer.appendChild(totalRow);

    function updateTotal() {
      var loaded = $modal.querySelector('input[name="mis-combo-frites"]:checked');
      totalVal.textContent = fmt(
        (loaded && loaded.value === 'loaded') ? cfg.loadedPrice : cfg.basePrice
      );
    }
    /* Lier updateTotal aux radios frites (déjà fait via change handler ci-dessus) */

    var actions    = el('div', { 'class': 'mis-combo-actions' });
    var cancelBtn  = el('button', { type: 'button', 'class': 'mis-combo-btn-cancel', text: tt('combo.cancel') });
    cancelBtn.addEventListener('click', closeModal);
    actions.appendChild(cancelBtn);

    var confirmBtn = el('button', { type: 'button', 'class': 'mis-combo-btn-confirm' });
    confirmBtn.appendChild(el('span', { text: tt('combo.confirm') }));
    confirmBtn.innerHTML += ' <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12h12l-4-4 1.4-1.4L20.8 12l-6.4 6.4L13 17l4-4H5z" fill="currentColor"/></svg>';
    confirmBtn.addEventListener('click', function () { confirmAdd(cfg, totalVal); });
    actions.appendChild(confirmBtn);
    footer.appendChild(actions);
    $modal.appendChild(footer);

    /* Ouvrir */
    $overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    /* Focus premier radio */
    setTimeout(function () {
      var first = $modal.querySelector('input[type="radio"]');
      if (first) first.focus();
    }, 60);
  }

  function closeModal() {
    if (!$overlay) return;
    $overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    currentId   = null;
    currentName = null;
  }

  /* ---------- Ajoute au panier après confirmation ---------- */
  function confirmAdd(cfg, totalVal) {
    /* Quel plat ? */
    var choiceInput = $modal.querySelector('input[name="mis-combo-choice"]:checked');
    if (!choiceInput) return;
    var choiceItemId = choiceInput.value;
    var choiceLabel  = '';
    for (var i = 0; i < cfg.items.length; i++) {
      if (cfg.items[i].id === choiceItemId) { choiceLabel = cfg.items[i].name; break; }
    }

    /* Frites ? */
    var friteInput = $modal.querySelector('input[name="mis-combo-frites"]:checked');
    var useLoaded  = friteInput && friteInput.value === 'loaded';

    /* ID cart = catalogId + "--" + choix (pour déduplication correcte) */
    var catalogId = useLoaded ? cfg.loadedId : currentId;
    var cartId    = catalogId + '--' + choiceItemId;
    var price     = useLoaded ? cfg.loadedPrice : cfg.basePrice;

    /* Nom affiché dans le panier + sur Stripe */
    var cartName = currentName + ' · ' + choiceLabel;
    if (useLoaded) cartName += ' · Loaded Frites';

    var ok = Cart.addItem({ id: cartId, name: cartName, price: price, qty: 1 });

    closeModal();

    if (ok) {
      showToast(cartName);
      var fab = document.getElementById('mis-cart-fab');
      if (fab) {
        fab.classList.add('is-bump');
        setTimeout(function () { fab.classList.remove('is-bump'); }, 400);
      }
    }
  }

  /* ---------- Init ---------- */
  function init() {
    buildOverlay();

    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-mis-combo]');
      if (!btn) return;
      e.preventDefault();
      var card = btn.closest('[data-product-id]');
      if (!card) return;
      var cId   = card.getAttribute('data-product-id');
      var cName = card.getAttribute('data-product-name') ||
        ((card.querySelector('.street-menu-card-title') || {}).textContent || cId);
      if (!COMBO_CONFIG[cId]) return; /* Sécurité : ignore si pas un combo connu */
      openModal(cId, cName);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
