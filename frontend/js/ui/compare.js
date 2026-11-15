import { t, onLanguage, localize, siteName, message, errorMessage } from '../i18n.js';
// Pagina 4: Confronto tra siti (fino a 4 siti, date selezionabili).
import Chart from 'chart.js/auto';
import { state, on } from '../state.js';
import { api } from '../api.js';
import { siteParams } from './planning.js';
import { fmtLat, fmtLon } from '../science/ephem.js';

let el, charts = [], lastResults;
const COLORS = ['#4fd8ff', '#ffb547', '#3ddc97', '#ff7eb6'];
const LV = () => ({ favorable: t("favorevole"), moderate: t("moderato"), unfavorable: t("sfavorevole"), insufficient: t("dati insufficienti") });

export function mount(root) {
  el = root;
  el.innerHTML = `<div class="scroll-page">
    <h2><span data-i18n="Confronto siti">Site comparison</span></h2><p class="sub"><span data-i18n="Stessa finestra temporale per tutti i siti: geometria JPL Horizons + orizzonte topografico LOLA.">Same time window for all sites: JPL Horizons geometry + LOLA topographic horizon.</span></p>
    <div class="card no-print" style="margin-bottom:16px">
      <div class="row" id="cmp-sites"></div>
      <div class="row" style="margin-top:12px">
        <label class="field"><span data-i18n="Inizio (UTC)">Start (UTC)</span><input type="datetime-local" id="cmp-start" value="${state.mission.start}"></label>
        <label class="field"><span data-i18n="Durata (giorni)">Duration (days)</span><input type="number" id="cmp-days" value="${Math.min(state.mission.days, 30)}" min="1" max="60" style="width:90px"></label>
        <button class="btn primary" id="cmp-run" style="align-self:flex-end"><span data-i18n="Confronta">Compare</span></button>
      </div>
      <div id="cmp-msg"></div>
    </div>
    <div id="cmp-out"></div></div>`;
  renderPicker(); on('sites', renderPicker);
  el.querySelector('#cmp-run').onclick = run;
  onLanguage(() => {
    el.querySelectorAll('#cmp-sites label').forEach((label) => { const input = label.querySelector('input'); label.lastChild.textContent = ' ' + siteName(state.savedSites[input.value]); });
    if (lastResults) render(lastResults);
  });
}

function renderPicker() {
  el.querySelector('#cmp-sites').innerHTML = state.savedSites.map((s, i) => `<label class="row" style="font-size:16px;margin-right:14px"><input type="checkbox" value="${i}" ${i < 4 ? 'checked' : ''}> ${siteName(s)}</label>`).join('')
    + `<span class="note"><span data-i18n="Aggiungi siti dal Lunar Explorer (“Salva nei siti”).">Add sites from Lunar Explorer (“Save site”).</span></span>`;
}

async function run() {
  const picked = [...el.querySelectorAll('#cmp-sites input:checked')].map((c) => state.savedSites[c.value]).slice(0, 4);
  const m = { ...state.mission, start: el.querySelector('#cmp-start').value, days: Number(el.querySelector('#cmp-days').value) || 14 };
  const msg = el.querySelector('#cmp-msg');
  if (!picked.length) { msg.innerHTML = `<div class="err"><span data-i18n="Seleziona almeno un sito.">Select at least one site.</span></div>`; return; }
  msg.innerHTML = `<p class="note"><span class="spinner"></span> <span data-i18n="Calcolo in corso (le richieste a Horizons sono sequenziali)…">Calculating (Horizons requests run sequentially)…</span></p>`;
  const results = [];
  for (const s of picked) {
    try { results.push({ site: s, r: await api.site(siteParams(s, m)) }); }
    catch (e) { results.push({ site: s, err: errorMessage(e) }); }
  }
  msg.innerHTML = `<p class="note">${message('Periodo {start} UTC + {days} giorni.', { start: m.start, days: m.days })}</p>`;
  render(results);
}

function render(results) {
  lastResults = results;
  charts.forEach((c) => c.destroy()); charts = [];
  const ok = results.filter((x) => x.r);
  const pct = (v) => (v * 100).toFixed(0) + '%';
  const rows = [
    [t("Coordinate"), (r, s) => `${fmtLat(s.lat)}<br>${fmtLon(s.lon)}`],
    [t("Quota LOLA"), (r) => `${r.site.elevation_m.toFixed(0)} m`],
    [t("Pendenza (~4 km)"), (r) => `${r.site.slope_deg.toFixed(1)}°`],
    [t("Sole visibile (orizzonte LOLA)"), (r) => pct(r.summary.sunlit_fraction)],
    [t("Sole visibile (orizzonte liscio)"), (r) => pct(r.summary.sunlit_fraction_smooth_horizon)],
    [t("Ore di luce"), (r) => r.summary.sunlit_h.toFixed(0) + ' h'],
    [t("Notte più lunga"), (r) => r.summary.longest_dark_h.toFixed(0) + ' h'],
    [t("Elevazione solare media / max"), (r) => `${r.summary.sun_el_mean.toFixed(1)}° / ${r.summary.sun_el_max.toFixed(1)}°`],
    [t("Terra visibile"), (r) => pct(r.summary.earth_visible_fraction)],
    [t("Finestre di comunicazione"), (r) => `${r.comm_windows.length}`],
    [t("Interruzione più lunga"), (r) => r.summary.longest_comm_gap_h.toFixed(0) + ' h'],
    [t("Energia pannello"), (r) => (r.power ? (r.power.energy_Wh / 1000).toFixed(1) + ' kWh' : '—')],
  ];
  el.querySelector('#cmp-out').innerHTML = `
    <table class="data"><thead><tr><th></th>${results.map((x, i) => `<th style="color:${COLORS[i]}">${siteName(x.site)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([lab, f]) => `<tr><td style="color:var(--muted);font-family:inherit">${lab}</td>${results.map((x) => `<td>${x.r ? f(x.r, x.site) : `<span class="badge b-insufficient">${message('{error}', { error: x.err })}</span>`}</td>`).join('')}</tr>`).join('')}
    <tr><td style="color:var(--muted);font-family:inherit"><span data-i18n="Valutazioni">Assessments</span></td>${results.map((x) => `<td>${x.r ? x.r.assessments.map((a) => `<div><span class="lvl ${a.level}" style="position:static;display:inline-block;margin:1px 0">${LV()[a.level]}</span> <small>${t(a.label)}</small></div>`).join('') : ''}</td>`).join('')}</tr>
    </tbody></table>
    <p class="note"><span class="badge b-real"><span data-i18n="reale">real</span></span> <span data-i18n="geometria Horizons ·">Horizons geometry ·</span> <span class="badge b-approximate"><span data-i18n="approssimato">approximate</span></span> <span data-i18n="visibilità con orizzonte LOLA ~1.9 km/px, pendenze sottostimate · la visibilità della Terra è solo geometrica.">visibility with LOLA horizon ~1.9 km/px, slopes underestimated · Earth visibility is geometric only.</span></p>
    <div class="charts"><div class="card"><canvas id="cmp-bar"></canvas></div><div class="card"><canvas id="cmp-line"></canvas></div></div>`;
  const axis = { ticks: { color: '#b0c1d8' }, grid: { color: '#13284a' } };
  const legend = { labels: { color: '#cbd8e9', boxWidth: 10 } };
  charts.push(new Chart(el.querySelector('#cmp-bar'), {
    type: 'bar',
    data: { labels: [t("Sole visibile %"), t("Terra visibile %")], datasets: ok.map((x, i) => ({ label: siteName(x.site), data: [x.r.summary.sunlit_fraction * 100, x.r.summary.earth_visible_fraction * 100], backgroundColor: COLORS[results.indexOf(x)] })) },
    options: { maintainAspectRatio: false, plugins: { legend, title: { display: true, text: t("Frazione del periodo"), color: '#cbd8e9' } }, scales: { x: axis, y: { ...axis, max: 100, min: 0 } } },
  }));
  if (ok.length) charts.push(new Chart(el.querySelector('#cmp-line'), {
    type: 'line',
    data: { labels: ok[0].r.t.map((t) => t.slice(5, 16).replace('T', ' ')), datasets: ok.map((x) => ({ label: siteName(x.site), data: x.r.sun.el, borderColor: COLORS[results.indexOf(x)], pointRadius: 0, borderWidth: 1.5 })) },
    options: { maintainAspectRatio: false, animation: false, plugins: { legend, title: { display: true, text: t("Elevazione del Sole (°)"), color: '#cbd8e9' } }, scales: { x: { ...axis, ticks: { color: '#b0c1d8', maxTicksLimit: 7 } }, y: axis } },
  }));
  localize(el);
}
