// js/offer-loader.js
// Carica ../data/offers.json e deposita window.CoolVoceOffers.
// Dispatcha l'evento 'offers:loaded' a document quando terminato (anche in fallback).
(function () {
  // Risolve il percorso verso data/offers.json rispetto al documento (index.html),
  // quindi funziona indipendentemente da dove si trovi lo script.
  const JSON_PATH = new URL('../data/offers.json', document.baseURI).href;

  function notifyLoaded() {
    try {
      document.dispatchEvent(new CustomEvent('offers:loaded'));
    } catch (e) {
      // silenzia
    }
  }

  async function loadOffers() {
    // Se stai aprendo via file:// il fetch fallirà per motivi di CORS/security:
    // avvisa in console esplicitamente.
    if (location.protocol === 'file:') {
      console.warn('Stai aprendo il file via file:// — i browser bloccano fetch di risorse locali. Avvia un server statico per caricare data/offers.json (es. "npx http-server .").');
      // Imposta fallback vuoto per non rompere la pagina
      window.CoolVoceOffers = {};
      notifyLoaded();
      return;
    }

    try {
      const res = await fetch(JSON_PATH, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = await res.json();
      window.CoolVoceOffers = json;
      console.info('offers loaded from', JSON_PATH);
    } catch (err) {
      console.warn('Impossibile caricare', JSON_PATH, err);
      // Fallback: oggetto vuoto (così la UI non rompe)
      window.CoolVoceOffers = {};
    } finally {
      notifyLoaded();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadOffers);
  } else {
    loadOffers();
  }
})();