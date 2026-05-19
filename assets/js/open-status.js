/* =========================================================
   MIS — OPEN STATUS BADGE
   Mount sur tout element [data-mis-open-status].
   Affiche pastille verte/rouge + label traduit.
   Re-render sur changement de langue + chaque minute + visibilitychange.
   Depend de cart.js (window.MISCart.openStatus).
========================================================= */
(function () {
  'use strict';
  if (!window.MISCart || typeof window.MISCart.openStatus !== 'function') {
    if (window.console) console.warn('[MIS-OpenStatus] MISCart.openStatus manquant');
    return;
  }
  var Cart = window.MISCart;

  function tt(key, vars) {
    if (window.MISI18n && typeof window.MISI18n.t === 'function') {
      return window.MISI18n.t(key, vars);
    }
    // Fallback FR
    var fr = {
      'os.open': 'Ouvert',
      'os.openClosesAt': 'Ouvert · Ferme à {time}',
      'os.closed': 'Fermé',
      'os.closedReopenAt': 'Fermé · Rouvre à {time}',
      'os.closedReopenTomorrow': 'Fermé · Rouvre demain à {time}',
      'os.in': 'dans {min} min',
      'os.inHm': 'dans {h}h{m}'
    };
    var raw = fr[key] || key;
    if (vars) {
      raw = raw.replace(/\{(\w+)\}/g, function (_m, k) {
        return (vars[k] != null) ? String(vars[k]) : '{' + k + '}';
      });
    }
    return raw;
  }

  // Construit le label affiché à partir du status brut + i18n
  function buildLabel(status, short) {
    if (short) {
      return status.isOpen ? tt('os.open') : tt('os.closed');
    }
    if (status.isOpen) {
      return tt('os.openClosesAt', { time: status.closesAt || '' });
    }
    if (status.opensTomorrow) {
      return tt('os.closedReopenTomorrow', { time: status.opensAt || '' });
    }
    return tt('os.closedReopenAt', { time: status.opensAt || '' });
  }

  function render() {
    var hosts = document.querySelectorAll('[data-mis-open-status]');
    if (!hosts.length) return;
    var status = Cart.openStatus();
    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      host.classList.remove('is-open', 'is-closed');
      host.classList.add(status.isOpen ? 'is-open' : 'is-closed');

      host.replaceChildren();

      var dot = document.createElement('span');
      dot.className = 'mis-status-dot';
      dot.setAttribute('aria-hidden', 'true');

      var label = document.createElement('span');
      label.className = 'mis-status-label';
      var variant = host.getAttribute('data-mis-open-status') || '';
      var fullLabel = buildLabel(status, false);
      label.textContent = variant === 'short' ? buildLabel(status, true) : fullLabel;

      host.appendChild(dot);
      host.appendChild(label);
      host.setAttribute('aria-label', fullLabel);
      host.setAttribute('role', 'status');
    }
  }

  function init() {
    render();
    setInterval(render, 60 * 1000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') render();
    });
    // Re-render au changement de langue
    window.addEventListener('mis:langchange', render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
