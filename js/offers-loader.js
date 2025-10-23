// js/offers-loader.js
// Carica ../data/offers.json e deposita window.CoolVoceOffers.
// Implementa caching con ETag / Last-Modified salvati in localStorage e TTL (1 giorno).
// Se fetch restituisce 304 (Not Modified) usa la copia in cache.
// Se sei in file:// usa la cache se presente, altrimenti warn e setta oggetto vuoto.
// Dispatcha l'evento 'offers:loaded' su document quando termina.

(function () {
  const JSON_PATH = new URL('../data/offers.json', document.baseURI).href;
  const CACHE_KEY = 'coolvoce-offers-cache-v1'; // versiona la key per invalidazioni future
  const FETCH_TIMEOUT = 10000; // ms
  const TTL_MS = 24 * 60 * 60 * 1000; // 1 day

  function notifyLoaded() {
    try { document.dispatchEvent(new CustomEvent('offers:loaded')); } catch (e) {}
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

  function writeCache({ etag, lastModified, data }) {
    try {
      const payload = {
        etag: etag || null,
        lastModified: lastModified || null,
        timestamp: Date.now(),
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

  async function loadOffers() {
    // initialize window.CoolVoceOffers to avoid undefined during initialization
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

    // If we have a cached copy that is still within TTL, use it and skip network fetch.
    if (cached && cached.timestamp && (Date.now() - cached.timestamp) < TTL_MS) {
      window.CoolVoceOffers = cached.data || {};
      console.info('offers loaded from cache (within TTL)');
      notifyLoaded();
      return;
    }

    // Otherwise perform conditional fetch (If-None-Match / If-Modified-Since if available)
    try {
      const res = await fetchWithConditionalHeaders(JSON_PATH, cached);
      if (res.status === 200) {
        const json = await res.json();
        const etag = res.headers.get('ETag') || null;
        const lastModified = res.headers.get('Last-Modified') || null;
        writeCache({ etag, lastModified, data: json });
        window.CoolVoceOffers = json;
        console.info('offers loaded from', JSON_PATH, ' (ETag:', etag, ' Last-Modified:', lastModified, ')');
      } else if (res.status === 304) {
        // Not Modified - use cached data if present
        if (cached && cached.data) {
          window.CoolVoceOffers = cached.data;
          // update timestamp to now since we validated it
          writeCache({ etag: cached.etag, lastModified: cached.lastModified, data: cached.data });
          console.info('offers not modified - using cached copy');
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