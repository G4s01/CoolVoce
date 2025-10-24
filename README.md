# CoolVoce (Refactored)

A tool made in purpose of educational study of CoopVoce's URL to buy and to store a memory of all interesting offers during the years.  
This repository was refactored from a single monolithic script (`js/link-generator.js`) into a modular, testable architecture.

This README documents the new project layout and how to work with the refactored code.

---

## Quick summary

- Purpose: generate campaign links using configured offer codes, keep a lightweight history in localStorage, and provide a simple accessible UI to open/copy/remove links.
- Focus of the refactor: single-responsibility modules, better testability, robust deletion/animation handling, accessibility (keyboard + aria-live), and small UX improvements (faster exit animation, SVG icon).
- Entry point: `initLinkController()` — bootstraps the UI and wires modules together.

---

## Main features

- Generate campaign URLs based on selected offer or custom code.
- Copy to clipboard (native API + fallback).
- Open link in new tab.
- In-page chronological history of generated links (limited by HISTORY_LIMIT).
- Robust link removal with CSS animation + fallback timeout.
- "Latest" highlight for the most recently generated link; reassigned automatically on removal.
- Clear-all (cestino) with coordinated animations and history clearing.
- Keyboard support: focusable link items, Enter to open, Delete/Backspace to remove, Ctrl/Cmd+C to copy.
- Sanitized offer descriptions (DOMPurify wrapper).

---

## Project structure (refactored)

- `index.html` — page skeleton and module bootstrap (loads `initLinkController`).
- `css/styles.css` — all styles and animations (including keyboard focus styles and faster exit animation).
- `js/`:
  - `events.js` — central constants for custom event names exported as `EVENTS`.
  - `utils.js` — shared helpers:
    - escapeHtml, copyToClipboard (async), ensureAriaLive, announce, sanitizeHtml (DOMPurify wrapper).
  - `link-creator.js` — pure functions:
    - `normalizeOfferCode(raw)` -> { code, valid }
    - `buildCampaignLink({ tipoFlusso, tipoAttivazione, codiceCampagna })` -> URL string
  - `link-store.js` — localStorage history API:
    - `loadHistory()`, `saveHistoryItem(item)`, `removeHistoryLink(link)`, `clearHistory()`
  - `link-renderer.js` — DOM rendering and animation:
    - Factory `createRenderer(container, { badgeElement, onRemove, onAdd })` returning:
      - `add(link, { markLatest })` -> DOM element
      - `remove(link)` -> Promise
      - `removeByElement(box, { dispatchRemove, force })` -> Promise
      - `clear()` -> Promise (resolves after all animations)
      - `count()` -> number
    - Handles `data-deleting`, animationend + fallback, latest reassignment and badge updates.
  - `link-controller.js` — orchestrator:
    - `initLinkController(options)` -> returns `{ renderer, store, populateOffers, showOffer }`
    - Wires UI (selects, inputs, buttons), handles events (offers loader), copy/open/delete delegations, clear-all flow, keyboard interactions, and accessibility announcements.
  - `vendor/purify.min.js` — optional DOMPurify vendor library (used by `utils.sanitizeHtml`).
  - `offers-loader.js` — (project-specific) script that populates `window.CoolVoceOffers` and dispatches `offers:loaded` / `offers:updated`. Keep or adapt per your backend feed.
  - `theme-toggle.js` — theme (dark/light) toggling helper (optional).

---

## Events API

The project dispatches and listens to DOM CustomEvents. Use `js/events.js` constants when interacting with these events.

- `EVENTS.OFFERS_LOADED` — fired by `offers-loader` when offers load.
- `EVENTS.OFFERS_UPDATED` — fired when offers are updated.
- `EVENTS.LINK_ADDED` — dispatched when a link is generated (detail: `{ link }`).
- `EVENTS.LINK_REMOVED` — dispatched when a link is removed (detail: `{ link }`).
- `EVENTS.LINKS_CLEARED` — dispatched when the clear-all operation completes.

Example:
```js
import { EVENTS } from './js/events.js';

document.addEventListener(EVENTS.LINK_ADDED, (ev) => {
  console.log('new link generated', ev.detail.link);
});
```

The code still dispatches `CustomEvent` instances for backward compatibility (`document.dispatchEvent(new CustomEvent(...))`), but prefer `EVENTS` constants to avoid typos.

---

## How to run locally

1. Install a simple HTTP server (or use Python):
   - Python: `python -m http.server 8000` (from project root)
   - Node (http-server): `npx http-server -p 8000`
2. Open `http://localhost:8000` in your browser.
3. Ensure `js/vendor/purify.min.js` is included in `index.html` before the module bootstrap if you want sanitized descriptions.
4. The page boots the controller with:
```html
<script type="module">
  import { initLinkController } from './js/link-controller.js';
  window.linkApp = initLinkController();
</script>
```

---

## Basic usage & developer notes

- Generate a link:
  1. Select an offer or type a custom code.
  2. Click "GENERA".
  3. A new item appears at the top of the list; it is marked `.latest`.
  4. Use "COPIA" to copy, "APRI" to open, "✕" to remove.

- Keyboard usage:
  - Tab to a link box (it is focusable).
  - Enter opens the link.
  - Delete/Backspace removes the focused box.
  - Ctrl/Cmd + C copies the focused box's link.

- Focus behaviour:
  - After remove, focus moves to the next item, previous item, or GENERA button as fallback.

- History:
  - Saved to `localStorage` under `coolvoce-history`.
  - `link-store.js` enforces a `HISTORY_LIMIT` to avoid unbounded localStorage growth.

---

## Accessibility

- `aria-live` announcements for actions (generate, copy result, removal).
- Focusable link boxes with `role="group"` and `aria-label` describing the contained link.
- Keyboard shortcuts implemented for common actions.
- Sanitization of offer descriptions to prevent XSS (DOMPurify when available).

Consider running a screen reader (NVDA/VoiceOver) and axe-core checks if you need to reach strict WCAG compliance.

---

## Testing (manual & automated suggestions)

Manual quick checks:
- Generate multiple links, verify `.latest` is applied and reassigned after deletions.
- Remove single links and verify DOM + `localStorage` consistency.
- Clear with the cestino button and verify all entries are removed and `coolvoce-history` cleared.
- Try keyboard flows: focus a link box and press Enter/Delete/Ctrl/Cmd+C.

Automated suggestions:
- Unit tests (Jest):
  - `link-creator` (pure functions).
  - `link-store` (use jsdom or mock localStorage).
- DOM tests (jsdom):
  - `link-renderer` add, removeByElement (simulate `animationend`).
- E2E tests (Playwright):
  - Generate → remove latest → clear → keyboard flows → clipboard.

---

## Migration notes from legacy `js/link-generator.js`

This refactor is a breaking change only in terms of code layout. If your project previously loaded the single file:
- Remove any `<script src="./js/link-generator.js"></script>` references.
- Boot the module controller as shown in *How to run locally*.
- If you used globals or internals from the legacy file, migrate to the controller's public properties:
  ```js
  // After bootstrap
  console.log(window.linkApp.renderer);
  console.log(window.linkApp.store);
  ```
- Archive the legacy file before deleting:
```bash
git checkout -b chore/archive-legacy-link-generator
git mv js/link-generator.js js/link-generator.legacy.js
git commit -m "chore: archive legacy link-generator after modular refactor"
```

A `CHANGELOG.md` entry is included in the repository root describing the 2.0.0 refactor.
