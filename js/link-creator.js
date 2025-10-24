// Pure functions per costruire e normalizzare i codici/link.
// Facile da testare, senza side effect.

export function normalizeOfferCode(raw) {
  if (!raw) return { code: '', valid: false };
  const trimmed = raw.trim();
  const isValid = /^[A-Za-z0-9\-_]+$/.test(trimmed);
  return { code: trimmed, valid: isValid };
}

/**
 * buildCampaignLink({ tipoFlusso, tipoAttivazione, codiceCampagna }) -> string
 * Pure function: costruisce l'URL della campagna.
 */
export function buildCampaignLink({ tipoFlusso = '', tipoAttivazione = '', codiceCampagna = '' } = {}) {
  const params = new URLSearchParams({
    tipoFlusso,
    tipoAttivazione,
    codiceCampagna
  });
  return `https://shop.coopvoce.it/?${params.toString()}`;
}