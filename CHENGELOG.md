# Changelog

All notable changes to this project will be documented in this file.

The project moved from a single monolithic script (link-generator.js) to a modular architecture. The refactor is a breaking change in terms of file layout and internal APIs, but the public user-facing functionality is preserved and enhanced.

## [Unreleased]

## [2.0.0] - YYYY-MM-DD
### Summary
Major refactor: replaced the legacy monolithic `js/link-generator.js` with a modular implementation split into small focused modules:
- js/events.js
- js/utils.js
- js/link-creator.js
- js/link-store.js
- js/link-renderer.js
- js/link-controller.js

Other supportive files:
- js/vendor/purify.min.js (DOMPurify)
- index.html updated to bootstrap the new module controller
- css/styles.css updated (exit animation, focus styles, SVG for delete)

This release focuses on maintainability, testability and accessibility, and fixes multiple bugs present in the legacy implementation (notably: robustness of deletion/X button behavior, animation fallbacks, latest assignment race conditions, clipboard UX, keyboard accessibility).

### Added
- Modular codebase:
  - `js/events.js` — central constants for custom events.
  - `js/utils.js` — escapeHtml, copyToClipboard, sanitizeHtml (DOMPurify wrapper), aria-live announce utilities.
  - `js/link-creator.js` — pure functions: normalizeOfferCode, buildCampaignLink.
  - `js/link-store.js` — encapsulated localStorage history operations (load/save/remove/clear, HISTORY_LIMIT).
  - `js/link-renderer.js` — DOM rendering, animations, .latest management; returns Promise for removals; focusable link boxes.
  - `js/link-controller.js` — orchestrator wiring UI ↔ creator ↔ store ↔ renderer; offers loading integration; keyboard shortcuts; focus management.
- Accessibility and UX improvements:
  - Focusable link boxes with role and aria-label.
  - Keyboard support (Enter opens, Delete/Backspace removes, Ctrl/Cmd+C copies).
  - aria-live announcements for major actions.
  - SVG delete icon for better rendering.
- Improved CSS:
  - Faster exit animation (slide-left, 180ms).
  - Focus visual styles for link boxes and generate button.
- Defensive deletion logic: animationend + timeout fallback to avoid stuck `data-deleting`.
- Renderer `clear()` waits for all animations and resolves a Promise.
- History persistency consistent with DOM state; badge always derived from the DOM after removals.

### Fixed
- Bug where pressing X on the latest element did not remove it and subsequent removals removed the wrong element (race/dataset-deleting issues).
- Broken counter (badge) going to zero while latest remained in DOM.
- Latest class not reassigned correctly after removal.
- GENERA button text stuck on "GENERATO" in some circumstances.
- Copy to clipboard fallback reliability improved.

### Changed / Breaking
- `js/link-generator.js` replaced by modular files above. If you still reference `js/link-generator.js` directly from HTML or other scripts, update to import/initialize the controller:
  - Replace prior script bootstrap with:
    ```html
    <script type="module">
      import { initLinkController } from './js/link-controller.js';
      window.linkApp = initLinkController();
    </script>
    ```
- If you previously relied on any private globals exposed by the legacy script, adjust to the new APIs:
  - New controller returns { renderer, store, populateOffers, showOffer } accessible via `window.linkApp` for quick debugging.

### Migration notes
1. Ensure `index.html` uses `type="module"` bootstrap as shown above.
2. Make sure `js/vendor/purify.min.js` (DOMPurify) is included before the module bootstrap if you want HTML sanitization of descriptions.
3. Remove references to `js/link-generator.js` and replace any dependent code with the new events constants (`js/events.js`) or `window.linkApp` APIs.
4. Recommended git workflow for removal:
   ```bash
   git checkout -b chore/remove-legacy-link-generator
   git mv js/link-generator.js js/link-generator.legacy.js
   git commit -m "chore: archive legacy link-generator after modular refactor"
   git push -u origin chore/remove-legacy-link-generator
   # open PR, run CI, then merge when safe
   ```

### Testing & Validation
- Manual smoke tests included: generation, copy, open, delete (single/multiple/latest), clear, offers populate & description.
- Recommended: add unit tests for `link-creator` and `link-store` (pure functions), and DOM tests for `link-renderer` with `jsdom`. Add E2E tests (Playwright) for the main flows.

---

## [1.0.0] - LEGACY
### Initial single-file implementation
- `js/link-generator.js` contained all logic: UI wiring, rendering, localStorage management, sanitization, events.
- This version had several known issues that motivated the refactor (see "Fixed" above).
