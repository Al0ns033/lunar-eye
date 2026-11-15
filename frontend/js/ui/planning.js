import { t, onLanguage, localize, siteName, message, errorMessage } from '../i18n.js';
// Pagina 3: Pianificazione della missione — Sole e Terra dal sito, orizzonte locale, timeline.
import Chart from 'chart.js/auto';
import { state, on, saveMission, setAnalysis, setSite, setTime, setPlaying } from '../state.js';
import { api } from '../api.js';
import { SkyView } from '../render/skyView.js';
import { fmtLat, fmtLon } from '../science/ephem.js';

let el, sky, chart, idx = 0;
const EV = () => ({ sunrise: [t("☀ alba"), 'sun'], sunset: [t("☀ tramonto"), 'sun'], earthrise: [t("🜨 sorgere Terra"), 'earth'], earthset: [t("🜨 tramonto Terra"), 'earth'] });
const fmtT = (iso) => iso.slice(0, 16).replace('T', ' ');

export function mount(root) {
  el = root;
  const m = state.mission;
  el.innerHTML = `
  <div class="split mission-console">
    <div class="form" data-panel-title="Configurazione missione">
      <h3 style="color:var(--cyan);letter-spacing:.14em;font-size:16px;margin:0 0 12px"><span data-i18n="CONFIGURAZIONE MISSIONE">MISSION SETUP</span></h3>
      <label class="field"><span data-i18n="Nome missione">Mission name</span><input id="pl-name" value="${m.name}"></label>
      <h4 class="field" style="margin:14px 0 6px"><span data-i18n="SITO">SITE</span></h4>
      <select id="pl-site" style="width:100%"></select>
      <div class="grid2" style="margin-top:6px">
        <label class="field">Lat (°)<input id="pl-lat" type="number" step="0.001"></label>
        <label class="field">Lon E (°)<input id="pl-lon" type="number" step="0.001"></label>
      </div>
      <h4 class="field" style="margin:14px 0 6px"><span data-i18n="TEMPO (UTC)">TIME (UTC)</span></h4>
      <div class="grid2 mission-time">
        <label class="field"><span data-i18n="Atterraggio">Landing</span><input id="pl-start" type="datetime-local" value="${m.start}"></label>
        <label class="field"><span data-i18n="Durata (giorni)">Duration (days)</span><input id="pl-days" type="number" min="1" max="60" value="${m.days}"></label>
      </div>
      <h4 class="field" style="margin:14px 0 6px"><span data-i18n="PANNELLI SOLARI">SOLAR PANELS</span></h4>
      <div class="grid2">
        <label class="field">Area (m²)<input id="pl-area" type="number" step="0.1" value="${m.area_m2 ?? ''}"></label>
        <label class="field"><span data-i18n="Efficienza (0–1)">Efficiency (0–1)</span><input id="pl-eff" type="number" step="0.01" min="0" max="1" value="${m.efficiency ?? ''}"></label>
        <label class="field panel-orientation"><span data-i18n="Orientamento">Orientation</span><select id="pl-mode"><option value="tracking" data-i18n="verticale, insegue l&#x27;azimut">vertical, tracks azimuth</option><option value="fixed" data-i18n="fisso">fixed</option></select></label>
        <label class="field"><span data-i18n="Carico richiesto (W)">Required load (W)</span><input id="pl-load" type="number" value="${m.load_W ?? ''}"></label>
        <label class="field"><span data-i18n="Inclinazione (°)">Tilt (°)</span><input id="pl-tilt" type="number" value="${m.tilt_deg}"></label>
        <label class="field"><span data-i18n="Azimut pannello (°)">Panel azimuth (°)</span><input id="pl-paz" type="number" value="${m.azimuth_deg}"></label>
      </div>
      <button class="btn primary" id="pl-run" style="width:100%;margin-top:14px;padding:10px"><span data-i18n="Calcola geometria">Calculate geometry</span></button>
      <div id="pl-msg"></div>
      <details class="mission-details"><summary><span data-i18n="Dettagli all’istante selezionato">Selected-time details</span></summary><div id="pl-now" style="margin-top:14px"></div></details>
    </div>
    <div class="work">
      <div class="sky"><div class="viewport" id="pl-sky"></div>
        <button class="btn no-print" id="pl-reset" type="button" data-i18n="Ricentra vista">Reset view</button>
        <section class="mission-hud" data-panel-title="Stato missione"><div id="pl-hud"><p class="note" data-i18n="Configura la missione e calcola per esplorare luce, Terra ed energia.">Set up and calculate your mission to explore sunlight, Earth visibility and power.</p></div></section>
        <div class="panel no-print" data-panel-title="Timeline missione" style="left:12px;bottom:12px;right:12px;padding:10px 14px">
          <div class="row"><input type="range" id="pl-slider" min="0" max="0" value="0" style="flex:1"><span class="mono" id="pl-t" style="font-size:14px;min-width:140px;text-align:right"></span></div>
        </div>
        <div class="scale-tag" style="top:12px;bottom:auto;left:12px"><span data-i18n="Terreno LOLA ±30 km in scala reale · cupola celeste e diametro della Terra (×4) solo rappresentativi · linea arancio = orizzonte topografico">LOLA terrain ±30 km at true scale · sky dome and Earth diameter (×4) illustrative only · orange line = topographic horizon</span></div>
      </div>
      <div class="bottom">
        <div class="chart-box" data-panel-title="Grafico missione"><canvas id="pl-chart"></canvas></div>
        <div class="events" data-panel-title="Eventi missione"><b style="font-size:14px;letter-spacing:.12em;color:var(--muted)"><span data-i18n="EVENTI (orizzonte LOLA)">EVENTS (LOLA horizon)</span></b><div id="pl-events"></div></div>
      </div>
    </div>
  </div>`;
  const $ = (s) => el.querySelector(s);
  $('#pl-mode').value = m.mode;
  sky = new SkyView($('#pl-sky'));
  siteSelect();
  on('site', siteSelect); on('sites', siteSelect);
  $('#pl-site').onchange = (e) => { const s = state.savedSites[e.target.value]; if (s) setSite(s); };
  $('#pl-run').onclick = run;
  // la timeline della missione è legata al tempo globale (barra in alto) in entrambe le direzioni
  $('#pl-slider').oninput = (e) => goto(Number(e.target.value));
  $('#pl-reset').onclick = () => sky.resetView();
  on('time', syncFromTime);
  if (state.analysis) draw(state.analysis);
  onLanguage(() => {
    // Keep unsubmitted coordinates and every mission field intact.
    const select = el.querySelector('#pl-site');
    [...select.options].forEach((o) => { const site = state.savedSites[o.value]; o.textContent = site ? siteName(site) : `${siteName(state.site)} ${t('(corrente)')}`; });
    if (state.analysis) { draw(state.analysis, true); updateAt(); }
  });
}

function siteSelect() {
  const s = state.site, sel = el.querySelector('#pl-site');
  const i = state.savedSites.findIndex((x) => x.name === s.name && x.lat === s.lat);
  sel.innerHTML = (i < 0 ? `<option value="">${siteName(s)} ${t('(corrente)')}</option>` : '') + state.savedSites.map((x, k) => `<option value="${k}" ${k === i ? 'selected' : ''}>${siteName(x)}</option>`).join('');
  el.querySelector('#pl-lat').value = s.lat; el.querySelector('#pl-lon').value = s.lon;
}

function readForm() {
  const $ = (s) => el.querySelector(s); const num = (s) => ($(s).value === '' ? null : Number($(s).value));
  Object.assign(state.mission, { name: $('#pl-name').value, start: $('#pl-start').value, days: num('#pl-days') || 14,
    area_m2: num('#pl-area'), efficiency: num('#pl-eff'), mode: $('#pl-mode').value, load_W: num('#pl-load'),
    tilt_deg: num('#pl-tilt') ?? 90, azimuth_deg: num('#pl-paz') ?? 0 });
  saveMission();
  const lat = num('#pl-lat'), lon = num('#pl-lon');
  if (lat !== state.site.lat || lon !== state.site.lon) setSite({ name: t('Sito {lat} {lon}', { lat: fmtLat(lat), lon: fmtLon(lon) }), lat, lon, src: 'utente' });
}

export function siteParams(site, m) {
  return { lat: site.lat, lon: site.lon, start: m.start + 'Z', hours: m.days * 24, area_m2: m.area_m2, efficiency: m.efficiency,
    mode: m.mode, tilt_deg: m.tilt_deg, azimuth_deg: m.azimuth_deg, load_W: m.load_W };
}

async function run() {
  readForm();
  const msg = el.querySelector('#pl-msg');
  msg.innerHTML = `<p class="note"><span class="spinner"></span> <span data-i18n="Interrogo JPL Horizons per Sole e Terra dal sito e calcolo l&#x27;orizzonte LOLA…">Querying JPL Horizons for the Sun and Earth from the site and calculating the LOLA horizon…</span></p>`;
  try {
    const [res, patch] = await Promise.all([api.site(siteParams(state.site, state.mission)), api.patch(state.site.lat, state.site.lon, 30, 121)]);
    res.mission = { ...state.mission }; res.siteName = state.site.name; res.siteLabelKey = state.site.nameKey;
    sky.setTerrain(patch, res.horizon);
    setAnalysis(res);
    draw(res);
    msg.innerHTML = `<p class="note"><span class="badge b-real">Horizons ${res.sun.meta.ephemeris || ''}</span> ${message('campioni ogni {step} min · recuperato {date} UTC', { step: res.step_min, date: res.sun.meta.retrieved_utc.slice(0, 16) })}</p>`;
  } catch (e) { msg.innerHTML = `<div class="err">${message('Calcolo non riuscito: {error}. Nessun valore dimostrativo viene mostrato al suo posto.', { error: errorMessage(e) })}</div>`; }
}

function draw(res, keepTime = false) {
  if (!sky.terrain) api.patch(res.site.lat, res.site.lon, 30, 121).then((p) => sky.setTerrain(p, res.horizon));
  const sl = el.querySelector('#pl-slider'); sl.max = res.t.length - 1; idx = 0; sl.value = 0;
  el.querySelector('#pl-events').innerHTML = res.events.length
    ? res.events.map((e, j) => `<button type="button" class="ev" data-event="${j}"><span class="${EV()[e.type][1]}">${EV()[e.type][0]}</span><span>${fmtT(e.t)}</span></button>`).join('') + `<p class="note">${message('Incertezza ±{minutes} min (metà passo di campionamento).', { minutes: res.events[0].uncertainty_min })}</p>`
    : `<p class="note"><span data-i18n="Nessun evento nel periodo: Sole e Terra non cambiano stato di visibilità.">No events in this period: the Sun and Earth do not change visibility state.</span></p>`;
  el.querySelectorAll('[data-event]').forEach((button) => {
    button.onclick = () => goto(Math.round((Date.parse(res.events[button.dataset.event].t) - Date.parse(res.t[0])) / (res.step_min * 60000)));
  });
  const labels = res.t.map(fmtT);
  const ds = (label, data, color, extra = {}) => ({ label, data, borderColor: color, backgroundColor: color, pointRadius: 0, borderWidth: 1.6, ...extra });
  const cursor = { id: 'cursor', afterDraw(c) { const x = c.scales.x.getPixelForValue(idx); const { top, bottom } = c.chartArea; const g = c.ctx; g.save(); g.strokeStyle = '#ffffff88'; g.beginPath(); g.moveTo(x, top); g.lineTo(x, bottom); g.stroke(); g.restore(); } };
  chart?.destroy();
  chart = new Chart(el.querySelector('#pl-chart'), {
    type: 'line',
    data: { labels, datasets: [
      ds(t("Elevazione Sole (°)"), res.sun.el, '#ffb547'),
      ds(t("Orizzonte LOLA verso il Sole"), res.sun.mask_el, '#ffb54788', { borderDash: [4, 3], borderWidth: 1 }),
      ds(t("Elevazione Terra (°)"), res.earth.el, '#4fd8ff'),
      ds(t("Orizzonte LOLA verso la Terra"), res.earth.mask_el, '#4fd8ff88', { borderDash: [4, 3], borderWidth: 1 }),
      ...(res.power ? [ds(t("Potenza pannello (W)"), res.power.W, '#3ddc97', { yAxisID: 'p', borderWidth: 1.2 })] : []),
    ] },
    options: { animation: false, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#cbd8e9', boxWidth: 10, font: { size: 14 } } } },
      scales: { x: { ticks: { color: '#b0c1d8', maxTicksLimit: 8, font: { size: 14 } }, grid: { color: '#13284a' } },
        y: { title: { display: true, text: t("gradi"), color: '#b0c1d8' }, ticks: { color: '#b0c1d8' }, grid: { color: '#13284a' } },
        ...(res.power ? { p: { position: 'right', min: 0, title: { display: true, text: 'W', color: '#3ddc97' }, ticks: { color: '#3ddc97' }, grid: { display: false } } } : {}) },
      onClick: (_e, items) => { if (items[0]) goto(items[0].index); } },
    plugins: [cursor],
  });
  if (!syncFromTime() && !keepTime) goto(0);
  localize(el);
}

function goto(i) { const r = state.analysis; if (r) setTime(Date.parse(r.t[Math.max(0, Math.min(i, r.t.length - 1))])); }

/** Porta il cursore al campione più vicino al tempo globale. Ritorna false se il tempo è fuori dal periodo. */
function syncFromTime() {
  const r = state.analysis; if (!r || !el) return false;
  const t0 = Date.parse(r.t[0]), step = r.step_min * 60000, n = r.t.length;
  const k = Math.round((state.timeMs - t0) / step);
  const inside = k >= 0 && k < n;
  el.querySelector('#pl-t').style.color = inside ? '' : 'var(--amber)';
  if (!inside) { el.querySelector('#pl-t').textContent = t("tempo globale fuori dal periodo"); return false; }
  if (k !== idx || !chart?._synced) { idx = k; el.querySelector('#pl-slider').value = k; updateAt(); if (chart) chart._synced = true; }
  return true;
}

function updateAt() {
  const r = state.analysis; if (!r) return;
  const i = Math.min(idx, r.t.length - 1);
  const sun = { az: r.sun.az[i], el: r.sun.el[i], visible: r.sun.visible_frac[i] };
  const earth = { az: r.earth.az[i], el: r.earth.el[i], diam: r.earth.diam_deg[i] };
  sky.setBodies(sun, earth);
  el.querySelector('#pl-t').textContent = fmtT(r.t[i]) + ' UTC';
  chart?.draw();
  const tNow = r.t[i];
  const nextSet = r.events.find((e) => e.type === 'sunset' && e.t > tNow);
  const nextEarthSet = r.events.find((e) => e.type === 'earthset' && e.t > tNow);
  const hTo = (e) => (e ? ((Date.parse(e.t) - Date.parse(tNow)) / 3.6e6).toFixed(1) + ' h' : t("oltre il periodo"));
  const vis = (f) => (f >= 0.999 ? t("visibile") : f > 0 ? t('parziale {percent}%', { percent: (f * 100).toFixed(f < 0.01 ? 2 : 0) }) : t("occultato"));
  el.querySelector('#pl-hud').innerHTML = `
    <div class="mission-instrument sun"><small>${t("Sole")}</small><strong>${vis(sun.visible)}</strong><span>${sun.el.toFixed(1)}° · ${t("Al prossimo tramonto")}: ${sun.visible > 0 ? hTo(nextSet) : '—'}</span></div>
    <div class="mission-instrument earth"><small>${t("Terra")}</small><strong>${vis(r.earth.visible_frac[i])}</strong><span>${earth.el.toFixed(1)}° · ${t("Visibilità geometrica")}</span></div>
    <div class="mission-instrument power"><small>${t("Potenza pannello")}</small><strong>${r.power ? r.power.W[i].toFixed(0) + ' W' : '—'}</strong><span>${r.power ? t("Stima all’istante selezionato") : t("dati non disponibili")}</span></div>`;
  el.querySelector('#pl-now').innerHTML = `
    <h4 class="field" style="margin:0 0 6px"><span data-i18n="ALL&#x27;ISTANTE SELEZIONATO">AT THE SELECTED TIME</span></h4>
    <div class="kv">
      <span data-i18n="Sito">Site</span><span>${fmtLat(r.site.lat)} ${fmtLon(r.site.lon)}</span>
      <span data-i18n="Quota LOLA">LOLA elevation</span><span>${r.site.elevation_m.toFixed(0)} m</span>
      <span data-i18n="Sole Az / El">Sun Az / El</span><span>${sun.az.toFixed(2)}° / ${sun.el.toFixed(2)}°</span>
      <span data-i18n="Orizzonte verso il Sole">Horizon towards the Sun</span><span>${r.sun.mask_el[i].toFixed(2)}°</span>
      <span data-i18n="Disco solare">Solar disc</span><span>${vis(sun.visible)}</span>
      <span data-i18n="Incidenza sul terreno">Terrain incidence</span><span>${r.sun.incidence_terrain_deg[i].toFixed(1)}°</span>
      ${r.sun.incidence_panel_deg ? `<span data-i18n="Incidenza sul pannello">Panel incidence</span><span>${r.sun.incidence_panel_deg[i].toFixed(1)}°</span>` : ''}
      ${r.power ? `<span data-i18n="Potenza pannello">Panel power</span><span>${r.power.W[i].toFixed(0)} W</span>` : ''}
      <span data-i18n="Al prossimo tramonto">Until next sunset</span><span>${sun.visible > 0 ? hTo(nextSet) : t("— (Sole non visibile)")}</span>
      <span data-i18n="Terra Az / El">Earth Az / El</span><span>${earth.az.toFixed(2)}° / ${earth.el.toFixed(2)}°</span>
      <span data-i18n="Disco terrestre">Earth disc</span><span>${vis(r.earth.visible_frac[i])}</span>
      <span data-i18n="Al prossimo tramonto della Terra">Until next earthset</span><span>${r.earth.visible_frac[i] > 0 ? hTo(nextEarthSet) : '—'}</span>
    </div>
    <p class="note"><span class="badge b-real"><span data-i18n="reale">real</span></span> <span data-i18n="Az/El: JPL Horizons, apparenti, senza rifrazione.">Az/El: JPL Horizons, apparent, without refraction.</span>
    <span class="badge b-approximate"><span data-i18n="approssimato">approximate</span></span> <span data-i18n="visibilità e potenza: orizzonte LOLA a ~1.9 km/px.">visibility and power: LOLA horizon at ~1.9 km/px.</span>
    <span data-i18n="Terra visibile = linea di vista geometrica,">Earth visible = geometric line of sight,</span> <b><span data-i18n="non">does not</span></b> <span data-i18n="garantisce un collegamento radio (servono antenna, link budget, stazione DSN).">guarantee a radio link (antenna, link budget and DSN station required).</span></p>`;
}

export function playbackRange() {
  const r = state.analysis;
  return r ? [Date.parse(r.t[0]), Date.parse(r.t[r.t.length - 1])] : null;
}

export function togglePlayback() {
  if (state.playing) { setPlaying(false); return; }
  if (!state.analysis) return;
  if (!state.playing) {
    const [start, stop] = playbackRange();
    if (state.timeMs < start || state.timeMs > stop || (state.speed >= 0 && state.timeMs >= stop) || (state.speed < 0 && state.timeMs <= start)) setTime(state.speed < 0 ? stop : start);
  }
  setPlaying(!state.playing);
}

export function show() { syncFromTime(); }

export function frame() { sky.render(); }
