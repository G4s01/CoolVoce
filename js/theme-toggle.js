// js/theme-toggle.js
// Theme toggle robusto e accessibile per CoolVoce
(function () {
  const STORAGE_KEY = 'coolvoce-theme';
  const TOGGLE_ID = 'themeToggle';
  const AUTO_DETECT = false; // se vuoi usare prefers-color-scheme impostalo true

  function applyTheme(mode) {
    if (mode === 'dark') document.body.classList.add('dark');
    else document.body.classList.remove('dark');

    const toggle = document.getElementById(TOGGLE_ID);
    if (toggle) {
      toggle.setAttribute('aria-pressed', mode === 'dark' ? 'true' : 'false');
      toggle.title = mode === 'dark' ? 'Passa a tema chiaro' : 'Passa a tema scuro';
    }

    try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) { /* ignore */ }

    try {
      document.dispatchEvent(new CustomEvent('theme:changed', { detail: { mode } }));
    } catch (e) {}
  }

  function readStoredTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function resolveInitialTheme() {
    const stored = readStoredTheme();
    if (stored === 'dark' || stored === 'light') return stored;
    if (AUTO_DETECT && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return document.body.classList.contains('dark') ? 'dark' : 'light';
  }

  function setupToggle(toggleEl) {
    if (!toggleEl) return;

    if (!/button|a/i.test(toggleEl.tagName)) {
      toggleEl.tabIndex = 0;
      toggleEl.setAttribute('role', 'button');
    }

    toggleEl.setAttribute('aria-pressed', document.body.classList.contains('dark') ? 'true' : 'false');

    const onToggle = (ev) => {
      ev && ev.preventDefault && ev.preventDefault();
      const newMode = document.body.classList.contains('dark') ? 'light' : 'dark';
      applyTheme(newMode);
    };

    toggleEl.addEventListener('click', onToggle, { passive: false });
    toggleEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
        ev.preventDefault();
        toggleEl.click();
      }
    });
  }

  function init() {
    const toggleEl = document.getElementById(TOGGLE_ID);

    const initial = resolveInitialTheme();
    applyTheme(initial);

    if (toggleEl) setupToggle(toggleEl);

    console.info('theme-toggle inizializzato, tema attuale:', initial);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();