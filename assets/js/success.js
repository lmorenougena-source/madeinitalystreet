/* =========================================================
   MIS — SUCCESS PAGE
   Récupère la commande post-paiement via /api/get-order,
   affiche code de retrait + QR + récap + actions.
   Zero deps externes (QR encoder vendoré localement).
   Multilingue via window.MISI18n.
========================================================= */
(function () {
  'use strict';

  var SESSION_ID_RE = /^cs_(test|live)_[A-Za-z0-9_]{16,200}$/;

  function tt(key, vars) {
    if (window.MISI18n && typeof window.MISI18n.t === 'function') {
      return window.MISI18n.t(key, vars);
    }
    // Fallback FR si i18n non chargé
    var fr = {
      'sx.loading': 'Vérification du paiement…',
      'sx.h1': 'Paiement confirmé !',
      'sx.sub': 'Présente le code ou le QR au comptoir à l’heure de retrait pour récupérer ta commande.',
      'sx.codeLabel': 'Code de retrait',
      'sx.codeHelp': 'Affiche-le sur ton téléphone ou note-le. C’est ta preuve de commande.',
      'sx.qrCaption': 'Scan rapide au comptoir',
      'sx.client': 'Client', 'sx.phone': 'Téléphone', 'sx.slot': 'Retrait',
      'sx.email': 'Email', 'sx.items': 'Ta commande', 'sx.total': 'Total payé',
      'sx.btnPrint': 'Imprimer / Sauvegarder en PDF',
      'sx.btnHome': 'Retour à l’accueil',
      'sx.printHint': 'Adresse : Lourdes · Conserve cet écran ou imprime-le pour le retrait.',
      'sx.errTitle': 'Paiement non vérifié',
      'sx.errBody': 'Nous n’arrivons pas à vérifier ton paiement.'
    };
    return fr[key] || key;
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function fmtPrice(n, currency) {
    n = Number(n) || 0;
    return n.toFixed(2).replace('.', ',') + ' ' + (currency === 'EUR' ? '€' : (currency || '€'));
  }
  function buildSVGQR(text, size) {
    var qr = window.qrcode(0, 'M');
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

  // Cache du dernier payload pour re-render au changement de langue
  var lastPayload = null;
  var lastErrorPayload = null;

  function renderError(titleKey, bodyKey, allowRetry) {
    var content = $('#content');
    if (!content) return;
    content.replaceChildren();
    var err = el('div', { 'class': 'error' });
    err.appendChild(el('h3', { text: tt(titleKey) }));
    err.appendChild(el('p', { text: tt(bodyKey) }));
    content.appendChild(err);
    var actions = el('div', { 'class': 'actions' });
    actions.appendChild(el('a', { 'class': 'btn btn-primary', href: 'index.html', text: tt('sx.btnHome') }));
    if (allowRetry) {
      var retry = el('button', { 'class': 'btn btn-ghost', text: tt('cart.loading') });
      retry.addEventListener('click', loadOrder);
      actions.appendChild(retry);
    }
    content.appendChild(actions);
    lastErrorPayload = { titleKey: titleKey, bodyKey: bodyKey, allowRetry: allowRetry };
    lastPayload = null;
  }

  function renderOrder(data) {
    lastPayload = data;
    lastErrorPayload = null;
    var content = $('#content');
    if (!content) return;
    content.replaceChildren();

    var checkSvg = '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';
    var checkWrap = el('div', { 'class': 'check', 'aria-hidden': 'true' });
    checkWrap.innerHTML = checkSvg;
    content.appendChild(checkWrap);
    content.appendChild(el('h1', { text: tt('sx.h1') }));
    content.appendChild(el('p', { 'class': 'sub', text: tt('sx.sub') }));

    // Pickup code block
    var codeBlock = el('div', { 'class': 'code-block' });
    codeBlock.appendChild(el('div', { 'class': 'code-label', text: tt('sx.codeLabel') }));
    codeBlock.appendChild(el('div', { 'class': 'code-value', id: 'pickup-code', text: data.pickup_code || '—' }));
    codeBlock.appendChild(el('div', { 'class': 'code-help', text: tt('sx.codeHelp') }));
    content.appendChild(codeBlock);

    // QR code
    if (data.pickup_code && typeof window.qrcode === 'function') {
      try {
        var qrSvg = buildSVGQR(data.pickup_code, 200);
        var qrWrap = el('div', { 'class': 'qr-wrap' });
        qrWrap.appendChild(qrSvg);
        content.appendChild(qrWrap);
        content.appendChild(el('p', { 'class': 'qr-caption', text: tt('sx.qrCaption') }));
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
    addInfo(tt('sx.client'), data.customer_name);
    addInfo(tt('sx.phone'), data.customer_phone);
    addInfo(tt('sx.slot'), data.pickup_slot);
    addInfo(tt('sx.email'), data.email);
    if (data.notes) addInfo('Notes', data.notes);
    content.appendChild(info);

    // Items
    if (data.items && data.items.length) {
      var box = el('div', { 'class': 'items-block' });
      box.appendChild(el('h3', { text: tt('sx.items') }));
      var ul = el('ul');
      data.items.forEach(function (it) {
        var li = el('li');
        li.appendChild(el('span', { text: (it.qty || 1) + '× ' + (it.name || 'Article') }));
        li.appendChild(el('span', { text: fmtPrice(it.amount, data.currency) }));
        ul.appendChild(li);
      });
      box.appendChild(ul);
      var totalRow = el('div', { 'class': 'total' });
      totalRow.appendChild(el('span', { text: tt('sx.total') }));
      totalRow.appendChild(el('span', { text: fmtPrice(data.total, data.currency) }));
      box.appendChild(totalRow);
      content.appendChild(box);
    }

    // Actions
    var actions = el('div', { 'class': 'actions' });
    var printBtn = el('button', { 'class': 'btn btn-primary', type: 'button' });
    printBtn.appendChild(document.createTextNode(tt('sx.btnPrint')));
    printBtn.addEventListener('click', function () { window.print(); });
    actions.appendChild(printBtn);
    var homeBtn = el('a', { 'class': 'btn btn-ghost', href: 'index.html', text: tt('sx.btnHome') });
    actions.appendChild(homeBtn);
    content.appendChild(actions);

    content.appendChild(el('p', {
      'class': 'print-hint',
      text: tt('sx.printHint')
    }));
  }

  function loadOrder() {
    var content = $('#content');
    if (!content) return;
    content.replaceChildren();
    var loader = el('div', { 'class': 'loader' });
    var dot = el('span', { 'class': 'loader-dot', 'aria-hidden': 'true' });
    loader.appendChild(dot);
    loader.appendChild(document.createTextNode(tt('sx.loading')));
    content.appendChild(loader);

    var params = new URLSearchParams(window.location.search);
    var sid = params.get('session_id') || '';
    if (!SESSION_ID_RE.test(sid)) {
      renderError('sx.errTitle', 'sx.errBody', false);
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
        renderError('sx.errTitle', 'sx.errBody', true);
        return;
      }
      renderOrder(res.body || {});
    }).catch(function () {
      renderError('sx.errTitle', 'sx.errBody', true);
    });
  }

  // Re-render on language change
  window.addEventListener('mis:langchange', function () {
    if (lastPayload) renderOrder(lastPayload);
    else if (lastErrorPayload) renderError(lastErrorPayload.titleKey, lastErrorPayload.bodyKey, lastErrorPayload.allowRetry);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadOrder);
  } else {
    loadOrder();
  }

  // Expose pour QA / debug / preview
  window.__MIS_renderOrder = renderOrder;
})();
