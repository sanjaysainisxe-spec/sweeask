/* ============================================================
   SWEEASK — components.js
   Shared utilities, theme manager, and UI components
   Loaded on every page after main content.
   ============================================================ */

(function() {
  'use strict';

  /* ── THEME MANAGER ── */
  var THEME_KEY = 'sweeask-theme';
  var VALID_THEMES = ['default', 'dark', 'light'];

  function setTheme(theme) {
    if (!VALID_THEMES.includes(theme)) theme = 'default';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    // Update all theme buttons on the page
    document.querySelectorAll('[data-theme-btn]').forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-theme-btn') === theme);
    });
    // Dispatch event for any page-specific listeners
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme } }));
  }

  function getTheme() {
    return localStorage.getItem(THEME_KEY) || 'default';
  }

  // Init theme on load
  setTheme(getTheme());

  // Attach click handlers to all theme buttons
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-theme-btn]');
    if (btn) setTheme(btn.getAttribute('data-theme-btn'));
  });

  // Expose globally
  window.SweeaskTheme = { set: setTheme, get: getTheme };


  /* ── MOBILE NAV HAMBURGER ── */
  var hamburger = document.getElementById('hamburger');
  var mobileNav = document.getElementById('mobileNav');
  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', function() {
      var isOpen = mobileNav.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', isOpen);
    });
    // Close on outside click
    document.addEventListener('click', function(e) {
      if (!hamburger.contains(e.target) && !mobileNav.contains(e.target)) {
        mobileNav.classList.remove('open');
      }
    });
    // Close on nav link click
    mobileNav.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', function() {
        mobileNav.classList.remove('open');
      });
    });
  }


  /* ── SCROLL REVEAL ── */
  if ('IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          // Once revealed, stop observing
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal').forEach(function(el) {
      revealObserver.observe(el);
    });
  } else {
    // Fallback: show all immediately
    document.querySelectorAll('.reveal').forEach(function(el) {
      el.classList.add('visible');
    });
  }


  /* ── COUNT-UP ANIMATION ── */
  function animateCount(el, target, suffix) {
    suffix = suffix || '';
    var duration = 1600;
    var steps = Math.min(target, 80);
    var stepTime = duration / steps;
    var current = 0;
    var interval = setInterval(function() {
      current = Math.min(current + Math.ceil(target / steps), target);
      el.textContent = current + suffix;
      if (current >= target) clearInterval(interval);
    }, stepTime);
  }

  if ('IntersectionObserver' in window) {
    var countObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting && !entry.target.dataset.counted) {
          entry.target.dataset.counted = '1';
          var target = parseInt(entry.target.getAttribute('data-count'), 10);
          var suffix = entry.target.getAttribute('data-count-suffix') || '';
          if (!isNaN(target)) animateCount(entry.target, target, suffix);
        }
      });
    }, { threshold: 0.5 });

    document.querySelectorAll('[data-count]').forEach(function(el) {
      countObserver.observe(el);
    });
  }


  /* ── HEADER SCROLL EFFECT ── */
  var header = document.getElementById('main-header');
  if (header) {
    var lastScroll = 0;
    window.addEventListener('scroll', function() {
      var currentScroll = window.scrollY;
      if (currentScroll > 40) {
        header.style.boxShadow = '0 4px 30px rgba(0,0,0,0.25)';
      } else {
        header.style.boxShadow = 'none';
      }
      lastScroll = currentScroll;
    }, { passive: true });
  }


  /* ── PWA INSTALL BUTTON ── */
  var deferredPrompt = null;
  var installBtn = document.getElementById('installBtn');

  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.style.display = 'inline-flex';
  });

  if (installBtn) {
    installBtn.addEventListener('click', async function() {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      var result = await deferredPrompt.userChoice;
      console.log('[PWA] Install choice:', result.outcome);
      deferredPrompt = null;
      installBtn.style.display = 'none';
    });
  }

  window.addEventListener('appinstalled', function() {
    if (installBtn) installBtn.style.display = 'none';
    console.log('[PWA] App installed successfully');
  });


  /* ── SERVICE WORKER REGISTRATION ── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js')
        .then(function(registration) {
          console.log('[SW] Registered, scope:', registration.scope);

          // Listen for updates
          registration.addEventListener('updatefound', function() {
            var newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', function() {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New version available
                  console.log('[SW] New version available');
                  showUpdateBanner();
                }
              });
            }
          });
        })
        .catch(function(err) {
          console.warn('[SW] Registration failed:', err);
        });
    });
  }

  function showUpdateBanner() {
    var banner = document.createElement('div');
    banner.style.cssText = [
      'position:fixed', 'bottom:20px', 'left:50%', 'transform:translateX(-50%)',
      'background:var(--pri)', 'color:#fff', 'padding:12px 20px', 'border-radius:12px',
      'font-size:13px', 'font-weight:700', 'z-index:9999', 'box-shadow:0 4px 20px rgba(124,58,237,0.4)',
      'display:flex', 'align-items:center', 'gap:12px', 'white-space:nowrap'
    ].join(';');
    banner.innerHTML = '🆕 New version available! <button style="background:#fff;color:var(--pri2);border:none;padding:4px 12px;border-radius:6px;font-weight:800;cursor:pointer;font-size:12px" onclick="location.reload()">Reload</button>';
    document.body.appendChild(banner);
    setTimeout(function() { banner.remove(); }, 12000);
  }


  /* ── OFFLINE / ONLINE DETECTION ── */
  function updateOfflineBar() {
    var bar = document.getElementById('off');
    if (!bar) return;
    if (!navigator.onLine) {
      bar.classList.add('on');
    } else {
      bar.classList.remove('on');
    }
  }
  window.addEventListener('online', updateOfflineBar);
  window.addEventListener('offline', updateOfflineBar);
  updateOfflineBar();


  /* ── TOOLTIP UTILITY ── */
  // Simple tooltip for elements with data-tooltip attribute
  document.addEventListener('mouseover', function(e) {
    var el = e.target.closest('[data-tooltip]');
    if (!el) return;
    var existing = document.getElementById('sw-tooltip');
    if (existing) existing.remove();
    var tip = document.createElement('div');
    tip.id = 'sw-tooltip';
    tip.textContent = el.getAttribute('data-tooltip');
    tip.style.cssText = [
      'position:fixed', 'background:var(--surface3)', 'color:var(--t1)',
      'border:1px solid var(--border)', 'border-radius:7px', 'padding:5px 10px',
      'font-size:12px', 'font-weight:600', 'z-index:9999', 'pointer-events:none',
      'box-shadow:var(--shadow2)', 'white-space:nowrap'
    ].join(';');
    document.body.appendChild(tip);
    var rect = el.getBoundingClientRect();
    tip.style.top = (rect.top - tip.offsetHeight - 6) + 'px';
    tip.style.left = (rect.left + rect.width / 2 - tip.offsetWidth / 2) + 'px';
  });
  document.addEventListener('mouseout', function(e) {
    if (e.target.closest('[data-tooltip]')) {
      var tip = document.getElementById('sw-tooltip');
      if (tip) tip.remove();
    }
  });


  /* ── SMOOTH ANCHOR SCROLLING ── */
  document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
    anchor.addEventListener('click', function(e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });


  /* ── ACTIVE NAV LINK HIGHLIGHTER ── */
  (function() {
    var path = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.main-nav a, .mobile-nav a').forEach(function(link) {
      var href = link.getAttribute('href');
      if (href && href.split('#')[0] === path) {
        link.classList.add('active');
      }
    });
  })();


  console.log('[Sweeask] components.js loaded — v1.1.0');

})();
