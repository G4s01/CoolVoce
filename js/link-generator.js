// js/link-generator.js
// Generatore link per CoolVoce - integrato con DOMPurify per sanitizzazione delle descrizioni.
// Fix: rimozione robusta dei box (delegated delete + animationend + fallback timeout)
// Fix: ripristino sicuro label GENERA
(function () {
  const HISTORY_KEY = 'coolvoce-history';
  const HISTORY_LIMIT = 20;
  const EXIT_ANIMATION_MS = 180; // must match CSS .link-box.exit duration (180ms)
  const qs = id => document.getElementById(id);

  function escapeHtml(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getOffers() { return window.CoolVoceOffers || {}; }

  function sanitizeDescArray(desc) {
    if (!desc) return '';
    if (!Array.isArray(desc)) {
      console.error('CoolVoce: formato "desc" non valido. È richiesto un array di righe (format A).');
      return '';
    }
    const rawHtml = desc.map(d => String(d)).join('<br/>');
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
      try { return window.DOMPurify.sanitize(rawHtml, { ALLOWED_TAGS: ['br'] }); } catch (e) { console.warn('DOMPurify errore, fallback a escape:', e); }
    }
    return desc.map(line => escapeHtml(String(line))).join('<br/>');
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fallback */ }
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (e) { return false; }
  }

  function ensureAriaLive() {
    let region = document.getElementById('cv-aria-live');
    if (!region) {
      region = document.createElement('div');
      region.id = 'cv-aria-live';
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('role', 'status');
      Object.assign(region.style, {
        position: 'absolute',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
        clip: 'rect(1px, 1px, 1px, 1px)',
        whiteSpace: 'nowrap',
      });
      document.body.appendChild(region);
    }
    return region;
  }

  function announce(msg) {
    const region = ensureAriaLive();
    region.textContent = msg;
    setTimeout(() => { region.textContent = ''; }, 1500);
  }

  function buildCampaignLink({ tipoFlusso, tipoAttivazione, codiceCampagna }) {
    const params = new URLSearchParams({
      tipoFlusso: tipoFlusso || '',
      tipoAttivazione: tipoAttivazione || '',
      codiceCampagna: codiceCampagna || ''
    });
    return `https://shop.coopvoce.it/?${params.toString()}`;
  }

  function normalizeOfferCode(raw) {
    if (!raw) return { code: '', valid: false };
    const trimmed = raw.trim();
    const isValid = /^[A-Za-z0-9\-_]+$/.test(trimmed);
    return { code: trimmed, valid: isValid };
  }

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveHistoryItem(item) {
    try {
      const arr = loadHistory();
      arr.unshift(item);
      const unique = arr.filter((v, i, a) => a.findIndex(x => x.link === v.link) === i);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(unique.slice(0, HISTORY_LIMIT)));
    } catch (e) {}
  }
  function removeHistoryLink(link) {
    try {
      const arr = loadHistory();
      const filtered = arr.filter(i => i.link !== link);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
    } catch (e) {}
  }

  function createLinkBox(link) {
    const box = document.createElement('div');
    box.className = 'link-box';
    box.dataset.link = link;

    const main = document.createElement('div');
    main.className = 'link-main';
    const a = document.createElement('a');
    a.href = link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = link;
    main.appendChild(a);

    const controls = document.createElement('div');
    controls.className = 'link-controls';

    const actionsCol = document.createElement('div');
    actionsCol.className = 'actions-column';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'open';
    openBtn.textContent = 'APRI';
    openBtn.addEventListener('click', () => window.open(link, '_blank'));

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'copy';
    copyBtn.textContent = 'COPIA';
    copyBtn.addEventListener('click', async () => {
      const ok = await copyToClipboard(link);
      copyBtn.textContent = ok ? 'Copiato!' : 'Errore';
      announce(ok ? 'Link copiato negli appunti.' : 'Impossibile copiare il link.');
      setTimeout(() => { copyBtn.textContent = 'COPIA'; }, 1200);
    });

    actionsCol.appendChild(openBtn);
    actionsCol.appendChild(copyBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn';
    deleteBtn.setAttribute('aria-label', 'Rimuovi link');
    const xSpan = document.createElement('span');
    xSpan.className = 'x';
    xSpan.textContent = '✕';
    deleteBtn.appendChild(xSpan);

    controls.appendChild(actionsCol);
    controls.appendChild(deleteBtn);

    box.appendChild(main);
    box.appendChild(controls);

    // entry animation
    box.classList.add('enter');
    box.addEventListener('animationend', () => box.classList.remove('enter'), { once: true });

    return box;
  }

  function initUI() {
    const offerSelect = qs('offerSelect');
    const customInput = qs('customOffer');
    const simType = qs('simType');
    const activationType = qs('activationType');
    const generateBtn = qs('generateBtn');
    const offerDescription = qs('offerDescription');
    const linksContainer = qs('linksContainer');
    const controlsGrid = document.querySelector('.controls-grid');

    const clearBtn = qs('clearLinksBtn');
    const linksBadge = qs('linksCountBadge');

    if (!offerSelect || !customInput || !simType || !activationType || !generateBtn || !offerDescription || !linksContainer) {
      console.warn('Elementi UI mancanti - init aborted');
      return { refresh: () => {}, controlsGrid: controlsGrid };
    }

    function hideDescription() {
      offerDescription.style.display = 'none';
      offerDescription.innerHTML = '';
      offerDescription.removeAttribute('data-offer-key');
    }

    function showOffer(key, offers) {
      if (!key || !offers || !offers[key]) return hideDescription();
      const o = offers[key];
      const label = o.label || key;
      const desc = o.desc;
      const labelId = String('label-' + key).replace(/[^a-zA-Z0-9\-_:.]/g, '-');
      const descId = String('desc-' + key).replace(/[^a-zA-Z0-9\-_:.]/g, '-');

      const descHtml = sanitizeDescArray(desc);
      offerDescription.innerHTML =
        '<div class="offer-label" id="'+labelId+'" role="heading" aria-level="3">'+escapeHtml(label)+
        ' <span class="offer-key" aria-hidden="true">('+escapeHtml(key)+')</span></div>'+
        '<div class="offer-desc" id="'+descId+'">'+descHtml+'</div>';

      if (descHtml) {
        offerDescription.style.display = 'block';
        offerDescription.setAttribute('data-offer-key', key);
      } else {
        offerDescription.style.display = 'none';
        offerDescription.removeAttribute('data-offer-key');
      }
    }

    function clearLatest() {
      const items = linksContainer.querySelectorAll('.link-box.latest');
      items.forEach(it => it.classList.remove('latest'));
    }

    function populate(offers) {
      const prevSelected = offerSelect.value;
      offerSelect.innerHTML = '<option value="">SELEZIONA</option>';
      if (!offers || Object.keys(offers).length === 0) return;
      Object.keys(offers).forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = (offers[key] && offers[key].label) ? offers[key].label : key;
        offerSelect.appendChild(opt);
      });
      if (prevSelected) {
        const stillExists = !!(offers && offers[prevSelected]);
        if (stillExists) { offerSelect.value = prevSelected; } else { offerSelect.value = ''; }
      }
    }

    populate(getOffers());

    function updateLinksCount() {
      const domCount = linksContainer ? linksContainer.querySelectorAll('.link-box').length : 0;
      const hist = loadHistory();
      const histCount = Array.isArray(hist) ? hist.length : 0;

      let count = domCount;
      if (domCount === 0 && histCount > 0) {
        try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
        count = 0;
      }

      if (linksBadge) linksBadge.textContent = String(count);
      if (clearBtn) clearBtn.setAttribute('aria-label', `Svuota i link generati (${count} presenti)`);
    }

    // Delegated delete handler (defensive + fallback)
    linksContainer.addEventListener('click', function (ev) {
      const btn = ev.target && ev.target.closest ? ev.target.closest('.delete-btn') : null;
      if (!btn) return;
      const box = btn.closest('.link-box');
      if (!box) return;
      // already deleting?
      if (box.dataset.deleting === '1') return;
      box.dataset.deleting = '1';
      const link = box.dataset.link || (box.querySelector && box.querySelector('a') && box.querySelector('a').href) || null;
      const wasLatest = box.classList.contains('latest');

      // ensure any previous exit listener is removed
      const removeHandlers = [];
      const removeNow = () => {
        // cleanup listeners
        removeHandlers.forEach(fn => box.removeEventListener('animationend', fn));
        // remove element (if still present)
        if (box && box.parentNode) box.parentNode.removeChild(box);
        // update history
        try { if (link) removeHistoryLink(link); } catch (err) {}
        // dispatch event
        try { document.dispatchEvent(new CustomEvent('link:removed', { detail: { link, removedWasLatest: wasLatest } })); } catch (err) {}
        // reassign latest if needed
        if (wasLatest) {
          requestAnimationFrame(() => {
            const first = linksContainer.querySelector('.link-box');
            if (first) {
              linksContainer.querySelectorAll('.link-box.latest').forEach(it => it.classList.remove('latest'));
              first.classList.add('latest');
            }
            updateLinksCount();
            announce('Link rimosso.');
          });
        } else {
          updateLinksCount();
          announce('Link rimosso.');
        }
      };

      // start exit animation
      box.classList.add('exit');

      // animationend handler, ensure comes from the box itself
      const onAnimEnd = (e) => {
        if (e && e.target !== box) return;
        clearTimeout(fallbackTimer);
        removeNow();
      };
      removeHandlers.push(onAnimEnd);
      box.addEventListener('animationend', onAnimEnd, { once: true });

      // fallback: ensure removal even if animationend doesn't fire (duration + small margin)
      const fallbackTimer = setTimeout(() => {
        // prevent double removal
        try { box.removeEventListener('animationend', onAnimEnd); } catch (e) {}
        removeNow();
      }, EXIT_ANIMATION_MS + 60);
    });

    // clear all (animate then remove)
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const items = Array.from(linksContainer.querySelectorAll('.link-box'));
        if (items.length === 0) {
          announce('Non ci sono link da cancellare.');
          try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
          updateLinksCount();
          return;
        }
        items.forEach(it => {
          if (it.dataset.deleting !== '1') {
            it.dataset.deleting = '1';
            it.classList.add('exit');
          }
        });
        // remove after animation duration (plus margin)
        setTimeout(() => {
          linksContainer.innerHTML = '';
          try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
          updateLinksCount();
          announce('Elenco link svuotato.');
        }, EXIT_ANIMATION_MS + 60);
      });
    }

    offerSelect.addEventListener('change', () => {
      const sel = offerSelect.value;
      if (sel) {
        customInput.value = '';
        const offersNow = getOffers();
        if (offersNow[sel]) showOffer(sel, offersNow);
        else hideDescription();
      } else hideDescription();
    });

    customInput.addEventListener('input', () => {
      const v = customInput.value.trim();
      if (v) {
        if (offerSelect.value !== '') offerSelect.value = '';
        hideDescription();
      } else {
        const sel = offerSelect.value;
        const offersNow = getOffers();
        if (sel && offersNow[sel]) showOffer(sel, offersNow);
      }
    });

    generateBtn.addEventListener('click', async () => {
      const custom = customInput.value.trim();
      const selected = offerSelect.value.trim();
      const chosen = (custom !== '' ? custom : selected);

      customInput.style.boxShadow = '0 4px 10px rgba(0,0,0,0.06)';
      offerSelect.style.boxShadow = '0 4px 10px rgba(0,0,0,0.06)';

      if (!chosen) {
        customInput.style.boxShadow = '0 0 0 4px rgba(211,47,47,0.12)';
        offerSelect.style.boxShadow = '0 0 0 4px rgba(211,47,47,0.12)';
        announce('Seleziona o inserisci il codice offerta.');
        setTimeout(() => {
          customInput.style.boxShadow = '0 4px 10px rgba(0,0,0,0.06)';
          offerSelect.style.boxShadow = '0 4px 10px rgba(0,0,0,0.06)';
        }, 700);
        return;
      }

      const { code, valid } = normalizeOfferCode(chosen);
      if (!valid) {
        showTooltip('Codice non valido: usa solo lettere, numeri, - e _');
        announce('Codice offerta non valido.');
        return;
      }

      const tipoFlusso = simType.value;
      const tipoAttivazione = activationType.value;
      const prefix = tipoFlusso === 'ESIM' ? 'ES_' : '';
      const rawCode = prefix + code;
      const link = buildCampaignLink({ tipoFlusso, tipoAttivazione, codiceCampagna: rawCode });

      clearLatest();
      const box = createLinkBox(link);
      linksContainer.prepend(box);
      box.classList.add('latest');

      saveHistoryItem({ link, ts: Date.now() });

      updateLinksCount();

      announce('Link generato. Premi "COPIA" per copiare negli appunti.');
      generateBtn.classList.add('copied');
      generateBtn.textContent = 'GENERATO';
      setTimeout(() => {
        generateBtn.classList.remove('copied');
        generateBtn.textContent = 'GENERA';
      }, 1400);
    });

    function showTooltip(msg) {
      const t = document.createElement('div');
      t.textContent = msg;
      t.style.position = 'fixed';
      t.style.bottom = '90px';
      t.style.left = '50%';
      t.style.transform = 'translateX(-50%)';
      t.style.background = 'rgba(179,0,0,0.9)';
      t.style.color = '#fff';
      t.style.padding = '10px 16px';
      t.style.borderRadius = '10px';
      t.style.fontWeight = '600';
      t.style.zIndex = '9999';
      t.style.opacity = '0';
      t.style.transition = 'opacity .3s ease';
      document.body.appendChild(t);
      requestAnimationFrame(() => t.style.opacity = '1');
      setTimeout(() => { t.style.opacity = '0'; setTimeout(()=> t.remove(),300); }, 1500);
    }

    function refresh() {
      const currentOffers = getOffers();
      const prevSelected = offerSelect.value;
      const prevCustom = customInput.value.trim();

      populate(currentOffers);

      if (prevCustom) {
        console.info('Offers refreshed in background; preserving custom input in progress.');
        return;
      }

      if (prevSelected) {
        if (currentOffers[prevSelected]) {
          showOffer(prevSelected, currentOffers);
          announce('Elenco offerte aggiornato — la selezione è stata mantenuta.');
        } else {
          hideDescription();
          offerSelect.value = '';
          announce("L'offerta selezionata non è più disponibile dopo l'aggiornamento.");
        }
      }
    }

    updateLinksCount();
    return { refresh, controlsGrid };
  }

  function isElementVisibleInViewport(el) {
    if (!el) return false;
    if (!(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= (window.innerHeight || document.documentElement.clientHeight);
  }

  function init() {
    ensureAriaLive();
    const uiHandle = initUI();
    const controlsGrid = uiHandle && uiHandle.controlsGrid ? uiHandle.controlsGrid : document.querySelector('.controls-grid');

    let pendingOffersUpdate = false;
    let observer = null;
    let fallbackListenersAttached = false;

    function applyUpdateIfVisible() {
      if (!uiHandle || typeof uiHandle.refresh !== 'function') return;
      if (isElementVisibleInViewport(controlsGrid)) {
        uiHandle.refresh();
        pendingOffersUpdate = false;
        if (observer) { observer.disconnect(); observer = null; }
        if (fallbackListenersAttached) {
          window.removeEventListener('scroll', onViewportCheck);
          window.removeEventListener('resize', onViewportCheck);
          window.removeEventListener('focus', onViewportCheck);
          fallbackListenersAttached = false;
        }
      }
    }

    function onViewportCheck() { applyUpdateIfVisible(); }

    document.addEventListener('offers:updated', function (ev) {
      try {
        if (isElementVisibleInViewport(controlsGrid)) {
          if (uiHandle && typeof uiHandle.refresh === 'function') uiHandle.refresh();
          console.info('offers:updated applied immediately (controls visible)');
        } else {
          pendingOffersUpdate = true;
          announce('Aggiornamento offerte disponibile.');
          if ('IntersectionObserver' in window && controlsGrid) {
            if (observer) observer.disconnect();
            observer = new IntersectionObserver((entries) => {
              for (const entry of entries) {
                if (entry.isIntersecting) { applyUpdateIfVisible(); }
              }
            }, { root: null, threshold: 0.1, rootMargin: '0px 0px -15% 0px' });
            try { observer.observe(controlsGrid); } catch (e) { if (observer) { observer.disconnect(); observer = null; } }
          }
          if (!observer && !fallbackListenersAttached) {
            window.addEventListener('scroll', onViewportCheck, { passive: true });
            window.addEventListener('resize', onViewportCheck, { passive: true });
            window.addEventListener('focus', onViewportCheck, { passive: true });
            fallbackListenersAttached = true;
          }
          console.info('offers:updated received; update deferred until offers panel visible.');
        }
      } catch (e) {
        console.warn('Error handling offers:updated', e);
      }
    });

    if (!window.CoolVoceOffers || Object.keys(window.CoolVoceOffers).length === 0) {
      document.addEventListener('offers:loaded', function handler() {
        document.removeEventListener('offers:loaded', handler);
        if (uiHandle && typeof uiHandle.refresh === 'function') uiHandle.refresh();
      });
    }

    document.addEventListener('click', function (ev) {
      const target = ev.target;
      if (!target) return;
      if (target.id === 'offerSelect' || (target.closest && target.closest('.controls-grid'))) {
        if (pendingOffersUpdate) applyUpdateIfVisible();
      }
    }, { passive: true });

    console.info('link-generator initialized with conditional offers refresh (threshold 0.1, rootMargin -15%).');
  }

  // start
  init();

})();