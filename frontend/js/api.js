import { LocalizedError } from './i18n.js';
// Accesso al backend FastAPI. Gli errori risalgono con un messaggio leggibile.
async function get(path, params = {}) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  let r;
  try { r = await fetch(`${path}?${q}`); }
  catch { throw new LocalizedError('Connessione al backend non riuscita. Controlla la rete e riprova.'); }
  if (!r.ok) {
    if (r.status === 429) throw new LocalizedError('Servizio occupato. Attendi un minuto e riprova.');
    if (r.status === 422) throw new LocalizedError('Parametri non validi. Controlla coordinate, date e durata.');
    if (r.status >= 500) throw new LocalizedError('Dati non disponibili ({status}). Riprova; se il problema persiste, controlla il servizio Horizons.', { status: r.status });
    throw new LocalizedError('Richiesta non riuscita ({status}).', { status: r.status });
  }
  return r;
}

export const api = {
  object: async (key, start) => (await get(`/api/objects/${key}`, { start })).json(),
  meta: async () => (await get('/api/meta')).json(),
  states: async (start, days) => (await get('/api/states', { start, days })).json(),
  orbits: async (date) => (await get('/api/orbits', { date })).json(),
  point: async (lat, lon) => (await get('/api/terrain/point', { lat, lon })).json(),
  patch: async (lat, lon, half_km = 30, n = 121) => (await get('/api/terrain/patch', { lat, lon, half_km, n })).json(),
  site: async (p) => (await get('/api/site', p)).json(),
  globe: async () => {
    const r = await get('/api/terrain/globe', { ppd: 2 });
    const [h, w] = r.headers.get('X-Shape').split('x').map(Number);
    return { h, w, data: new Int16Array(await r.arrayBuffer()) };
  },
};
