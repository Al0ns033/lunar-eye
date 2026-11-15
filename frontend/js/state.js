import { errorMessage } from './i18n.js';
// Stato globale dell'applicazione con notifiche e persistenza locale (siti e missione).
import { msToJd, jdToMs, sampleSeries } from './science/ephem.js';
import { api } from './api.js';

const listeners = new Map();
export function on(evt, fn) { (listeners.get(evt) || listeners.set(evt, []).get(evt)).push(fn); }
export function emit(evt, data) { (listeners.get(evt) || []).forEach((fn) => fn(data)); }

function load(key, def) { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } }
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage non disponibile */ } }

export const KNOWN_SITES = [
  // Coordinate pubblicate dei siti di allunaggio (LROC / agenzie), arrotondate a 0.001°
  { name: 'Apollo 11', lat: 0.674, lon: 23.473, src: 'NASA/LROC' },
  { name: 'Apollo 12', lat: -3.012, lon: -23.422, src: 'NASA/LROC' },
  { name: 'Apollo 14', lat: -3.645, lon: -17.471, src: 'NASA/LROC' },
  { name: 'Apollo 15', lat: 26.132, lon: 3.634, src: 'NASA/LROC' },
  { name: 'Apollo 16', lat: -8.973, lon: 15.500, src: 'NASA/LROC' },
  { name: 'Apollo 17', lat: 20.191, lon: 30.772, src: 'NASA/LROC' },
  { name: "Chang'e 4", lat: -45.444, lon: 177.599, src: 'CNSA/LROC' },
  { name: 'Chandrayaan-3', lat: -69.373, lon: 32.319, src: 'ISRO' },
  { name: 'IM-1 Odysseus', lat: -80.130, lon: 1.440, src: 'NASA/LROC' },
  { name: 'Shackleton (centro cratere)', nameKey: 'Shackleton (centro cratere)', lat: -89.67, lon: 129.78, src: 'IAU Gazetteer' },
  { name: 'Polo Sud', nameKey: 'Polo Sud', lat: -90.0, lon: 0, src: 'definizione' },
];

const defaultSite = { name: 'Bordo di Shackleton', nameKey: 'Bordo di Shackleton', lat: -89.45, lon: 222.69, src: 'utente' };

export const state = {
  timeMs: Date.now(),
  playing: false,
  speed: 3600, // secondi simulati per secondo reale
  scaleMode: 'visual',
  site: load('lmp.site', defaultSite),
  savedSites: load('lmp.sites', [defaultSite, KNOWN_SITES[5], KNOWN_SITES[8]]),
  mission: load('lmp.mission', {
    name: 'Artemis Explorer 1', start: new Date(Date.UTC(2026, 11, 1)).toISOString().slice(0, 16),
    days: 14, area_m2: 4, efficiency: 0.3, mode: 'tracking', tilt_deg: 90, azimuth_deg: 0, load_W: 300,
  }),
  analysis: null, // risultato /api/site della missione corrente
  meta: null,
};

export function setPlaying(playing) {
  state.playing = Boolean(playing);
  emit('playback', state.playing);
}

export function setTime(ms) { state.timeMs = ms; emit('time', ms); }
export function setSite(site) { state.site = site; save('lmp.site', site); emit('site', site); }
export function saveSites() { save('lmp.sites', state.savedSites); emit('sites', state.savedSites); }
export function saveMission() { save('lmp.mission', state.mission); emit('mission', state.mission); }
export function setAnalysis(a) { state.analysis = a; emit('analysis', a); }

// ---- Cache delle effemeridi: finestre temporali dal backend, interpolazione locale ----
export const ephem = {
  data: null, loading: false, error: null, lastWindowDays: 60, retryAt: 0,
  async ensure(jd) {
    const w = this.data;
    const margin = 1;
    if (w && jd >= w.jd0 + margin && jd <= w.jd1 - margin) return;
    if (this.loading || Date.now() < this.retryAt) return;
    // ampiezza della finestra adattata alla velocità: ~60 s di simulazione
    const days = Math.min(3600, Math.max(60, Math.abs(state.speed) * 60 / 86400 * 2));
    this.loading = true; emit('ephem-status');
    try {
      const startMs = jdToMs(jd - (state.speed >= 0 ? days * 0.2 : days * 0.8));
      const r = await api.states(new Date(startMs).toISOString(), Math.round(days));
      const jd0 = msToJd(Date.parse(r.start)), jd1 = msToJd(Date.parse(r.stop));
      this.data = { ...r, jd0, jd1 };
      this.error = null;
    } catch (e) { this.error = errorMessage(e); this.retryAt = Date.now() + 30000; }
    this.loading = false; emit('ephem-status'); emit('ephem');
  },
  /** posizione in km (ICRF). Luna: geocentrica. */
  get(key, jd) {
    const s = this.data?.bodies?.[key];
    return s ? sampleSeries(s, jd) : null;
  },
};
