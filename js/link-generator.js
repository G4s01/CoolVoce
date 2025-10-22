// js/link-generator.js
// Miglioramenti per la generazione link: costruzione sicura, sanitizzazione minimal,
// accessibilità (aria-live), cronologia e separazione di responsabilità.
//
// Include: init() che si registra all'evento 'offers:loaded' dispatchato dal loader.

(function () {
  // Config
  const HISTORY_KEY = 'coolvoce-history';
  const HISTORY_LIMIT = 20;

  // Helpers
  const qs = id => document.getElementById(id);

  function escapeHtml(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Permettiamo solo <br> come markup nel campo desc (presupponendo dati interni/fidati).
  function sanitizeDesc(raw = '') {
    if (!raw) return '';
    // Temporaneo placeholder per i <br>
    const BR = '[[[BR]]]';
    const withPlaceholders = raw.replace(/<br\s*\/?>/gi, BR);
    const escaped = escapeHtml(withPlaceholders);
    return escaped.replace(new RegExp(BR, 'g'), '<br/>');
  }

  function ensureAriaLive() {
    let region = document.getElementById('cv-aria-live');
    if (!region) {
      region = document.createElement('div');
      region.id = 'cv-aria-live';
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('role', 'status');
      // visivamente nascosto ma accessibile
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

  async function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* continue to fallback */ }
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
    } catch (e) {
      return false;
    }
  }

  function announce(msg) {
    const region = ensureAriaLive();
    region.textContent = msg;
    setTimeout(() => { region.textContent = ''; }, 1500);
  }

  // Costruisce link usando URLSearchParams per sicurezza/leggibilità
  function buildCampaignLink({ tipoFlusso, tipoAttivazione, codiceCampagna }) {
    const params = new URLSearchParams({
      tipoFlusso: tipoFlusso || '',
      tipoAttivazione: tipoAttivazione || '',
      codiceCampagna: codiceCampagna || ''
    });
    return `https://shop.coopvoce.it/?${params.toString()}`;
  }

  // Validazione semplice per il codice offerta (evita caratteri strani)
  function normalizeOfferCode(raw) {
    if (!raw) return { code: '', valid: false };
    const trimmed = raw.trim();
    // accetta lettere, numeri, trattino e underscore; se vuoi altri simboli aggiungi qui
    const isValid = /^[A-Za-z0-9\-_]+$/.test(trimmed);
    return { code: trimmed, valid: isValid };
  }

  // Cronologia semplice in localStorage
  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function saveHistoryItem(item) {
    try {
      const arr = loadHistory();
      arr.unshift(item);
      const unique = arr.filter((v, i, a) => a.findIndex(x => x.link === v.link) === i);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(unique.slice(0, HISTORY_LIMIT)));
    } catch (e) { /* noop */ }
  }

  // Crea box link usando DOM APIs (no innerHTML)
  function createLinkBox(link) {
    const box = document.createElement('div');
    box.className = 'link-box latest';

    const main = document.createElement('div');
    main.className = 'link-main';

    const a = document.createElement('a');
    a.href = link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = link;

    main.appendChild(a);

    const actions = document.createElement('div');
    actions.className = 'link-actions';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'open-btn';
    openBtn.textContent = 'APRI';
    openBtn.addEventListener('click', () => window.open(link, '_blank'));

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'COPIA';
    copyBtn.addEventListener('click', async () => {
      const ok = await copyToClipboard(link);
      copyBtn.textContent = ok ? 'Copiato!' : 'Errore';
      announce(ok ? 'Link copiato negli appunti.' : 'Impossibile copiare il link.');
      setTimeout(() => { copyBtn.textContent = 'COPIA'; }, 1200);
    });

    actions.appendChild(openBtn);
    actions.appendChild(copyBtn);

    box.appendChild(main);
    box.appendChild(actions);

    return box;
  }

  // Inizializzazione che prende gli elementi esistenti e imposta handler
  function initUI() {
    const offerSelect = qs('offerSelect');
    const customInput = qs('customOffer');
    const simType = qs('simType');
    const activationType = qs('activationType');
    const generateBtn = qs('generateBtn');
    const offerDescription = qs('offerDescription');
    const linksContainer = qs('linksContainer');

    if (!offerSelect || !customInput || !simType || !activationType || !generateBtn || !offerDescription || !linksContainer) {
      console.warn('Elementi UI mancanti - init aborted');
      return;
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
      const desc = o.desc || '';
      const labelId = String('label-' + key).replace(/[^a-zA-Z0-9\-_:.]/g, '-');
      const descId = String('desc-' + key).replace(/[^a-zA-Z0-9\-_:.]/g, '-');
      offerDescription.innerHTML =
        '<div class="offer-label" id="'+labelId+'" role="heading" aria-level="3">'+escapeHtml(label)+
        ' <span class="offer-key" aria-hidden="true">('+escapeHtml(key)+')</span></div>'+
        '<div class="offer-desc" id="'+descId+'">'+sanitizeDesc(desc)+'</div>';
      offerDescription.style.display = 'block';
      offerDescription.setAttribute('data-offer-key', key);
    }

    function clearLatest() {
      const p = linksContainer.querySelector('.link-box.latest');
      if (p) p.classList.remove('latest');
    }

    // Populate select from offers (offers is global window.CoolVoceOffers)
    function populate(offers) {
      offerSelect.innerHTML = '<option value="">SELEZIONA</option>';
      if (!offers || Object.keys(offers).length === 0) return;
      Object.keys(offers).forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = (offers[key] && offers[key].label) ? offers[key].label : key;
        offerSelect.appendChild(opt);
      });
    }

    // Initialize with existing offers if present
    const offers = window.CoolVoceOffers || {};
    populate(offers);

    offerSelect.addEventListener('change', () => {
      const sel = offerSelect.value;
      if (sel) {
        customInput.value = '';
        if (offers[sel]) showOffer(sel, offers);
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
        if (sel && offers[sel]) showOffer(sel, offers);
      }
    });

    generateBtn.addEventListener('click', async () => {
      const custom = customInput.value.trim();
      const selected = offerSelect.value.trim();
      const chosen = (custom !== '' ? custom : selected);

      // reset shadows
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
      // prepend
      linksContainer.prepend(box);

      // persist history
      saveHistoryItem({ link, ts: Date.now() });

      const ok = await copyToClipboard(link);
      announce(ok ? 'Link copiato negli appunti.' : 'Impossibile copiare il link.');
      // small visual feedback on button
      generateBtn.classList.add('copied');
      const prevText = generateBtn.textContent;
      generateBtn.textContent = ok ? 'COPIATO!' : 'ERRORE';
      setTimeout(() => {
        generateBtn.classList.remove('copied');
        generateBtn.textContent = prevText || 'GENERA';
      }, 1400);
    });

    // small helper tooltip (reuse your existing showTooltip if present)
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
  }

  // Avvia quando le offerte sono pronte (o subito se già caricate)
  function init() {
    ensureAriaLive();
    if (window.CoolVoceOffers && Object.keys(window.CoolVoceOffers).length > 0) {
      initUI();
    } else {
      document.addEventListener('offers:loaded', function handler() {
        document.removeEventListener('offers:loaded', handler);
        initUI();
      });
    }
  }

  // espone init solo internamente; avvia subito
  init();

})();