/* =========================================================
   MADE IN ITALY STREET — JS
   Léger, vanilla, focus performance + accessibilité.
========================================================= */

(function () {
  'use strict';

  /* ---------- Vercel Analytics shim + helper track() ---------- */
  // Queue les events avant que le script Vercel soit chargé (CSP-safe : pas d'inline)
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  window.misTrack = function (name, props) {
    try { window.va('event', { name: name, data: props || {} }); } catch (_) {}
  };

  /* ---------- Tracking automatique des clics importants ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    // Click-to-call (tous les liens tel:)
    var telLink = t.closest('a[href^="tel:"]');
    if (telLink) {
      window.misTrack('phone_call', { from: location.pathname });
      return;
    }

    // Click sur WhatsApp
    var waLink = t.closest('a[href*="wa.me/"], a[href*="whatsapp.com"]');
    if (waLink) {
      window.misTrack('whatsapp_click', { from: location.pathname });
      return;
    }

    // Click sur Google Maps (footer ou contact)
    var mapsLink = t.closest('a[href*="google.com/maps"], a[href*="maps.app.goo.gl"]');
    if (mapsLink) {
      window.misTrack('maps_click', { from: location.pathname });
      return;
    }

    // CTA "Commander" / "Voir la carte" sur la home
    var ctaBtn = t.closest('.street-hero-ctas a, .street-mobile-sticky-cta, [data-mis-open]');
    if (ctaBtn) {
      var label = (ctaBtn.textContent || '').trim().slice(0, 40);
      window.misTrack('cta_click', { label: label, from: location.pathname });
    }
  });

  /* ---------- Service Worker (PWA) ---------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function (err) {
        console.warn('SW register failed:', err);
      });
    });
  }

  /* ---------- PWA install prompt (Android/Chrome) ---------- */
  var deferredInstall = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstall = e;
    var btn = document.getElementById('mis-pwa-install');
    if (btn) btn.hidden = false;
  });
  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'mis-pwa-install' && deferredInstall) {
      window.misTrack && window.misTrack('pwa_install_prompted');
      deferredInstall.prompt();
      deferredInstall.userChoice.then(function (choice) {
        window.misTrack && window.misTrack('pwa_install_choice', { outcome: choice.outcome });
      }).finally(function () {
        deferredInstall = null;
        var btn = document.getElementById('mis-pwa-install');
        if (btn) btn.hidden = true;
      });
    }
  });

  /* ---------- Année dynamique footer ---------- */
  const yearEl = document.getElementById('street-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Header : état scrolled ---------- */
  const header = document.getElementById('street-header');
  let lastScroll = 0;
  const onScroll = () => {
    const y = window.scrollY || document.documentElement.scrollTop;
    if (header) header.classList.toggle('is-scrolled', y > 40);
    lastScroll = y;
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Menu mobile ---------- */
  const burger = document.getElementById('street-burger');
  const mobileMenu = document.getElementById('street-mobile-menu');

  const closeMobileMenu = () => {
    if (!burger || !mobileMenu) return;
    burger.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    mobileMenu.classList.remove('is-open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  const openMobileMenu = () => {
    if (!burger || !mobileMenu) return;
    burger.classList.add('is-open');
    burger.setAttribute('aria-expanded', 'true');
    mobileMenu.classList.add('is-open');
    mobileMenu.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  if (burger && mobileMenu) {
    burger.addEventListener('click', () => {
      if (burger.classList.contains('is-open')) closeMobileMenu();
      else openMobileMenu();
    });

    // Fermeture au clic sur un lien
    mobileMenu.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', closeMobileMenu);
    });

    // Fermeture si on revient en desktop
    const mq = window.matchMedia('(min-width: 1024px)');
    mq.addEventListener('change', (e) => { if (e.matches) closeMobileMenu(); });

    // Echap pour fermer
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && burger.classList.contains('is-open')) closeMobileMenu();
    });
  }

  /* ---------- Nav active state au scroll ---------- */
  const navLinks = document.querySelectorAll('.street-nav-link');
  const sections = Array.from(navLinks)
    .map((l) => l.getAttribute('href'))
    .filter((href) => href && href.startsWith('#') && href.length > 1)
    .map((href) => document.querySelector(href))
    .filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    const navObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = '#' + entry.target.id;
            navLinks.forEach((l) => {
              l.classList.toggle('is-active', l.getAttribute('href') === id);
            });
          }
        });
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
    );
    sections.forEach((s) => navObserver.observe(s));
  }

  /* ---------- Reveal animations au scroll ---------- */
  const revealCandidates = [
    '.street-section-head',
    '.street-product',
    '.street-combo',
    '.street-step',
    '.street-pillar',
    '.street-feed-card',
    '.street-contact-card',
    '.street-contact-text',
    '.street-hero-text',
    '.street-hero-visual',
    '.street-section-cta',
  ];

  document.querySelectorAll(revealCandidates.join(',')).forEach((el, i) => {
    el.classList.add('street-reveal');
    const delay = (i % 4) + 1;
    if (delay > 1) el.classList.add('street-reveal-delay-' + Math.min(delay - 1, 3));
  });

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    document.querySelectorAll('.street-reveal').forEach((el) => revealObserver.observe(el));
  } else {
    // Fallback : tout révéler
    document.querySelectorAll('.street-reveal').forEach((el) => el.classList.add('is-visible'));
  }

  /* ---------- Smooth scroll natif sur ancres ---------- */
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href.length <= 1) return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      const headerH = header ? header.offsetHeight : 80;
      const top = target.getBoundingClientRect().top + window.scrollY - headerH + 8;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

  /* ---------- Lenis smooth scroll (chargé en CDN, optionnel) ---------- */
  const initLenis = () => {
    if (typeof window.Lenis !== 'function') return;
    // On laisse Lenis désactivé sur mobile/tactile pour respecter le scroll natif.
    const isTouch = matchMedia('(hover: none)').matches;
    if (isTouch) return;

    const lenis = new window.Lenis({
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      smoothTouch: false,
      wheelMultiplier: 1,
    });

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
    document.documentElement.classList.add('lenis', 'lenis-smooth');
  };

  /* ---------- GSAP micro-effects (optionnel) ---------- */
  const initGsapEffects = () => {
    if (typeof window.gsap !== 'object') return;
    if (typeof window.ScrollTrigger === 'object') window.gsap.registerPlugin(window.ScrollTrigger);

    // Hero title : entrée en cascade
    const heroLines = document.querySelectorAll('.street-hero-title .line');
    if (heroLines.length) {
      window.gsap.from(heroLines, {
        y: 60,
        opacity: 0,
        duration: 1.1,
        ease: 'power3.out',
        stagger: 0.12,
      });
    }

    // Hero plate : léger parallax au scroll
    const plate = document.querySelector('.street-hero-plate');
    if (plate && window.ScrollTrigger) {
      window.gsap.to(plate, {
        y: -80,
        scrollTrigger: {
          trigger: '.street-hero',
          start: 'top top',
          end: 'bottom top',
          scrub: 1,
        },
      });
    }
  };

  // On attend que les CDN soient chargés
  if (document.readyState === 'complete') {
    initLenis();
    initGsapEffects();
  } else {
    window.addEventListener('load', () => {
      initLenis();
      initGsapEffects();
    });
  }

  /* ---------- Mascotte chef : phrases italianes qui tournent ---------- */
  const mascotBubble = document.getElementById('street-mascot-bubble');
  const mascotText = document.getElementById('street-mascot-text');
  const mascotToggle = document.getElementById('street-mascot-toggle');

  if (mascotBubble && mascotText) {
    const phrases = [
      'Buon appetito!',
      'Mamma mia!',
      'Bellissimo!',
      'Mangia, mangia!',
      'Andiamo!',
      'Che bontà!',
      'Pronto a commander?',
      'Smash burger?',
      'Fatto con amore ♥',
      'Cin cin!'
    ];
    let phraseIdx = 0;

    const rotatePhrase = () => {
      mascotBubble.classList.remove('is-showing');
      mascotBubble.classList.add('is-hidden');
      setTimeout(() => {
        phraseIdx = (phraseIdx + 1) % phrases.length;
        mascotText.textContent = phrases[phraseIdx];
        mascotBubble.classList.remove('is-hidden');
        mascotBubble.classList.add('is-showing');
      }, 280);
    };

    // Lancement après le premier affichage initial
    setTimeout(() => {
      mascotBubble.classList.add('is-showing');
    }, 800);

    let rotationInterval = setInterval(rotatePhrase, 4500);

    // Pause au survol
    mascotBubble.addEventListener('mouseenter', () => clearInterval(rotationInterval));
    mascotBubble.addEventListener('mouseleave', () => {
      rotationInterval = setInterval(rotatePhrase, 4500);
    });
  }

  // Clic sur la mascotte : scroll vers la zone commander
  if (mascotToggle) {
    mascotToggle.addEventListener('click', () => {
      const target = document.querySelector('#contact') || document.querySelector('#click-collect');
      if (target) {
        const headerH = header ? header.offsetHeight : 80;
        const top = target.getBoundingClientRect().top + window.scrollY - headerH - 16;
        window.scrollTo({ top, behavior: 'smooth' });
      } else {
        // Sur la page carte, on retourne à l'accueil contact
        window.location.href = 'index.html#contact';
      }
      // Animation rebond
      mascotToggle.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(.85) rotate(6deg)' }, { transform: 'scale(1) rotate(0)' }],
        { duration: 400, easing: 'cubic-bezier(.34, 1.56, .64, 1)' }
      );
    });
  }

  /* ---------- Tabs sticky de la carte ---------- */
  const menuTabs = document.querySelectorAll('.street-menu-tab');
  const menuCategories = Array.from(menuTabs)
    .map((t) => document.querySelector(t.getAttribute('href')))
    .filter(Boolean);

  if (menuTabs.length && menuCategories.length && 'IntersectionObserver' in window) {
    const tabsObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = '#' + entry.target.id;
            menuTabs.forEach((t) => {
              const active = t.getAttribute('href') === id;
              t.classList.toggle('is-active', active);
              if (active) {
                // Scroll horizontal de la tab active dans la vue (mobile)
                t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
              }
            });
          }
        });
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 }
    );
    menuCategories.forEach((c) => tabsObserver.observe(c));
  }

  /* ---------- Easter egg : log signature ---------- */
  if (typeof console !== 'undefined' && console.log) {
    console.log(
      '%c Made in Italy Street %c Fatto con amore ',
      'background:#B71C1C;color:#F4E9D6;padding:6px 12px;font-weight:bold;border-radius:4px 0 0 4px',
      'background:#F5B335;color:#111;padding:6px 12px;font-weight:bold;border-radius:0 4px 4px 0'
    );
  }
})();
