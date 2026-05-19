/* =========================================================
   MIS — SUCCESS PAGE
   Récupère la commande post-paiement via /api/get-order,
   affiche code de retrait + QR + récap + actions.
   Zero deps externes (QR encoder vendoré localement).
========================================================= */
(function () {
  'use strict';

  var SESSION_ID_RE = /^cs_(test|live)_[A-Za-z0-9_]{16,200}$/;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function escapeText(s) { return String(s == null ? '' : s); }
  function fmtPrice(n, currency) {
    n = Number(n) || 0;
    return n.toFixed(2).replace('.', ',') + ' ' + (currency === 'EUR' ? '€' : (currency || '€'));
  }
  function buildSVGQR(text, size) {
    // qrcode-generator API : qrcode(typeNumber, errorCorrectionLevel)
    var qr = window.qrcode(0, 'M'); // typeNumber=0 = auto, ECC=M (15%)
    qr.addData(text);
    qr.make();
    var modules = qr.getModuleCount();
    var cell = Math.floor(size / modules);
    var dim = cell * modules;
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + dim + ' ' + dim);
    svg.setAttribute('width', dim);
    svg.setAttribute('height', dim);
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'QR code : ' + text);
    var rect = document.createElementNS(svgNS, 'rect');
    rect.setAttribute('width', dim); rect.setAttribute('height', dim); rect.setAttribute('fill', '#fff');
    svg.appendChild(rect);
    // Aggrégé en path pour perf + plus petit DOM
    var d = '';
    for (var r = 0; r < modules; r++) {
      for (var c = 0; c < modules; c++) {
        if (qr.isDark(r, c)) {
          d += 'M' + (c * cell) + ' ' + (r * cell) + 'h' + cell + 'v' + cell + 'h-' + cell + 'z';
        }
      }
    }
    var path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', '#0E0E0F');
    svg.appendChild(path);
    return svg;
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else node.setAttribute(k, attrs[k]);
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

  function renderError(title, message, allowRetry) {
    var content = $('#content');
    content.replaceChildren();
    var err = el('div', { 'class': 'error' });
    err.appendChild(el('h3', { text: title }));
    err.appendChild(el('p', { text: message }));
    content.appendChild(err);
    var actions = el('div', { 'class': 'actions' });
    actions.appendChild(el('a', { 'class': 'btn btn-primary', href: 'index.html', text: 'Retour à l’accueil' }));
    if (allowRetry) {
      var retry = el('button', { 'class': 'btn btn-ghost', text: 'Réessayer' });
      retry.addEventListener('click', loadOrder);
      actions.appendChild(retry);
    }
    content.appendChild(actions);
  }

  function renderOrder(data) {
    var content = $('#content');
    content.replaceChildren();

    // Title block
    var checkSvg = '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';
    var checkWrap = el('div', { 'class': 'check', 'aria-hidden': 'true' });
    checkWrap.innerHTML = checkSvg;
    content.appendChild(checkWrap);
    content.appendChild(el('h1', { text: 'Paiement confirmé !' }));
    content.appendChild(el('p', { 'class': 'sub', text: 'Présente le code ou le QR au comptoir à l’heure de retrait pour récupérer ta commande.' }));

    // Pickup code block
    var codeBlock = el('div', { 'class': 'code-block' });
    codeBlock.appendChild(el('div', { 'class': 'code-label', text: 'Code de retrait' }));
    codeBlock.appendChild(el('div', { 'class': 'code-value', id: 'pickup-code', text: data.pickup_code || '—' }));
    codeBlock.appendChild(el('div', { 'class': 'code-help', text: 'Affiche-le sur ton téléphone ou note-le. C’est ta preuve de commande.' }));
    content.appendChild(codeBlock);

    // QR code
    if (data.pickup_code && typeof window.qrcode === 'function') {
      try {
        var qrSvg = buildSVGQR(data.pickup_code, 200);
        var qrWrap = el('div', { 'class': 'qr-wrap' });
        qrWrap.appendChild(qrSvg);
        content.appendChild(qrWrap);
        content.appendChild(el('p', { 'class': 'qr-caption', text: 'Scan rapide au comptoir' }));
      } catch (e) {
        if (window.console) console.warn('QR generation failed', e);
      }
    }

    // Info grid
    var info = el('dl', { 'class': 'info-grid' });
    function addInfo(label, value) {
      if (!value) return;
      info.appendChild(el('dt', { text: label }));
      info.appendChild(el('dd', { text: value }));
    }
    addInfo('Client', data.customer_name);
    addInfo('Téléphone', data.customer_phone);
    addInfo('Retrait', data.pickup_slot);
    addInfo('Email', data.email);
    if (data.notes) addInfo('Notes', data.notes);
    content.appendChild(info);

    // Items
    if (data.items && data.items.length) {
      var box = el('div', { 'class': 'items-block' });
      box.appendChild(el('h3', { text: 'Ta commande' }));
      var ul = el('ul');
      data.items.forEach(function (it) {
        var li = el('li');
        li.appendChild(el('span', { text: (it.qty || 1) + '× ' + (it.name || 'Article') }));
        li.appendChild(el('span', { text: fmtPrice(it.amount, data.currency) }));
        ul.appendChild(li);
      });
      box.appendChild(ul);
      var totalRow = el('div', { 'class': 'total' });
      totalRow.appendChild(el('span', { text: 'Total payé' }));
      totalRow.appendChild(el('span', { text: fmtPrice(data.total, data.currency) }));
      box.appendChild(totalRow);
      content.appendChild(box);
    }

    // Actions
    var actions = el('div', { 'class': 'actions' });
    var printBtn = el('button', { 'class': 'btn btn-primary', type: 'button' });
    printBtn.appendChild(document.createTextNode('Imprimer / Sauvegarder en PDF'));
    printBtn.addEventListener('click', function () { window.print(); });
    actions.appendChild(printBtn);
    var homeBtn = el('a', { 'class': 'btn btn-ghost', href: 'index.html', text: 'Retour à l’accueil' });
    actions.appendChild(homeBtn);
    content.appendChild(actions);

    content.appendChild(el('p', {
      'class': 'print-hint',
      text: 'Adresse : Lourdes · Conserve cet écran ou imprime-le pour le retrait.'
    }));
  }

  function loadOrder() {
    var content = $('#content');
    content.replaceChildren();
    var loader = el('div', { 'class': 'loader' });
    loader.innerHTML = '<span class="loader-dot" aria-hidden="true"></span>Vérification du paiement…';
    content.appendChild(loader);

    var params = new URLSearchParams(window.location.search);
    var sid = params.get('session_id') || '';
    if (!SESSION_ID_RE.test(sid)) {
      renderError('Session invalide', 'Le lien de confirmation est incomplet ou expiré. Vérifie le lien reçu après ton paiement.', false);
      return;
    }

    fetch('/api/get-order?session_id=' + encodeURIComponent(sid), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }).then(function (r) {
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('application/json') === -1) {
        return { ok: false, status: r.status, body: { error: 'Service de commande non déployé.' } };
      }
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
    }).then(function (res) {
      if (!res.ok) {
        if (res.status === 402) {
          renderError('Paiement non confirmé', 'Stripe n’a pas (encore) confirmé ton paiement. Patiente quelques secondes puis réessaie.', true);
        } else {
          renderError('Erreur', (res.body && res.body.error) || ('Code ' + res.status), true);
        }
        return;
      }
      renderOrder(res.body || {});
    }).catch(function () {
      renderError('Connexion impossible', 'Vérifie ta connexion internet puis réessaie.', true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadOrder);
  } else {
    loadOrder();
  }

  // Expose renderOrder pour QA / debug / preview (sans risque, c'est un rendu pur)
  window.__MIS_renderOrder = renderOrder;
})();
