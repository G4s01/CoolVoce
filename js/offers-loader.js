// js/offers-loader.js
// Carica ../data/offers.json e deposita window.CoolVoceOffers.
// Caching con ETag / Last-Modified salvati in localStorage e TTL (1 giorno).
// Implementa background refresh: se cache è fresca serve immediatamente e in background
// effettua una fetch condizionale per aggiornare la cache e notificare l'app con 'offers:updated'.
//
// Comportamenti:
// - file:// -> usa solo cache se presente (no network).
// - cache entro TTL -> serve immediatamente (notify 'offers:loaded') e background refresh.
// - cache scaduta o assente -> fetch condizionale e notify al termine.
// - dispatcha sempre 'offers:loaded' (prima possibile) e dispatcha 'offers:updated' solo se i dati cambiano.

(function () {
  const JSON_PATH = new URL('../data/offers.json', document.baseURI).href;
  const CACHE_KEY = 'coolvoce-offers-cache-v1';
  const FETCH_TIMEOUT = 10000; // ms
  const TTL_MS = 24 * 60 * 60 * 1000; // 1 day

  function notifyLoaded() {
    try { document.dispatchEvent(new CustomEvent('offers:loaded')); } catch (e) {}
  }
  function notifyUpdated(detail) {
    try { document.dispatchEvent(new CustomEvent('offers:updated', { detail })); } catch (e) {}
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Error reading offers cache', e);
      return null;
    }
  }

  function writeCache({ etag, lastModified, data, timestamp }) {
    try {
      const payload = {
        etag: etag || null,
        lastModified: lastModified || null,
        timestamp: timestamp || Date.now(),
        data: data || {}
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('Error writing offers cache', e);
    }
  }

  function timeoutPromise(ms, promise) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('fetch timeout')), ms);
      promise.then(res => { clearTimeout(timer); resolve(res); }, err => { clearTimeout(timer); reject(err); });
    });
  }

  async function fetchWithConditionalHeaders(url, cached) {
    const headers = {};
    if (cached) {
      if (cached.etag) headers['If-None-Match'] = cached.etag;
      if (cached.lastModified) headers['If-Modified-Since'] = cached.lastModified;
    }
    const opts = { method: 'GET', headers: headers, cache: 'no-store' };
    return timeoutPromise(FETCH_TIMEOUT, fetch(url, opts));
  }

  // Background refresh: performs conditional fetch and updates cache if needed.
  async function backgroundRefresh(cached) {
    try {
      const res = await fetchWithConditionalHeaders(JSON_PATH, cached);
      if (res.status === 200) {
        const json = await res.json();
        const etag = res.headers.get('ETag') || null;
        const lastModified = res.headers.get('Last-Modified') || null;
        // If content differs from cached.data, update and notify
        const cachedStr = cached && cached.data ? JSON.stringify(cached.data) : null;
        const newStr = JSON.stringify(json);
        writeCache({ etag, lastModified, data: json, timestamp: Date.now() });
        if (cachedStr !== newStr) {
          window.CoolVoceOffers = json;
          console.info('offers background refresh: new data loaded and cache updated');
          notifyUpdated({ reason: 'fetched', etag, lastModified, timestamp: Date.now() });
        } else {
          // Data identical, just updated timestamp in cache above
          console.info('offers background refresh: data unchanged; cache timestamp refreshed');
        }
      } else if (res.status === 304) {
        // Not Modified - extend local timestamp so TTL resets
        if (cached && cached.data) {
          writeCache({ etag: cached.etag, lastModified: cached.lastModified, data: cached.data, timestamp: Date.now() });
          console.info('offers background refresh: server 304 Not Modified - TTL refreshed');
        } else {
          console.warn('offers background refresh: server returned 304 but no cached data present');
        }
      } else {
        console.warn('offers background refresh: unexpected HTTP status', res.status, res.statusText);
      }
    } catch (err) {
      console.warn('offers background refresh: fetch failed', err);
      // keep existing cache; nothing else to do
    }
  }

  async function loadOffers() {
    window.CoolVoceOffers = window.CoolVoceOffers || {};
    const cached = readCache();

    // If running from file://, do not attempt network fetch (browsers block it).
    if (location.protocol === 'file:') {
      if (cached && cached.data) {
        window.CoolVoceOffers = cached.data;
        console.info('offers loaded from localStorage cache (file:// mode)');
      } else {
        console.warn('Running via file:// and no cached offers available. Start a static server to enable fetch of data/offers.json.');
        window.CoolVoceOffers = {};
      }
      notifyLoaded();
      return;
    }

    // If we have a cached copy that is still within TTL, serve it immediately
    // and kick off a background refresh to check for updates.
    if (cached && cached.timestamp && (Date.now() - cached.timestamp) < TTL_MS) {
      window.CoolVoceOffers = cached.data || {};
      console.info('offers loaded from cache (within TTL)');
      notifyLoaded();
      // Background refresh does not block UI
      backgroundRefresh(cached);
      return;
    }

    // Otherwise perform conditional fetch (If-None-Match / If-Modified-Since if available)
    try {
      const res = await fetchWithConditionalHeaders(JSON_PATH, cached);
      if (res.status === 200) {
        const json = await res.json();
        const etag = res.headers.get('ETag') || null;
        const lastModified = res.headers.get('Last-Modified') || null;
        writeCache({ etag, lastModified, data: json, timestamp: Date.now() });
        window.CoolVoceOffers = json;
        console.info('offers loaded from', JSON_PATH, ' (ETag:', etag, ' Last-Modified:', lastModified, ')');
      } else if (res.status === 304) {
        // Not Modified - use cached data if present
        if (cached && cached.data) {
          window.CoolVoceOffers = cached.data;
          // update timestamp to now since we validated it
          writeCache({ etag: cached.etag, lastModified: cached.lastModified, data: cached.data, timestamp: Date.now() });
          console.info('offers not modified - using cached copy (validated)');
        } else {
          window.CoolVoceOffers = {};
          console.warn('Server returned 304 but no cached copy present');
        }
      } else {
        console.warn('Unexpected HTTP status while loading offers:', res.status, res.statusText);
        if (cached && cached.data) {
          window.CoolVoceOffers = cached.data;
          console.info('Using cached offers due to HTTP status');
        } else {
          window.CoolVoceOffers = {};
        }
      }
    } catch (err) {
      console.warn('Impossibile caricare', JSON_PATH, err);
      // fallback to cached if available
      if (cached && cached.data) {
        window.CoolVoceOffers = cached.data;
        console.info('offers loaded from localStorage cache after fetch error');
      } else {
        window.CoolVoceOffers = {};
      }
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