/* =========================================================
   MIS — OPEN STATUS BADGE
   Mount sur tout element [data-mis-open-status].
   Affiche : pastille verte/rouge + label "Ouvert · Ferme a 14h30"
   Update auto chaque minute + sur visibilitychange.
   Depend de cart.js (window.MISCart.openStatus).
========================================================= */
(function () {
  'use strict';
  if (!window.MISCart || typeof window.MISCart.openStatus !== 'function') {
    if (window.console) console.warn('[MIS-OpenStatus] MISCart.openStatus manquant');
    return;
  }
  var Cart = window.MISCart;

  function render() {
    var hosts = document.querySelectorAll('[data-mis-open-status]');
    if (!hosts.length) return;
    var status = Cart.openStatus();
    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      host.classList.remove('is-open', 'is-closed');
      host.classList.add(status.isOpen ? 'is-open' : 'is-closed');

      // Rebuild clean (textContent only, zero injection risk)
      host.replaceChildren();

      var dot = document.createElement('span');
      dot.className = 'mis-status-dot';
      dot.setAttribute('aria-hidden', 'true');

      var label = document.createElement('span');
      label.className = 'mis-status-label';
      // Variante courte si l'host le demande (data-mis-open-status="short")
      var variant = host.getAttribute('data-mis-open-status') || '';
      label.textContent = variant === 'short' ? status.shortLabel : status.label;

      host.appendChild(dot);
      host.appendChild(label);
      host.setAttribute('aria-label', status.label);
      host.setAttribute('role', 'status');
    }
  }

  function init() {
    render();
    // Recalcule toutes les minutes
    setInterval(render, 60 * 1000);
    // Recalcule quand l'onglet revient au premier plan
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') render();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
