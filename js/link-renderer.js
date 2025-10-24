// js/link-renderer.js
// Renderizza i link nel container, gestisce animazioni, badge e classi "latest".
// API: createRenderer(container, options) -> { add, remove, removeByElement, clear, count, container }
// removeByElement e clear ritornano Promise che risolvono quando la rimozione/animazione è completata.

import { announce } from './utils.js';

const EXIT_MS = 180; // must be in sync with CSS .link-box.exit duration (ms)

export function createRenderer(container, { badgeElement = null, onRemove = null, onAdd = null } = {}) {
  if (!container) throw new Error('container is required for renderer');

  function createLinkBox(link) {
    const box = document.createElement('div');
    box.className = 'link-box';
    box.dataset.link = link;

    // make the whole box focusable & accessible
    box.tabIndex = 0;
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', `Link ${link}`);

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
    // copy handler is delegated by controller

    actionsCol.appendChild(openBtn);
    actionsCol.appendChild(copyBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn';
    // accessible label (kept explicit)
    deleteBtn.setAttribute('aria-label', `Rimuovi link ${link}`);
    // SVG icon for the X (aria-hidden true)
    deleteBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

    controls.appendChild(actionsCol);
    controls.appendChild(deleteBtn);

    box.appendChild(main);
    box.appendChild(controls);

    return box;
  }

  function updateBadge() {
    if (!badgeElement) return;
    const count = container.querySelectorAll('.link-box').length;
    badgeElement.textContent = String(count);
    // update aria-label as well for assistive tech
    try {
      badgeElement.setAttribute('aria-atomic', 'true');
    } catch (e) {}
  }

  function clearLatestMarker() {
    container.querySelectorAll('.link-box.latest').forEach(it => it.classList.remove('latest'));
  }

  function add(link, { markLatest = true } = {}) {
    const box = createLinkBox(link);
    container.prepend(box);

    // entry animation
    box.classList.add('enter');
    box.addEventListener('animationend', () => box.classList.remove('enter'), { once: true });

    if (markLatest) {
      clearLatestMarker();
      box.classList.add('latest');
    }

    updateBadge();
    if (typeof onAdd === 'function') onAdd(link, box);
    return box;
  }

  // removeByElement returns a Promise that resolves once the box is removed
  function removeByElement(box, { dispatchRemove = true, force = false } = {}) {
    return new Promise((resolve) => {
      if (!box) return resolve(false);

      // If already deleting and not forced, resolve immediately
      if (box.dataset.deleting === '1' && !force) return resolve(false);

      // mark deleting
      box.dataset.deleting = '1';
      const link = box.dataset.link || null;
      const wasLatest = box.classList.contains('latest');

      // start exit animation (CSS should define animation .exit)
      box.classList.add('exit');

      let finished = false;
      const cleanupAndResolve = () => {
        if (finished) return;
        finished = true;

        // remove element if present
        if (box && box.parentNode) box.parentNode.removeChild(box);

        // update badge
        updateBadge();

        // if removed was latest, reassign latest to the new first element
        if (wasLatest) {
          const first = container.querySelector('.link-box');
          if (first) {
            // ensure only one latest
            container.querySelectorAll('.link-box.latest').forEach(it => it.classList.remove('latest'));
            first.classList.add('latest');
            // keep first focusable (it already has tabindex)
          }
        }

        // call onRemove callback for persistence
        if (dispatchRemove && typeof onRemove === 'function') {
          try { onRemove(link); } catch (e) { /* swallow */ }
        }

        // accessibility announce
        announce('Link rimosso.');

        resolve(true);
      };

      // animationend handler: ensure the event target is the box itself
      const onAnimEnd = (e) => {
        if (e && e.target !== box) return; // ignore child animations
        clearTimeout(fallbackTimer);
        try { box.removeEventListener('animationend', onAnimEnd); } catch (e) {}
        cleanupAndResolve();
      };

      box.addEventListener('animationend', onAnimEnd, { once: true });

      // fallback: in case animationend doesn't fire, force removal after a short timeout
      const fallbackTimer = setTimeout(() => {
        try { box.removeEventListener('animationend', onAnimEnd); } catch (e) {}
        cleanupAndResolve();
      }, EXIT_MS + 60);
    });
  }

  // remove by link string -> Promise
  function remove(link) {
    const items = Array.from(container.querySelectorAll('.link-box'));
    const box = items.find(it => it.dataset && it.dataset.link === link);
    if (!box) return Promise.resolve(false);
    return removeByElement(box, { dispatchRemove: true, force: false });
  }

  // clear: remove all boxes, return Promise resolved when all removals done
  function clear() {
    const items = Array.from(container.querySelectorAll('.link-box'));
    if (items.length === 0) {
      // ensure badge updated
      updateBadge();
      if (typeof onRemove === 'function') {
        try { onRemove(null, { cleared: true }); } catch (e) {}
      }
      return Promise.resolve([]);
    }
    const promises = items.map(it => removeByElement(it, { dispatchRemove: true, force: true }));
    return Promise.all(promises).then((results) => {
      // after all removed, ensure badge updated and notify cleared
      updateBadge();
      if (typeof onRemove === 'function') {
        try { onRemove(null, { cleared: true }); } catch (e) {}
      }
      return results;
    });
  }

  function count() { return container.querySelectorAll('.link-box').length; }

  return { add, remove, removeByElement, clear, count, container };
}