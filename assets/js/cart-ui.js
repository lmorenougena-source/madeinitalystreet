/* =========================================================
   MIS — CART UI : FAB + drawer + checkout flow
   Depends on cart.js (window.MISCart)
   - Pas d'innerHTML pour user data : tout via textContent
   - HTML structural via template strings statiques (sans user input)
   - ESC pour fermer, focus trap basique, ARIA live regions
========================================================= */
(function () {
  'use strict';
  if (!window.MISCart) {
    if (window.console) console.error('[MIS-Cart-UI] cart.js manquant');
    return;
  }
  var Cart = window.MISCart;

  /* ---------- i18n helper (fallback FR si moteur absent) ---------- */
  function tt(key, vars) {
    if (window.MISI18n && typeof window.MISI18n.t === 'function') {
      return window.MISI18n.t(key, vars);
    }
    return key; // fallback minimaliste — le moteur i18n charge en premier
  }

  /* ---------- Création de la structure DOM ---------- */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v; // uniquement pour SVG statique
        else if (k.indexOf('data-') === 0) node.setAttribute(k, v);
        else if (k.indexOf('aria-') === 0) node.setAttribute(k, v);
        else if (k === 'for') node.setAttribute('for', v);
        else node[k] = v;
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

  /* Icônes SVG inline réutilisables (statiques, safe pour innerHTML) */
  var ICONS = {
    cart: '<svg viewBox="0 0 24 24"><path d="M5 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm10 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM3 4h2l2.7 10.4a2 2 0 0 0 1.94 1.5h7.6a2 2 0 0 0 1.95-1.6L21 8H7"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3 10.6 10.6 16.9 4.3z"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h12l-4-4 1.4-1.4L20.8 12l-6.4 6.4L13 17l4-4H5z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
    wa: '<svg viewBox="0 0 24 24"><path d="M20.5 3.5A11.9 11.9 0 0 0 3.6 20.4L2 22.5l2.2-1.6a11.9 11.9 0 0 0 17.8-15.6 11.8 11.8 0 0 0-1.5-1.8Zm-8.5 18a9.7 9.7 0 0 1-5-1.4l-.4-.2-2.1.6.6-2-.2-.4a9.8 9.8 0 1 1 7.1 3.4Zm5.5-7.3c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.2-.8 1-.9 1.1-.4.2-.7 0a8 8 0 0 1-2.4-1.5 9.1 9.1 0 0 1-1.6-2c-.2-.3 0-.5.1-.7l.5-.5.2-.4a.4.4 0 0 0 0-.4l-.7-1.7c-.2-.5-.4-.4-.6-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2c0 1.2.9 2.4 1 2.6s1.8 2.8 4.4 3.9a14.8 14.8 0 0 0 1.5.6 3.6 3.6 0 0 0 1.6.1 2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .2-1.2c-.1-.1-.3-.2-.6-.4Z"/></svg>',
    info: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 4.5a1.5 1.5 0 1 1-1.5 1.5A1.5 1.5 0 0 1 12 6.5Zm2 11h-4v-1h1v-4h-1v-1h3v5h1Z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z"/></svg>'
  };

  /* Build FAB */
  function buildFAB() {
    var fab = el('button', {
      type: 'button',
      'class': 'mis-cart-fab',
      'aria-label': tt('cart.fab.aria'),
      'data-i18n-attr': 'aria-label:cart.fab.aria',
      id: 'mis-cart-fab',
      html: ICONS.cart + '<span class="mis-cart-count" id="mis-cart-count" aria-hidden="true">0</span>'
    });
    return fab;
  }

    /* ---------- Upsell : produits suggérés (haute marge / fort attach) ---------- */
  // IDs DOIVENT exister dans catalog.json (anti-tampering serveur)
  var UPSELL_POOL = [
    { id: 'sodas',             name: 'Soda 33 cl',      price: 3.0, kind: 'drink' },
    { id: 'birra-italiana',    name: 'Birra Italiana',  price: 4.9, kind: 'drink' },
    { id: 'tiramisu-maison',   name: 'Tiramisu maison', price: 5.9, kind: 'sweet' },
    { id: 'cannoli-siciliani', name: 'Cannoli Siciliani', price: 5.9, kind: 'sweet' },
    { id: 'gelato',            name: 'Gelato (2 boules)', price: 4.5, kind: 'sweet' },
    { id: 'frites-maison',     name: 'Frites maison',   price: 4.5, kind: 'side' }
  ];
  var UPSELL_MAX = 2; // Garder court pour ne pas distraire du checkout

  function pickUpsellSuggestions(snap) {
    if (!snap.items.length) return [];
    var inCart = {};
    for (var i = 0; i < snap.items.length; i++) inCart[snap.items[i].id] = true;
    var available = UPSELL_POOL.filter(function (p) { return !inCart[p.id]; });
    if (!available.length) return [];

    // Priorité : 1 drink + 1 sweet (le mix qui boost le plus le panier moyen)
    var drink = available.find(function (p) { return p.kind === 'drink'; });
    var sweet = available.find(function (p) { return p.kind === 'sweet'; });
    var picks = [];
    if (drink) picks.push(drink);
    if (sweet) picks.push(sweet);
    // Si on n'a pas atteint le max, compléter avec autres dispos
    for (var j = 0; j < available.length && picks.length < UPSELL_MAX; j++) {
      if (picks.indexOf(available[j]) === -1) picks.push(available[j]);
    }
    return picks.slice(0, UPSELL_MAX);
  }

  function renderUpsell(snap) {
    var host = document.getElementById('mis-upsell');
    if (!host) return;
    var picks = pickUpsellSuggestions(snap);
    if (!picks.length) { host.hidden = true; host.replaceChildren(); return; }
    host.hidden = false;
    host.replaceChildren();

    var title = el('h4', { 'class': 'mis-upsell-title', text: tt('cart.upsellTitle') });
    host.appendChild(title);

    var ul = el('ul', { 'class': 'mis-upsell-list' });
    picks.forEach(function (p) {
      var li = el('li', { 'class': 'mis-upsell-item' });
      var info = el('div', { 'class': 'mis-upsell-item-info' });
      info.appendChild(el('p', { 'class': 'mis-upsell-item-name', text: p.name }));
      info.appendChild(el('span', { 'class': 'mis-upsell-item-price', text: Cart.formatPrice(p.price) }));
      var btn = el('button', { type: 'button', 'class': 'mis-upsell-add', 'aria-label': tt('cart.upsellAdd') + ' ' + p.name });
      btn.innerHTML = ICONS.plus + '<span>' + tt('cart.upsellAdd') + '</span>';
      btn.addEventListener('click', function () {
        var ok = Cart.addItem({ id: p.id, name: p.name, price: p.price, qty: 1 });
        if (ok) {
          btn.classList.add('is-added');
          btn.querySelector('span').textContent = tt('cart.added');
          showToast(tt('cart.addedToast', { name: p.name }));
          $fab.classList.add('is-bump');
          setTimeout(function () { $fab.classList.remove('is-bump'); }, 400);
        } else {
          showToast(tt('cart.maxQty'));
        }
      });
      li.appendChild(info);
      li.appendChild(btn);
      ul.appendChild(li);
    });
    host.appendChild(ul);
  }

  /* Build drawer */
  function buildDrawer() {
    var drawer = el('aside', {
      'class': 'mis-cart-drawer',
      id: 'mis-cart-drawer',
      'aria-hidden': 'true',
      'aria-label': 'Panier Click & Collect',
      tabIndex: -1
    });
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    var leadMin = Cart.config.leadTimeMinutes;
    drawer.innerHTML =
      '<header class="mis-cart-header">' +
        '<h2 class="mis-cart-title">' + ICONS.cart + '<span data-i18n="cart.cc">Click &amp; Collect</span></h2>' +
        '<button type="button" class="mis-cart-close" id="mis-cart-close" data-i18n-attr="aria-label:cart.close" aria-label="Fermer le panier">' + ICONS.close + '</button>' +
      '</header>' +

      '<div class="mis-cart-body" id="mis-cart-body">' +
        // VIEW 1 : cart
        '<div class="mis-cart-items-view" id="mis-view-items">' +
          '<ul class="mis-cart-items" id="mis-items-list" aria-live="polite"></ul>' +
          '<div class="mis-upsell" id="mis-upsell" hidden></div>' +
          '<div class="mis-cart-empty" id="mis-empty-state" hidden>' +
            '<span class="mis-empty-emoji" aria-hidden="true">🍔</span>' +
            '<h3 data-i18n="cart.emptyTitle">Ton panier est vide</h3>' +
            '<p data-i18n="cart.emptyDesc">Choisis tes burgers, panini ou loaded fries sur la carte.</p>' +
            '<a href="carte.html" class="mis-btn mis-btn-primary" data-i18n="cart.viewMenu">Voir la carte</a>' +
          '</div>' +
        '</div>' +

        // VIEW 2 : checkout
        '<div class="mis-cart-checkout" id="mis-view-checkout">' +
          '<button type="button" class="mis-cart-back" id="mis-checkout-back">' + ICONS.arrow + ' <span data-i18n="cart.backToCart">Retour au panier</span></button>' +
          '<div class="mis-form-error" id="mis-form-error" role="alert"></div>' +
          '<form id="mis-checkout-form" novalidate autocomplete="on">' +
            '<div class="mis-field">' +
              '<label for="mis-f-name" data-i18n="cart.form.name">Prénom &amp; nom</label>' +
              '<input type="text" id="mis-f-name" name="name" required minlength="2" maxlength="60" autocomplete="name" inputmode="text" data-i18n-attr="placeholder:cart.form.namePh" placeholder="">' +
              '<span class="mis-field-error" id="mis-err-name"></span>' +
            '</div>' +
            '<div class="mis-field">' +
              '<label for="mis-f-phone" data-i18n="cart.form.phone">Téléphone</label>' +
              '<input type="tel" id="mis-f-phone" name="phone" required maxlength="20" autocomplete="tel" inputmode="tel" data-i18n-attr="placeholder:cart.form.phonePh" placeholder="06 12 34 56 78">' +
              '<span class="mis-field-error" id="mis-err-phone"></span>' +
            '</div>' +
            '<div class="mis-field">' +
              '<label for="mis-f-slot" data-i18n="cart.form.slot">Créneau de retrait</label>' +
              '<select id="mis-f-slot" name="slot" required></select>' +
              '<span class="mis-field-error" id="mis-err-slot"></span>' +
            '</div>' +
            '<div class="mis-field">' +
              '<label for="mis-f-email"><span data-i18n="cart.emailLabel">Email</span> <span style="font-weight:400;color:rgba(17,17,17,.5)" data-i18n="cart.emailHint">(reçu de paiement)</span></label>' +
              '<input type="email" id="mis-f-email" name="email" maxlength="120" autocomplete="email" inputmode="email" data-i18n-attr="placeholder:cart.emailPh" placeholder="ton@email.fr">' +
              '<span class="mis-field-error" id="mis-err-email"></span>' +
            '</div>' +
            '<div class="mis-field">' +
              '<label for="mis-f-notes" data-i18n="cart.form.notes">Notes (optionnel)</label>' +
              '<textarea id="mis-f-notes" name="notes" maxlength="300" data-i18n-attr="placeholder:cart.notesPh" placeholder="Allergies, cuisson, instructions…"></textarea>' +
            '</div>' +
            // Honeypot anti-bot
            '<div class="mis-honeypot" aria-hidden="true">' +
              '<label><span data-i18n="cart.honeypot">Ne pas remplir</span> <input type="text" name="website" tabindex="-1" autocomplete="off"></label>' +
            '</div>' +
            // Acceptation CGV — obligatoire (art. L.221-7 Code conso)
            '<div class="mis-cgv-check" id="mis-cgv-wrap">' +
              '<label class="mis-cgv-label">' +
                '<input type="checkbox" id="mis-cgv-cb" name="cgv">' +
                '<span>J\'accepte les <a href="cgv.html" target="_blank" rel="noopener">Conditions Générales de Vente</a></span>' +
              '</label>' +
              '<span class="mis-field-error" id="mis-err-cgv"></span>' +
            '</div>' +
            '<button type="submit" class="mis-btn mis-btn-primary" id="mis-submit-btn" data-action="pay" disabled>' +
              '<svg viewBox="0 0 24 24"><path d="M3 6h18v3H3V6Zm0 5h18v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7Zm3 3v2h4v-2H6Z" fill="currentColor"/></svg>' +
              '<span data-i18n="cart.payBtn">Payer & retirer</span> · <span id="mis-submit-total">0,00 €</span>' +
            '</button>' +
            '<button type="button" class="mis-btn mis-btn-ghost" id="mis-reserve-btn" style="margin-top:8px" data-i18n="cart.reserveWa">' +
              'Réserver sans payer (WhatsApp)' +
            '</button>' +
            '<p class="mis-pay-disclaimer" data-i18n-html="cart.payDisclaimer">Paiement sécurisé Stripe · Carte non stockée · Récupère ta commande avec un <strong>code à 6 caractères</strong>.</p>' +
          '</form>' +
        '</div>' +

        // VIEW 3 : confirmation
        '<div class="mis-cart-confirm mis-confirm" id="mis-view-confirm">' +
          '<div class="mis-confirm-icon">' + ICONS.check + '</div>' +
          '<h3 data-i18n="cart.confirmTitle">Commande prête à partir !</h3>' +
          '<p data-i18n-html="cart.confirmDesc">Clique sur <strong>Envoyer sur WhatsApp</strong> pour transmettre ta commande. On te confirme le créneau dans la minute.</p>' +
          '<div style="text-align:center"><span class="mis-order-id" id="mis-order-id">MIS-…</span></div>' +
          '<div class="mis-confirm-actions">' +
            '<a href="#" id="mis-wa-link" class="mis-btn mis-btn-wa" target="_blank" rel="noopener noreferrer">' + ICONS.wa + '<span data-i18n="cart.sendWa">Envoyer sur WhatsApp</span></a>' +
            '<a href="#" id="mis-mail-link" class="mis-btn mis-btn-ghost" data-i18n="cart.sendMail">Envoyer par email</a>' +
            '<button type="button" class="mis-btn mis-btn-ghost" id="mis-confirm-close" data-i18n="cart.closeBtn">Fermer</button>' +
          '</div>' +
          '<p class="mis-confirm-help"><span data-i18n="cart.confirmHelp">Tu ne vois rien s\'ouvrir ?</span> <a href="#" id="mis-copy-msg" data-i18n="cart.copyMsg">Copier le message</a></p>' +
        '</div>' +
      '</div>' +

      // FOOTER (cart view only)
      '<footer class="mis-cart-footer" id="mis-cart-footer">' +
        '<div class="mis-cart-info-line">' + ICONS.info +
          '<span id="mis-info-line">' + tt('cart.infoLine', { min: leadMin }) + '</span>' +
        '</div>' +
        '<div class="mis-cart-totals">' +
          '<span class="label" data-i18n="cart.total">Total</span>' +
          '<span class="amount" id="mis-cart-total">0,00 €</span>' +
        '</div>' +
        '<button type="button" class="mis-btn mis-btn-primary" id="mis-checkout-btn"><span data-i18n="cart.toCheckout">Commander</span> ' + ICONS.arrow + '</button>' +
      '</footer>';
    return drawer;
  }

  function buildBackdrop() {
    return el('div', { 'class': 'mis-cart-backdrop', id: 'mis-cart-backdrop', 'aria-hidden': 'true' });
  }
  function buildToast() {
    var t = el('div', { 'class': 'mis-toast', id: 'mis-toast', 'aria-live': 'polite', 'aria-atomic': 'true' });
    return t;
  }

  /* ---------- Mount ---------- */
  var $fab, $drawer, $backdrop, $toast;
  var $count, $itemsList, $emptyState, $total, $footer;
  var $viewItems, $viewCheckout, $viewConfirm;
  var $form, $errBox, $orderIdEl, $waLink, $mailLink;
  var lastFocus = null;
  var currentResult = null;
  var toastTimer = null;

  function mount() {
    $fab = buildFAB();
    $drawer = buildDrawer();
    $backdrop = buildBackdrop();
    $toast = buildToast();
    document.body.appendChild($backdrop);
    document.body.appendChild($drawer);
    document.body.appendChild($fab);
    document.body.appendChild($toast);

    // Resolve refs
    $count = document.getElementById('mis-cart-count');
    $itemsList = document.getElementById('mis-items-list');
    $emptyState = document.getElementById('mis-empty-state');
    $total = document.getElementById('mis-cart-total');
    $footer = document.getElementById('mis-cart-footer');
    $viewItems = document.getElementById('mis-view-items');
    $viewCheckout = document.getElementById('mis-view-checkout');
    $viewConfirm = document.getElementById('mis-view-confirm');
    $form = document.getElementById('mis-checkout-form');
    $errBox = document.getElementById('mis-form-error');
    $orderIdEl = document.getElementById('mis-order-id');
    $waLink = document.getElementById('mis-wa-link');
    $mailLink = document.getElementById('mis-mail-link');

    bindEvents();
    render(Cart.snapshot());
    Cart.on(function (snap) { render(snap); });

    // Applique les traductions au drawer fraîchement monté
    if (window.MISI18n && typeof window.MISI18n.apply === 'function') {
      window.MISI18n.apply($drawer);
    }
    // Re-applique sur changement de langue + maj de la ligne dynamique "infoLine"
    window.addEventListener('mis:langchange', function () {
      if (window.MISI18n && typeof window.MISI18n.apply === 'function') {
        window.MISI18n.apply($drawer);
      }
      var info = document.getElementById('mis-info-line');
      if (info) info.textContent = tt('cart.infoLine', { min: Cart.config.leadTimeMinutes });
      // Re-render des items pour rafraichir "/ unité" et "Retirer"
      render(Cart.snapshot());
      // Re-genere les creneaux pour rafraichir placeholders
      var slot = document.getElementById('mis-f-slot');
      if (slot && slot.options.length) populateSlots();
    });
  }

  /* ---------- Render ---------- */
  function render(snap) {
    // Count badge
    if ($count) {
      $count.textContent = String(snap.count);
      if (snap.count > 0) $fab.classList.add('has-items');
      else $fab.classList.remove('has-items');
    }
    if ($total) $total.textContent = Cart.formatPrice(snap.total);
    var submitTotal = document.getElementById('mis-submit-total');
    if (submitTotal) submitTotal.textContent = Cart.formatPrice(snap.total);

    // Items list — full rebuild (panier rarement >20 lignes)
        // Items list — full rebuild (panier rarement >20 lignes)
    if ($itemsList) {
      $itemsList.replaceChildren();
      if (snap.items.length === 0) {
        $emptyState.hidden = false;
        if ($footer) $footer.style.display = 'none';
      } else {
        $emptyState.hidden = true;
        if ($footer) $footer.style.display = '';
        for (var i = 0; i < snap.items.length; i++) {
          $itemsList.appendChild(renderItem(snap.items[i]));
        }
      }
    }

    // Upsell — suggestions complémentaires (boissons + desserts)
    renderUpsell(snap);
  }

  function renderItem(it) {
    var li = el('li', { 'class': 'mis-cart-item', 'data-id': it.id });
    var info = el('div', { 'class': 'mis-cart-item-info' });
    var name = el('p', { 'class': 'mis-cart-item-name', text: it.name });
    var unit = el('span', { 'class': 'mis-cart-item-unit', text: Cart.formatPrice(it.price) + ' ' + tt('cart.itemUnit') });
    info.appendChild(name); info.appendChild(unit);

    var tot = el('span', { 'class': 'mis-cart-item-total', text: Cart.formatPrice(it.price * it.qty) });

    var controls = el('div', { 'class': 'mis-cart-item-controls' });
    var qtyWrap = el('div', { 'class': 'mis-qty' });
    var minus = el('button', { type: 'button', 'aria-label': tt('cart.qtyMinus'), text: '−' });
    var qtySpan = el('span', { text: String(it.qty), 'aria-live': 'polite' });
    var plus = el('button', { type: 'button', 'aria-label': tt('cart.qtyPlus'), text: '+' });
    minus.addEventListener('click', function () { Cart.updateQty(it.id, it.qty - 1); });
    plus.addEventListener('click', function () { Cart.updateQty(it.id, it.qty + 1); });
    qtyWrap.appendChild(minus); qtyWrap.appendChild(qtySpan); qtyWrap.appendChild(plus);

    var rm = el('button', { type: 'button', 'class': 'mis-cart-item-remove', text: tt('cart.remove') });
    rm.addEventListener('click', function () { Cart.removeItem(it.id); });

    controls.appendChild(qtyWrap);
    controls.appendChild(rm);

    li.appendChild(info);
    li.appendChild(tot);
    li.appendChild(controls);
    return li;
  }

  /* ---------- Views ---------- */
  function setView(name) {
    $viewItems.classList.toggle('is-hidden', name !== 'items');
    $viewCheckout.classList.toggle('is-active', name === 'checkout');
    $viewConfirm.classList.toggle('is-active', name === 'confirm');
    if ($footer) $footer.style.display = (name === 'items' && Cart.snapshot().items.length > 0) ? '' : 'none';
    // Focus management
    setTimeout(function () {
      if (name === 'checkout') {
        var f = document.getElementById('mis-f-name'); if (f) f.focus();
      } else if (name === 'confirm') {
        if ($waLink) $waLink.focus();
      }
    }, 50);
  }

  function populateSlots() {
    var sel = document.getElementById('mis-f-slot');
    if (!sel) return;
    sel.replaceChildren();
    var slots = Cart.pickupSlots();
    var placeholder = el('option', { value: '', text: tt('cart.slotPh') });
    placeholder.disabled = true; placeholder.selected = true;
    sel.appendChild(placeholder);
    if (!slots.length) {
      var none = el('option', { value: '', text: tt('cart.slotClosed') });
      none.disabled = true;
      sel.appendChild(none);
      return;
    }
    for (var i = 0; i < slots.length; i++) {
      sel.appendChild(el('option', { value: slots[i].label, text: slots[i].label }));
    }
  }

  /* ---------- Open / close ---------- */
  function openDrawer() {
    lastFocus = document.activeElement;
    $backdrop.classList.add('is-open');
    $backdrop.setAttribute('aria-hidden', 'false');
    $drawer.classList.add('is-open');
    $drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mis-cart-open');
    setView('items');
    // Focus le drawer
    setTimeout(function () { $drawer.focus(); }, 50);
  }
  function closeDrawer() {
    $backdrop.classList.remove('is-open');
    $backdrop.setAttribute('aria-hidden', 'true');
    $drawer.classList.remove('is-open');
    $drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mis-cart-open');
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus(); } catch (_) {}
    }
  }

  /* ---------- Toast ---------- */
  function showToast(message) {
    if (!$toast) return;
    $toast.replaceChildren();
    $toast.innerHTML = ICONS.plus + '<span></span>';
    $toast.lastChild.textContent = message;
    $toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      $toast.classList.remove('is-visible');
    }, 1800);
  }

  /* ---------- Form ---------- */
  function clearFieldErrors() {
    var fields = ['name', 'phone', 'slot'];
    for (var i = 0; i < fields.length; i++) {
      var k = fields[i];
      var f = document.getElementById('mis-f-' + k);
      var errEl = document.getElementById('mis-err-' + k);
      if (f) f.parentNode.classList.remove('has-error');
      if (errEl) errEl.textContent = '';
    }
    if ($errBox) {
      $errBox.classList.remove('is-visible');
      $errBox.textContent = '';
    }
  }
  function showFieldError(k, msg) {
    var f = document.getElementById('mis-f-' + k);
    var errEl = document.getElementById('mis-err-' + k);
    if (f) f.parentNode.classList.add('has-error');
    if (errEl) errEl.textContent = msg;
  }
  function showFormError(msg) {
    if (!$errBox) return;
    $errBox.textContent = msg;
    $errBox.classList.add('is-visible');
  }

  function gatherFormData() {
    return {
      name: document.getElementById('mis-f-name').value,
      phone: document.getElementById('mis-f-phone').value,
      slot: document.getElementById('mis-f-slot').value,
      notes: document.getElementById('mis-f-notes').value,
      email: (document.getElementById('mis-f-email') || { value: '' }).value,
      website: (document.querySelector('input[name="website"]') || { value: '' }).value
    };
  }

  function validateLocal(data) {
    clearFieldErrors();
    var res = Cart.submit(data);
    if (res.ok) {
      // Re-acquire rate-limit slot pour pas bloquer le prochain submit
      try { localStorage.removeItem(Cart.config.rateLimitKey); } catch (_) {}
    }
    if (!res.ok) {
      if (res.errors._spam) { showFormError(tt('cart.errValidate')); return null; }
      if (res.errors._rate) { showFormError(res.errors._rate); return null; }
      if (res.errors.cart) { showFormError(tt('cart.errEmpty')); return null; }
      if (res.errors.name)  showFieldError('name', res.errors.name);
      if (res.errors.phone) showFieldError('phone', res.errors.phone);
      if (res.errors.slot)  showFieldError('slot', res.errors.slot);
      return null;
    }
    return res;
  }

  function handleSubmit(e) {
    e.preventDefault();
    // Flow principal : paiement Stripe
    payAndCheckout();
  }

  function payAndCheckout() {
    // Vérification CGV obligatoire
    var cgvCb = document.getElementById('mis-cgv-cb');
    var cgvErr = document.getElementById('mis-err-cgv');
    if (cgvCb && !cgvCb.checked) {
      if (cgvErr) cgvErr.textContent = 'Vous devez accepter les CGV pour continuer.';
      if (cgvCb.closest('.mis-cgv-check')) cgvCb.closest('.mis-cgv-check').classList.add('has-error');
      cgvCb.focus();
      return;
    }
    if (cgvErr) cgvErr.textContent = '';

    var data = gatherFormData();
    var validated = validateLocal(data);
    if (!validated) return;

    var snap = Cart.snapshot();
    window.misTrack && window.misTrack('checkout_submit', {
      items_count: snap.items.length,
      total: snap.total
    });

    var submitBtn = document.getElementById('mis-submit-btn');
    var origText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="mis-spinner" aria-hidden="true"></span> ' + tt('cart.redirect');
    if ($errBox) $errBox.classList.remove('is-visible');

    var snap = Cart.snapshot();
    var payload = {
      name: validated.clean.name,
      phone: data.phone, // raw format keeps spaces (backend normalises)
      slot: validated.clean.slot,
      notes: validated.clean.notes,
      email: data.email,
      website: data.website,
      items: snap.items.map(function (it) { return { id: it.id, qty: it.qty, name: it.name }; })
    };

    fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('application/json') === -1) {
        // Pas de backend déployé (HTML 404) → erreur claire sans bruit console
        return { ok: false, status: r.status, body: { error: 'Paiement en ligne non disponible — utilise « Réserver sans payer ».' } };
      }
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
    }).then(function (res) {
      if (!res.ok || !res.body.url) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origText;
        showFormError((res.body && res.body.error) || tt('cart.errPay'));
        return;
      }
      window.location.assign(res.body.url);
    }).catch(function () {
      submitBtn.disabled = false;
      submitBtn.innerHTML = origText;
      showFormError(tt('cart.errConn'));
    });
  }

  function reserveViaWhatsApp() {
    var data = gatherFormData();
    var res = validateLocal(data);
    if (!res) return;
    currentResult = res;
    if ($orderIdEl) $orderIdEl.textContent = res.orderId;
    if ($waLink) $waLink.setAttribute('href', res.waLink);
    if ($mailLink) $mailLink.setAttribute('href', res.mailLink);
    Cart.clear();
    setView('confirm');
  }

  /* ---------- Bindings ---------- */
  function bindEvents() {
    $fab.addEventListener('click', openDrawer);
    document.getElementById('mis-cart-close').addEventListener('click', closeDrawer);
    $backdrop.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $drawer.classList.contains('is-open')) closeDrawer();
    });

    document.getElementById('mis-checkout-btn').addEventListener('click', function () {
      if (Cart.snapshot().items.length === 0) return;
      var snap = Cart.snapshot();
      window.misTrack && window.misTrack('begin_checkout', {
        items_count: snap.items.length,
        total: snap.total
      });
      populateSlots();
      setView('checkout');
    });
    document.getElementById('mis-checkout-back').addEventListener('click', function () {
      setView('items');
    });
    document.getElementById('mis-confirm-close').addEventListener('click', closeDrawer);

    if ($form) $form.addEventListener('submit', handleSubmit);
    var reserveBtn = document.getElementById('mis-reserve-btn');
    if (reserveBtn) reserveBtn.addEventListener('click', reserveViaWhatsApp);

    // CGV checkbox : active/désactive le bouton Payer en temps réel
    $form && $form.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'mis-cgv-cb') {
        var submitBtn = document.getElementById('mis-submit-btn');
        if (submitBtn) submitBtn.disabled = !e.target.checked;
        var cgvWrap = document.getElementById('mis-cgv-wrap');
        var cgvErr = document.getElementById('mis-err-cgv');
        if (cgvWrap) cgvWrap.classList.toggle('has-error', false);
        if (cgvErr) cgvErr.textContent = '';
      }
    });

    // Copier message
    var copyBtn = document.getElementById('mis-copy-msg');
    if (copyBtn) {
      copyBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!currentResult) return;
        var msg = currentResult.message;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(msg).then(function () {
            copyBtn.textContent = tt('cart.copied');
            setTimeout(function () { copyBtn.textContent = tt('cart.copyMsg'); }, 2000);
          }).catch(function () { fallbackCopy(msg, copyBtn); });
        } else fallbackCopy(msg, copyBtn);
      });
    }

    // Boutons externes pour ouvrir le panier (CTA Click & Collect, etc.)
    document.addEventListener('click', function (e) {
      var openBtn = e.target.closest && e.target.closest('[data-mis-open], #cc-open-cart');
      if (openBtn) {
        e.preventDefault();
        openDrawer();
      }
    });

    // Bouton "Ajouter au panier" — délégation
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-mis-add]');
      if (!btn) return;
      e.preventDefault();
      var card = btn.closest('[data-product-id]') || btn.closest('.street-menu-card');
      var product = readProductFromCard(card, btn);
      if (!product) return;
      var ok = Cart.addItem(product);
      if (ok) {
        // Tracking conversion : ajout au panier
        window.misTrack && window.misTrack('add_to_cart', {
          product_id: product.id,
          product_name: product.name,
          price: product.price
        });
        showToast(tt('cart.addedToast', { name: product.name }));
        $fab.classList.add('is-bump');
        setTimeout(function () { $fab.classList.remove('is-bump'); }, 400);
        btn.classList.add('is-added');
        var origLabel = btn.getAttribute('data-orig-label');
        if (origLabel === null) btn.setAttribute('data-orig-label', btn.textContent);
        btn.textContent = tt('cart.added');
        setTimeout(function () {
          btn.classList.remove('is-added');
          var orig = btn.getAttribute('data-orig-label');
          if (orig != null) btn.textContent = orig;
        }, 1400);
      } else {
        showToast(tt('cart.maxQty'));
      }
    });
  }

  function fallbackCopy(text, btn) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); btn.textContent = tt('cart.copied'); }
    catch (_) {}
    document.body.removeChild(ta);
    setTimeout(function () { btn.textContent = tt('cart.copyMsg'); }, 2000);
  }

  function readProductFromCard(card, btn) {
    if (!card) return null;
    var id = card.getAttribute('data-product-id') || (btn && btn.getAttribute('data-product-id'));
    var name = card.getAttribute('data-product-name');
    var price = card.getAttribute('data-product-price');
    if (!name) {
      var nameEl = card.querySelector('.street-menu-card-title');
      if (nameEl) name = nameEl.textContent;
    }
    if (price == null) {
      var priceEl = card.querySelector('.street-menu-card-price');
      if (priceEl) price = Cart.parsePriceText(priceEl.textContent);
    } else {
      price = parseFloat(price);
    }
    if (!id && name) id = Cart.slugify(name);
    return { id: id, name: name, price: price };
  }

  /* ---------- Init ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  // Expose helper pour ouvrir depuis l'extérieur (ex : CTA click-collect)
  window.MISCartUI = Object.freeze({
    open: function () { if ($fab) openDrawer(); },
    close: closeDrawer
  });
})();
