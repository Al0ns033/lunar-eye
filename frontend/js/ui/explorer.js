import { t, onLanguage, siteName, message, errorMessage } from '../i18n.js';
// Pagina 2: Lunar Explorer — globo LOLA, selezione del sito, siti noti, coordinate manuali.
import { state, setSite, saveSites, KNOWN_SITES, on } from '../state.js';
import { api } from '../api.js';
import { MoonGlobe } from '../render/moonGlobe.js';
import { fmtLat, fmtLon } from '../science/ephem.js';

let globe, el, pointReq = 0, languageBeforeName;

const CRATERS = [ // centri dei crateri, IAU Gazetteer of Planetary Nomenclature
  { name: 'Tycho', lat: -43.31, lon: -11.36 }, { name: 'Copernicus', lat: 9.62, lon: -20.08 },
  { name: 'Clavius', lat: -58.62, lon: -14.73 }, { name: 'Plato', lat: 51.62, lon: -9.38 },
  { name: 'Aristarchus', lat: 23.73, lon: -47.49 }, { name: 'Shackleton', lat: -89.67, lon: 129.78 },
];

export function mount(root) {
  el = root;
  el.innerHTML = `
    <div class="viewport" id="ex-view"></div>
    <div class="explorer-tools" role="group" data-i18n-label="Pannelli" aria-label="Panels">
      <button class="btn" type="button" data-ex-panel="site" aria-controls="ex-site-panel" aria-expanded="true"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 3v14" stroke="currentColor" stroke-width="1.4"/></svg><span data-i18n="Sito di allunaggio">Landing site</span></button>
      <button class="btn" type="button" data-ex-panel="view" aria-controls="ex-view-panel" aria-expanded="true"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M12 3v14" stroke="currentColor" stroke-width="1.4"/></svg><span data-i18n="Vista">View</span></button>
    </div>
    <section class="panel no-print ex-panel ex-site-panel" id="ex-site-panel" aria-labelledby="ex-site-title">
      <div class="ex-panel-head"><h3 id="ex-site-title"><span data-i18n="Sito di allunaggio">Landing site</span></h3><button class="panel-close" type="button" data-close-panel="site" data-i18n-label="Nascondi pannello" aria-label="Hide panel"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></div>
      <div class="ex-panel-body">
        <div class="ex-site-fields">
          <div class="grid2">
            <label class="field"><span data-i18n="Latitudine (°)">Latitude (°)</span><input id="ex-lat" type="number" step="0.001" min="-90" max="90"></label>
            <label class="field"><span data-i18n="Longitudine E (°)">Longitude E (°)</span><input id="ex-lon" type="number" step="0.001"></label>
          </div>
          <label class="field"><span data-i18n="Nome">Name</span><input id="ex-name"></label>
          <div class="ex-actions"><button class="btn primary" id="ex-go"><span data-i18n="Seleziona">Select</span></button><button class="btn" id="ex-save"><span data-i18n="Salva nei siti">Save site</span></button></div>
        </div>
        <div id="ex-point"></div>
        <div class="ex-site-list"><h4><span data-i18n="Siti noti">Known sites</span></h4><div class="list" id="ex-known"></div></div>
        <div class="ex-site-list"><h4><span data-i18n="Siti salvati">Saved sites</span></h4><div class="list" id="ex-saved"></div></div>
      </div>
    </section>
    <section class="panel no-print ex-panel ex-view-panel" id="ex-view-panel" aria-labelledby="ex-view-title">
      <div class="ex-panel-head"><h3 id="ex-view-title"><span data-i18n="Vista">View</span></h3><button class="panel-close" type="button" data-close-panel="view" data-i18n-label="Nascondi pannello" aria-label="Hide panel"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></div>
      <div class="ex-panel-body">
        <div class="ex-presets"><button class="btn" id="ex-south"><span data-i18n="Polo Sud">South Pole</span></button><button class="btn" id="ex-north"><span data-i18n="Polo Nord">North Pole</span></button><button class="btn" id="ex-near"><span data-i18n="Faccia visibile">Near side</span></button></div>
        <label class="field ex-relief"><span class="ex-slider-title"><span data-i18n="Esagerazione verticale:">Vertical exaggeration:</span><b id="ex-exv">8×</b></span><input type="range" id="ex-ex" min="1" max="30" value="8"></label>
        <div class="ex-overlays"><label><input type="checkbox" id="ex-grid" checked><span data-i18n="Griglia lat/lon (15°)">Lat/lon grid (15°)</span></label><label><input type="checkbox" id="ex-crat" checked><span data-i18n="Crateri principali">Major craters</span></label></div>
        <details class="ex-source"><summary><span data-i18n="Fonti e limiti">Sources and limitations</span></summary><p class="note"><span data-i18n="Rilievo:">Relief:</span> <span class="badge b-real">LOLA LDEM_4</span> <span data-i18n="mediato a 2 px/grado (~15 km). Colore: mosaico LROC WAC (solo estetico, non è un dato di terreno).">averaged to 2 px/degree (~15 km). Colour: LROC WAC mosaic (visual only, not terrain data).</span>
        <span data-i18n="Le quote nel pannello di sinistra usano LDEM_16 (~1.9 km/px). Clic sul globo per scegliere un punto.">Elevations in the left panel use LDEM_16 (~1.9 km/px). Click the globe to select a point.</span></p></details>
        <p class="ex-scale-note" id="ex-tag"><span data-i18n="Esagerazione verticale 8× (solo visualizzazione).">Vertical exaggeration 8× (display only).</span></p>
      </div>
    </section>`;
  setupPanels();
  globe = new MoonGlobe(el.querySelector('#ex-view'), { onPick: ({ lat, lon }) => choose({ name: t('Sito {lat} {lon}', { lat: fmtLat(lat), lon: fmtLon(lon) }), lat: +lat.toFixed(4), lon: +lon.toFixed(4), src: 'utente' }) });
  api.globe().then((h) => { globe.build(h); markers(); globe.lookAt(state.site.lat, state.site.lon); }).catch((e) => (el.querySelector('#ex-point').innerHTML = `<div class="err">${message('{error}', { error: errorMessage(e) })}</div>`));
  const $ = (s) => el.querySelector(s);
  $('#ex-known').innerHTML = KNOWN_SITES.map((s, i) => `<button data-i="${i}">${siteName(s)}<small>${s.lat.toFixed(2)}, ${s.lon.toFixed(2)}</small></button>`).join('');
  $('#ex-known').querySelectorAll('button').forEach((b) => (b.onclick = () => { const s = KNOWN_SITES[b.dataset.i]; choose(s); globe.lookAt(s.lat, s.lon); }));
  $('#ex-go').onclick = () => {
    const lat = parseFloat($('#ex-lat').value), lon = parseFloat($('#ex-lon').value);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90) return;
    choose({ name: $('#ex-name').value || t('Sito {lat} {lon}', { lat: fmtLat(lat), lon: fmtLon(lon) }), lat, lon, src: 'utente' }); globe.lookAt(lat, lon);
  };
  $('#ex-save').onclick = () => {
    const s = { ...state.site, name: $('#ex-name').value || state.site.name };
    if (s.name !== siteName(state.site)) delete s.nameKey;
    state.savedSites = [...state.savedSites.filter((x) => x.name !== s.name), s].slice(-8);
    saveSites(); setSite(s); renderSaved();
  };
  $('#ex-south').onclick = () => globe.lookAt(-90, 0, 2.2);
  $('#ex-north').onclick = () => globe.lookAt(90, 0, 2.2);
  $('#ex-near').onclick = () => globe.lookAt(0, 0, 2.6);
  $('#ex-ex').oninput = (e) => { $('#ex-exv').textContent = `${e.target.value}×`; $('#ex-tag').textContent = t('Esagerazione verticale {value}× (solo visualizzazione).', { value: e.target.value }); };
  $('#ex-ex').onchange = (e) => globe.applyExaggeration(Number(e.target.value));
  $('#ex-grid').onchange = (e) => (globe.gridGroup.visible = e.target.checked);
  $('#ex-crat').onchange = () => markers();
  on('site', () => { fill(); markers(); });
  fill(); renderSaved();
  onLanguage(() => {
    el.querySelectorAll('#ex-known button').forEach((b) => { b.firstChild.textContent = siteName(KNOWN_SITES[b.dataset.i]); });
    renderSaved(); markers();
    el.querySelector('#ex-tag').textContent = t('Esagerazione verticale {value}× (solo visualizzazione).', { value: el.querySelector('#ex-ex').value });
    // Preserve unsaved edits in the name and coordinate fields.
    const name = el.querySelector('#ex-name');
    if (state.site.nameKey && name.value === (languageBeforeName || state.site.name)) name.value = siteName(state.site);
    languageBeforeName = siteName(state.site);
  });
}

function setupPanels() {
  let hidden = {};
  try { hidden = JSON.parse(localStorage.getItem('lmp.explorer.panels')) || {}; } catch { /* storage unavailable */ }
  function setPanel(name, visible, moveFocus = false) {
    const panel = el.querySelector(`#ex-${name}-panel`);
    const trigger = el.querySelector(`[data-ex-panel="${name}"]`);
    panel.hidden = !visible;
    trigger.setAttribute('aria-expanded', String(visible));
    hidden[name] = !visible;
    try { localStorage.setItem('lmp.explorer.panels', JSON.stringify(hidden)); } catch { /* storage unavailable */ }
    if (moveFocus) trigger.focus();
  }
  for (const name of ['site', 'view']) {
    setPanel(name, hidden[name] !== true);
    el.querySelector(`[data-ex-panel="${name}"]`).onclick = () => setPanel(name, el.querySelector(`#ex-${name}-panel`).hidden);
    el.querySelector(`[data-close-panel="${name}"]`).onclick = () => setPanel(name, false, true);
  }
}

function markers() {
  const showC = el.querySelector('#ex-crat')?.checked;
  globe.setSites([...KNOWN_SITES.filter((s) => s.lat > -89.9), ...(showC ? CRATERS.map((c) => ({ ...c, name: `◦ ${c.name}` })) : [])], state.site);
}

function renderSaved() {
  const box = el.querySelector('#ex-saved');
  box.innerHTML = state.savedSites.map((s, i) => `<button data-i="${i}">${siteName(s)}<small>${s.lat.toFixed(2)}, ${s.lon.toFixed(2)}</small></button>`).join('');
  box.querySelectorAll('button').forEach((b) => (b.onclick = () => { const s = state.savedSites[b.dataset.i]; choose(s); globe.lookAt(s.lat, s.lon); }));
}

function choose(s) { setSite(s); }

async function fill() {
  const s = state.site;
  el.querySelector('#ex-lat').value = s.lat; el.querySelector('#ex-lon').value = s.lon; el.querySelector('#ex-name').value = siteName(s); languageBeforeName = siteName(s);
  const box = el.querySelector('#ex-point');
  const id = ++pointReq;
  box.innerHTML = `<span class="spinner"></span>`;
  try {
    const p = await api.point(s.lat, s.lon);
    if (id !== pointReq) return;
    box.innerHTML = `<div class="kv">
      <span data-i18n="Latitudine">Latitude</span><span>${fmtLat(s.lat)}</span><span data-i18n="Longitudine">Longitude</span><span>${fmtLon(s.lon)}</span>
      <span data-i18n="Quota (R=1737.4 km)">Elevation (R=1737.4 km)</span><span>${p.elevation_m.toFixed(0)} m</span>
      <span data-i18n="Pendenza (~4 km)">Slope (~4 km)</span><span>${p.slope_deg.toFixed(1)}°</span>
      <span data-i18n="Esposizione">Aspect</span><span>${p.aspect_deg.toFixed(0)}°</span></div>
      <p class="note"><span class="badge b-real">LOLA</span> ${message(p.dem)}<span data-i18n=", interpolazione bilineare. Frame Moon ME, longitudini Est 0–360.">, bilinear interpolation. Moon ME frame, east longitudes 0–360.</span></p>`;
  } catch (e) { box.innerHTML = `<div class="err">${message('{error}', { error: errorMessage(e) })}</div>`; }
}

export function frame() { globe?.render(); }
