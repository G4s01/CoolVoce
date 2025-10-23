// js/link-generator.js
// Generatore link per CoolVoce - integrato con DOMPurify per sanitizzazione delle descrizioni.
// Assumiamo formato A (desc: array di righe). Se DOMPurify non è disponibile viene usato fallback escape.

(function () {
  const HISTORY_KEY = 'coolvoce-history';
  const HISTORY_LIMIT = 20;
  const qs = id => document.getElementById(id);

  function escapeHtml(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // sanitizeDescArray: accetta solo array di stringhe (format A).
  // Usa DOMPurify if available; otherwise fallback ad escape + join.
  function sanitizeDescArray(desc) {
    if (!desc) return '';
    if (!Array.isArray(desc)) {
      console.error('CoolVoce: formato "desc" non valido. È richiesto un array di righe (format A).');
      return '';
    }
    // join le righe con <br/>
    const rawHtml = desc.map(d => String(d)).join('<br/>');

    // se DOMPurify presente usalo con allowlist di tag limitata
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
      try {
        return window.DOMPurify.sanitize(rawHtml, { ALLOWED_TAGS: ['br'] });
      } catch (e) {
        console.warn('DOMPurify errore, fallback a escape:', e);
      }
    }

    // fallback: escape ogni riga singolarmente e join con <br/>
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
    } catch (e) {
      return false;
    }
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
      const p = linksContainer.querySelector('.link-box.latest');
      if (p) p.classList.remove('latest');
    }

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

      saveHistoryItem({ link, ts: Date.now() });

      announce('Link generato. Premi "COPIA" per copiare negli appunti.');
      generateBtn.classList.add('copied');
      const prevText = generateBtn.textContent;
      generateBtn.textContent = 'GENERATO';
      setTimeout(() => {
        generateBtn.classList.remove('copied');
        generateBtn.textContent = prevText || 'GENERA';
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
  }

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

  init();

})();