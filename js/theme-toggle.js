// js/theme-toggle.js
// Robust theme toggle with persistence and optional conditional theme-file loading.
// - saves choice in localStorage key 'cv-theme' ('dark'|'light')
// - applies class on <html> and <body> for compatibility
// - listens to system preference changes (when no explicit user choice)
// - optionally loads /css/theme.dark.css or /css/theme.light.css if present

(function () {
  const KEY = 'cv-theme';
  const THEME_FILE_ID = 'cv-theme-file';
  const THEME_PATH = '/css/theme.'; // e.g. /css/theme.dark.css or /css/theme.light.css

  // Safe DOM ready helper
  function onDOMReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  // try to dynamically load a theme file (returns Promise)
  function loadThemeFile(theme) {
    return new Promise((resolve) => {
      // remove existing theme file link if any
      const prev = document.getElementById(THEME_FILE_ID);
      if (prev) prev.parentNode.removeChild(prev);

      // create new link
      const href = `${THEME_PATH}${theme}.css`;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.id = THEME_FILE_ID;
      // if the file 404s, onerror will remove it and resolve(false)
      link.onload = () => resolve(true);
      link.onerror = () => {
        try { link.parentNode && link.parentNode.removeChild(link); } catch (e) {}
        resolve(false);
      };
      // append to head (or documentElement)
      const parent = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
      parent.appendChild(link);
      // Note: resolve happens via onload/onerror
    });
  }

  // remove any dynamically loaded theme file
  function removeThemeFile() {
    const prev = document.getElementById(THEME_FILE_ID);
    if (prev) {
      try { prev.parentNode.removeChild(prev); } catch (e) {}
    }
  }

  // Apply theme class and optionally try to load theme file (async)
  async function applyTheme(theme, { tryLoadFile = true } = {}) {
    const isDark = theme === 'dark';
    try {
      document.documentElement.classList.toggle('dark', isDark);
    } catch (e) {}
    try {
      if (document.body) document.body.classList.toggle('dark', isDark);
      else document.addEventListener('DOMContentLoaded', () => document.body.classList.toggle('dark', isDark), { once: true });
    } catch (e) {}

    // set aria-pressed for the button if present
    const btn = document.getElementById('themeToggle');
    if (btn) btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');

    // persist choice
    try { localStorage.setItem(KEY, theme); } catch (e) {}

    if (tryLoadFile) {
      // Attempt to load an explicit theme file (optional). If missing, remove silently.
      const ok = await loadThemeFile(theme);
      if (!ok) {
        // no explicit theme file found — ensure none remains
        removeThemeFile();
      }
    }
  }

  // Determine effective theme: saved preference or system preference
  function getStoredTheme() {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === 'dark' || stored === 'light') return stored;
    } catch (e) {}
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  }

  // Listen to system changes only if user hasn't set an explicit preference
  function watchSystemThemeChanges() {
    try {
      if (!window.matchMedia) return;
      const m = window.matchMedia('(prefers-color-scheme: dark)');
      m.addEventListener ? m.addEventListener('change', onChange) : m.addListener(onChange);
      function onChange(e) {
        // only apply if user didn't set an explicit theme
        try {
          const stored = localStorage.getItem(KEY);
          if (stored === 'dark' || stored === 'light') return;
        } catch (err) { /* ignore */ }
        const theme = e.matches ? 'dark' : 'light';
        applyTheme(theme, { tryLoadFile: true });
      }
    } catch (e) { /* ignore */ }
  }

  // Toggle handler
  function toggleTheme() {
    const currentIsDark = document.documentElement.classList.contains('dark') || (document.body && document.body.classList.contains('dark'));
    const next = currentIsDark ? 'light' : 'dark';
    applyTheme(next, { tryLoadFile: true });
  }

  // Initialize: ensure button exists, set initial state, attach listener(s)
  onDOMReady(() => {
    const button = document.getElementById('themeToggle');
    // If button not yet present, observe DOM until it appears
    if (!button) {
      const obs = new MutationObserver((mutations, observer) => {
        const btn = document.getElementById('themeToggle');
        if (btn) {
          observer.disconnect();
          initButton(btn);
        }
      });
      obs.observe(document.documentElement || document, { childList: true, subtree: true });
      // still apply initial theme even without a button
      applyTheme(getStoredTheme(), { tryLoadFile: true });
      watchSystemThemeChanges();
      return;
    }
    initButton(button);
    applyTheme(getStoredTheme(), { tryLoadFile: true });
    watchSystemThemeChanges();
  });

  function initButton(button) {
    // set initial aria state
    try {
      button.setAttribute('aria-pressed', getStoredTheme() === 'dark' ? 'true' : 'false');
    } catch (e) {}

    // attach click
    button.addEventListener('click', (ev) => {
      ev.preventDefault();
      toggleTheme();
    });

    // allow keyboard activation (Space/Enter)
    button.addEventListener('keydown', (ev) => {
      if (ev.key === ' ' || ev.key === 'Spacebar' || ev.key === 'Enter') {
        ev.preventDefault();
        toggleTheme();
      }
    });
  }

})();