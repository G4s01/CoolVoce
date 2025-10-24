// Interfaccia unica verso localStorage per la history.
// Permette di cambiare backend in futuro (server, IndexedDB) senza toccare UI.

const HISTORY_KEY = 'coolvoce-history';
const HISTORY_LIMIT = 20;

export function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; }
}

export function saveHistoryItem(item) {
  try {
    const arr = loadHistory();
    arr.unshift(item);
    const unique = arr.filter((v, i, a) => a.findIndex(x => x.link === v.link) === i);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(unique.slice(0, HISTORY_LIMIT)));
  } catch (e) {}
}

export function removeHistoryLink(link) {
  try {
    const arr = loadHistory();
    const filtered = arr.filter(i => i.link !== link);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  } catch (e) {}
}

export function clearHistory() {
  try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
}