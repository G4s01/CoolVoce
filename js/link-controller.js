// js/link-controller.js
// Orchestrator: connette UI (DOM) -> link-creator -> link-store -> link-renderer.
// Miglioramenti UX/accessibilità: focus management, keyboard shortcuts per le link-box.
// Aggiunta gestione visuale degli errori sugli input/select quando GENERA è premuto senza dati.

import { buildCampaignLink, normalizeOfferCode } from './link-creator.js';
import * as store from './link-store.js';
import { createRenderer } from './link-renderer.js';
import { copyToClipboard, announce, sanitizeHtml, escapeHtml } from './utils.js';
import { EVENTS } from './events.js';

export function initLinkController(options = {}) {
  const {
    containerSelector = '#linksContainer',
    badgeSelector = '#linksCountBadge',
    generateBtnSelector = '#generateBtn',
    offerSelectId = 'offerSelect',
    customOfferId = 'customOffer',
    simTypeId = 'simType',
    activationTypeId = 'activationType',
    clearBtnSelector = '#clearLinksBtn',
    offerDescriptionId = 'offerDescription'
  } = options;

  const container = document.querySelector(containerSelector);
  const badge = document.querySelector(badgeSelector);
  const generateBtn = document.querySelector(generateBtnSelector);
  const offerSelect = document.getElementById(offerSelectId);
  const customOffer = document.getElementById(customOfferId);
  const simType = document.getElementById(simTypeId);
  const activationType = document.getElementById(activationTypeId);
  const clearBtn = document.querySelector(clearBtnSelector);
  const offerDescription = document.getElementById(offerDescriptionId);

  if (!container || !generateBtn) {
    console.warn('initLinkController: required DOM elements missing');
    return null;
  }

  const renderer = createRenderer(container, {
    badgeElement: badge,
    onRemove: (link) => {
      if (link) store.removeHistoryLink(link);
      document.dispatchEvent(new CustomEvent(EVENTS.LINK_REMOVED, { detail: { link } }));
    },
    onAdd: (link) => {
      // optional
    }
  });

  // ---- OFFERS helpers ----
  function getOffersFromWindow() {
    return (window.CoolVoceOffers && typeof window.CoolVoceOffers === 'object') ? window.CoolVoceOffers : {};
  }

  function populateOffers(offers) {
    if (!offerSelect) return;
    const prevSelected = offerSelect.value;
    offerSelect.innerHTML = '<option value="">SELEZIONA</option>';
    const keys = Object.keys(offers || {});
    if (keys.length === 0) return;
    keys.forEach(key => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = (offers[key] && offers[key].label) ? offers[key].label : key;
      offerSelect.appendChild(opt);
    });
    if (prevSelected) {
      const stillExists = !!(offers && offers[prevSelected]);
      offerSelect.value = stillExists ? prevSelected : '';
    }
  }

  function hideDescription() {
    if (!offerDescription) return;
    offerDescription.style.display = 'none';
    offerDescription.innerHTML = '';
    offerDescription.removeAttribute('data-offer-key');
  }

  function showOffer(key) {
    if (!offerDescription) return;
    const offers = getOffersFromWindow();
    if (!key || !offers || !offers[key]) {
      hideDescription();
      return;
    }
    const o = offers[key];
    const label = o.label || key;
    const desc = o.desc;
    const labelId = String('label-' + key).replace(/[^a-zA-Z0-9\-_:.]/g, '-');
    const descId = String('desc-' + key).replace(/[^a-zA-Z0-9\-_:.]/g, '-');

    let rawHtml = '';
    if (Array.isArray(desc)) rawHtml = desc.map(d => String(d)).join('<br/>');
    else if (desc != null) rawHtml = String(desc).replace(/\n/g, '<br/>');

    let descHtml = '';
    try { descHtml = sanitizeHtml(rawHtml, { ALLOWED_TAGS: ['br'] }); }
    catch (e) { descHtml = escapeHtml(rawHtml).replace(/\n/g, '<br/>'); }

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

  // initial populate
  try {
    const offers = getOffersFromWindow();
    populateOffers(offers);
    if (offerSelect && offerSelect.value) showOffer(offerSelect.value);
  } catch (e) { /* ignore */ }

  document.addEventListener(EVENTS.OFFERS_LOADED, () => {
    try {
      const offers = getOffersFromWindow();
      populateOffers(offers);
      if (offerSelect && offerSelect.value) showOffer(offerSelect.value);
    } catch (e) { console.warn('offers:loaded handler error', e); }
  });

  document.addEventListener(EVENTS.OFFERS_UPDATED, () => {
    try {
      const offers = getOffersFromWindow();
      populateOffers(offers);
      announce('Elenco offerte aggiornato.');
      if (offerSelect && offerSelect.value) showOffer(offerSelect.value);
    } catch (e) { console.warn('offers:updated handler error', e); }
  });

  // ---- UI interactions: select / custom ----
  if (offerSelect) {
    offerSelect.addEventListener('change', () => {
      const sel = offerSelect.value;
      if (sel) {
        if (customOffer) customOffer.value = '';
        showOffer(sel);
      } else {
        hideDescription();
      }
    });
  }

  if (customOffer) {
    customOffer.addEventListener('input', () => {
      const v = customOffer.value.trim();
      if (v) {
        if (offerSelect && offerSelect.value !== '') offerSelect.value = '';
        hideDescription();
      } else {
        const sel = offerSelect && offerSelect.value;
        if (sel) showOffer(sel);
      }
    });
  }

  // ---- Error visual helper (adds red border + shake animation briefly) ----
  function showFieldError(el) {
    if (!el) return;
    el.classList.add('input-error');
    // add shake and remove it shortly after
    el.classList.add('shake');
    try { el.focus(); } catch (e) {}
    setTimeout(() => {
      el.classList.remove('shake');
    }, 700);
    // remove persistent error after a bit (if needed)
    setTimeout(() => {
      el.classList.remove('input-error');
    }, 1400);
  }

  // ---- Delegated click handlers (copy/open/delete) ----
  container.addEventListener('click', async (ev) => {
    const btn = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (!btn) return;

    if (btn.classList.contains('copy')) {
      const box = btn.closest('.link-box');
      const href = box && box.dataset && box.dataset.link;
      if (href) {
        const ok = await copyToClipboard(href);
        btn.textContent = ok ? 'Copiato!' : 'Errore';
        announce(ok ? 'Link copiato negli appunti.' : 'Impossibile copiare il link.');
        setTimeout(() => { btn.textContent = 'COPIA'; }, 1200);
      }
      return;
    }

    if (btn.classList.contains('open')) {
      const box = btn.closest('.link-box');
      const href = box && box.dataset && box.dataset.link;
      if (href) window.open(href, '_blank');
      return;
    }

    if (btn.classList.contains('delete-btn')) {
      const box = btn.closest('.link-box');
      if (box) {
        // determine next focus target before removal
        const next = box.nextElementSibling || box.previousElementSibling || null;
        try {
          await renderer.removeByElement(box, { dispatchRemove: true });
        } catch (e) { /* swallow */ }
        // set sensible focus
        if (next && next.focus) next.focus();
        else generateBtn.focus();
      }
      return;
    }
  });

  // ---- Keyboard support (focusable link-boxes) ----
  container.addEventListener('keydown', async (ev) => {
    const active = document.activeElement;
    const box = active && active.classList && active.classList.contains('link-box') ? active : (active && active.closest ? active.closest('.link-box') : null);
    if (!box) return;
    // ignore if event originated from a button inside the box (we want native button behavior)
    if (ev.target && ev.target.tagName && ev.target.tagName.toLowerCase() === 'button') return;

    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      const next = box.nextElementSibling || box.previousElementSibling || null;
      try { await renderer.removeByElement(box, { dispatchRemove: true }); } catch (e) {}
      if (next && next.focus) next.focus(); else generateBtn.focus();
      return;
    }

    if (ev.key === 'Enter') {
      ev.preventDefault();
      const href = box.dataset && box.dataset.link;
      if (href) window.open(href, '_blank');
      return;
    }

    const isCopy = (ev.key.toLowerCase() === 'c' && (ev.ctrlKey || ev.metaKey));
    if (isCopy) {
      ev.preventDefault();
      const href = box.dataset && box.dataset.link;
      if (href) {
        const ok = await copyToClipboard(href);
        const copyBtn = box.querySelector('button.copy');
        if (copyBtn) {
          copyBtn.textContent = ok ? 'Copiato!' : 'Errore';
          setTimeout(() => { copyBtn.textContent = 'COPIA'; }, 1200);
        }
        announce(ok ? 'Link copiato negli appunti.' : 'Impossibile copiare il link.');
      }
    }
  });

  // ---- Clear (cestino) handler: async and robust ----
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      const items = Array.from(container.querySelectorAll('.link-box'));
      if (items.length === 0) {
        announce('Non ci sono link da cancellare.');
        try { store.clearHistory(); } catch (e) {}
        if (badge) badge.textContent = '0';
        try { clearBtn.setAttribute('aria-label', `Svuota i link generati (0 presenti)`); } catch (e) {}
        document.dispatchEvent(new CustomEvent(EVENTS.LINKS_CLEARED));
        return;
      }

      try {
        await renderer.clear();
      } catch (e) {
        container.innerHTML = '';
      }

      try { store.clearHistory(); } catch (e) {}

      if (badge) badge.textContent = String(renderer.count());
      try { clearBtn.setAttribute('aria-label', `Svuota i link generati (${renderer.count()} presenti)`); } catch (e) {}

      // Keep offer description visible (selection persists)
      announce('Elenco link svuotato.');
      document.dispatchEvent(new CustomEvent(EVENTS.LINKS_CLEARED));
      // move focus to generate button for convenience
      generateBtn.focus();
    });
  }

  // ---- Generate behaviour (with visual error feedback) ----
  generateBtn.addEventListener('click', () => {
    const custom = (customOffer && customOffer.value || '').trim();
    const selected = (offerSelect && offerSelect.value || '').trim();
    const chosen = custom !== '' ? custom : selected;

    if (!chosen) {
      // highlight both fields (offer select + custom input) to show required input
      // prefer focusing the select if it is visible / present
      if (offerSelect) showFieldError(offerSelect);
      if (customOffer) showFieldError(customOffer);
      announce('Seleziona o inserisci il codice offerta.');
      return;
    }

    const { code, valid } = normalizeOfferCode(chosen);
    if (!valid) {
      // indicate the specific field with error
      if (custom !== '') showFieldError(customOffer);
      else showFieldError(offerSelect);
      announce('Codice offerta non valido.');
      return;
    }
    const tipoFlusso = simType ? simType.value : '';
    const tipoAttivazione = activationType ? activationType.value : '';
    const prefix = tipoFlusso === 'ESIM' ? 'ES_' : '';
    const rawCode = prefix + code;
    const link = buildCampaignLink({ tipoFlusso, tipoAttivazione, codiceCampagna: rawCode });

    // Persist then render
    store.saveHistoryItem({ link, ts: Date.now() });
    const box = renderer.add(link, { markLatest: true });
    document.dispatchEvent(new CustomEvent(EVENTS.LINK_ADDED, { detail: { link } }));

    // move focus to newly created box for keyboard users
    if (box && box.focus) box.focus();

    // UI feedback
    generateBtn.textContent = 'GENERATO';
    setTimeout(() => { generateBtn.textContent = 'GENERA'; }, 1400);
  });

  return { renderer, store, populateOffers, showOffer };
}