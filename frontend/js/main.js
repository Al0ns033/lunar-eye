import { mountTour } from './ui/tour.js';
import { mountPanels, mountSidebar } from './ui/panels.js';
import Chart from 'chart.js/auto';
import { t, onLanguage, localize, siteName, message, errorMessage } from './i18n.js';
import { state, on, emit, setTime, setPlaying, ephem } from './state.js';
import { api } from './api.js';
import { loadingManager } from './render/common.js';
import { fmtLat, fmtLon } from './science/ephem.js';
import * as solar from './ui/solar.js';
import * as explorer from './ui/explorer.js';
import * as planning from './ui/planning.js';
import * as compare from './ui/compare.js';
import * as analysis from './ui/analysis.js';
import * as education from './ui/education.js';

Chart.defaults.font.size = 14;
Chart.defaults.color = '#b0c1d8';

mountSidebar();

const pages = { solar, explorer, planning, compare, analysis, education };
const mounted = new Set();
let current = 'solar';

function show(name) {
  current = name;
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.page === name));
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${name}`));
  const el = document.getElementById(`page-${name}`);
  if (!mounted.has(name)) { pages[name].mount(el); mounted.add(name); }
  pages[name].show?.();
  localize(el);
  mountPanels(el, name);
  syncPlaybackUI();
  location.hash = name;
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => show(b.dataset.page)));
window.addEventListener('hashchange', () => { const n = location.hash.slice(1); if (Object.hasOwn(pages, n) && n !== current) show(n); });

// ---- controllo del tempo ----
const $ = (id) => document.getElementById(id);
const toInput = (ms) => new Date(ms).toISOString().slice(0, 16);
function syncTimeUI() { if (document.activeElement !== $('t-input')) $('t-input').value = toInput(state.timeMs); }
$('t-input').addEventListener('change', (e) => { const ms = Date.parse(e.target.value + 'Z'); if (!isNaN(ms)) setTime(ms); });
const step = (s) => setTime(state.timeMs + s * 1000);
$('t-back-d').onclick = () => step(-86400); $('t-back-h').onclick = () => step(-3600);
$('t-fwd-d').onclick = () => step(86400); $('t-fwd-h').onclick = () => step(3600);
$('t-now').onclick = () => setTime(Date.now());
function syncPlaybackUI() {
  $('t-play').disabled = current === 'planning' && !state.analysis && !state.playing;
  $('t-play').textContent = state.playing ? '❚❚' : '▶';
  $('t-play').setAttribute('aria-pressed', String(state.playing));
  $('t-play').setAttribute('aria-label', t(state.playing ? 'Pausa' : 'Riproduci'));
}
$('t-play').onclick = () => current === 'planning' ? planning.togglePlayback() : setPlaying(!state.playing);
on('playback', syncPlaybackUI);
on('analysis', syncPlaybackUI);
onLanguage(syncPlaybackUI);
syncPlaybackUI();
$('t-speed').onchange = (e) => { state.speed = Number(e.target.value); };
on('time', syncTimeUI);

function statusUI() {
  const s = $('t-status');
  if (ephem.loading) s.innerHTML = `<span class="spinner"></span> <span data-i18n="Scarico effemeridi JPL Horizons…">Downloading JPL Horizons ephemerides…</span>`;
  else if (ephem.error) s.innerHTML = `<span class="badge b-insufficient"><span data-i18n="dati non disponibili">data unavailable</span></span> ${message('{error}', { error: ephem.error })}`;
  else if (ephem.data) {
    const m = ephem.data.bodies.earth.meta;
    s.innerHTML = `<span class="badge b-interpolated"><span data-i18n="Hermite su campioni Horizons">Hermite interpolation of Horizons samples</span></span> ${m.ephemeris || 'JPL DE'} · ICRF · UTC · ${t('recuperato')} ${m.retrieved_utc.slice(0, 10)}`;
  }
}
on('ephem-status', statusUI);

function siteChip() {
  const s = state.site;
  $('site-chip').innerHTML = `<small><span data-i18n="Sito selezionato">Selected site</span></small>${siteName(s)}<br><span class="mono">${fmtLat(s.lat)} ${fmtLon(s.lon)}</span>`;
}
on('site', siteChip);
onLanguage(() => { statusUI(); siteChip(); });

// ---- ciclo di animazione: solo la pagina attiva disegna ----
let last = performance.now();
let drawn = 0, notified = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (state.playing && !document.hidden) {
    const next = state.timeMs + dt * state.speed * 1000;
    const range = current === 'planning' ? planning.playbackRange() : null;
    state.timeMs = range ? Math.max(range[0], Math.min(next, range[1])) : next;
    const ended = range && state.timeMs !== next;
    if (ended) setPlaying(false);
    if (ended || now - notified >= 250) { emit('time', state.timeMs); notified = now; }
  }
  // 30 fps riducono lavoro GPU; la simulazione mantiene il tempo reale del frame.
  if (!document.hidden && now - drawn >= 1000 / 30) {
    pages[current].frame?.(dt); drawn = now;
  }
  requestAnimationFrame(loop);
}

async function init() {
  syncTimeUI(); siteChip();
  try { state.meta = await api.meta(); } catch (e) { $('ld-msg').innerHTML = message('Backend non raggiungibile: {error}', { error: errorMessage(e) }); return; }
  const done = () => $('loading').classList.add('done');
  loadingManager.onProgress = (_u, a, b) => { $('ld-msg').innerHTML = message('Caricamento texture {loaded}/{total}…', { loaded: a, total: b }); };
  loadingManager.onLoad = done;
  setTimeout(done, 12000); // non bloccare l'app se una texture non arriva
  const requested = location.hash.slice(1);
  show(Object.hasOwn(pages, requested) ? requested : 'solar');
  mountTour(show);
  requestAnimationFrame(loop);
}
init();
