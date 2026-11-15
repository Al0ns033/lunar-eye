import { t, onLanguage, localize, terrainMethod } from '../i18n.js';
// Pagina 5: Analisi della missione — valutazioni con base scientifica, export CSV e PDF.
import Chart from 'chart.js/auto';
import { state, on } from '../state.js';
import { fmtLat, fmtLon } from '../science/ephem.js';

let el, charts = [];
const LV = () => ({ favorable: t("FAVOREVOLE"), moderate: t("MODERATO"), unfavorable: t("SFAVOREVOLE"), insufficient: t("DATI INSUFFICIENTI") });

export function mount(root) { el = root; on('analysis', render); onLanguage(render); render(); }
export function show() { render(); }

function fmtVal(a) {
  if (a.value == null) return '—';
  if (a.unit === 'frazione') return (a.value * 100).toFixed(0) + '%';
  return `${a.value.toFixed(1)} <small style="font-size:16px">${t(a.unit)}</small>`;
}

function render() {
  const r = state.analysis;
  charts.forEach((c) => c.destroy()); charts = [];
  if (!r) {
    el.innerHTML = `<div class="scroll-page"><h2><span data-i18n="Analisi missione">Mission analysis</span></h2><p class="sub"><span data-i18n="Nessuna analisi disponibile. Configura e calcola una missione nella pagina">No analysis available. Set up and calculate a mission on the</span> <b><span data-i18n="Pianificazione">Planning</span></b>.</p>
      <div class="card insufficient" data-panel-key="analysis-status"><span class="lvl insufficient"><span data-i18n="DATI INSUFFICIENTI">INSUFFICIENT DATA</span></span><h4><span data-i18n="Stato">Status</span></h4><p><span data-i18n="Le valutazioni vengono prodotte solo da dati calcolati: nessun valore dimostrativo viene mostrato.">Assessments use calculated data only: no demonstration values are shown.</span></p></div></div>`;
    localize(el);
    return;
  }
  const s = r.summary, m = r.mission || {};
  el.innerHTML = `<div class="scroll-page">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div><h2>${m.name || t("Missione")}</h2><p class="sub">${r.siteLabelKey ? t(r.siteLabelKey) : r.siteName || ''} · ${fmtLat(r.site.lat)} ${fmtLon(r.site.lon)} · ${r.t[0].slice(0, 16).replace('T', ' ')} UTC → ${r.t[r.t.length - 1].slice(0, 16).replace('T', ' ')} UTC</p></div>
      <div class="row no-print"><button class="btn" id="an-csv"><span data-i18n="Esporta CSV">Export CSV</span></button><button class="btn primary" id="an-pdf"><span data-i18n="Esporta PDF">Export PDF</span></button></div>
    </div>
    <div class="cards">${r.assessments.map((a) => `
      <div class="card ${a.level}" data-panel-key="analysis-assessment-${a.id}"><span class="lvl ${a.level}">${LV()[a.level]}</span><h4>${t(a.label)}</h4><div class="big">${fmtVal(a)}</div><p>${t(a.basis)}</p></div>`).join('')}
    </div>
    <h3 style="margin:26px 0 8px;font-weight:600"><span data-i18n="Condizioni ambientali e geometria">Environmental conditions and geometry</span></h3>
    <div class="cards">
      <div class="card"><h4><span data-i18n="Illuminazione">Illumination</span></h4><div class="kv">
        <span data-i18n="Ore di luce">Sunlit hours</span><span>${s.sunlit_h.toFixed(0)} / ${s.span_h.toFixed(0)} h</span>
        <span data-i18n="Con orizzonte liscio">With a smooth horizon</span><span>${(s.sunlit_fraction_smooth_horizon * 100).toFixed(0)}%</span>
        <span data-i18n="Elevazione solare media">Mean solar elevation</span><span>${s.sun_el_mean.toFixed(2)}°</span>
        <span data-i18n="Elevazione solare max">Max solar elevation</span><span>${s.sun_el_max.toFixed(2)}°</span>
        <span data-i18n="Periodi di luce">Sunlit periods</span><span>${r.sunlit_periods.length}</span></div>
        <p><span data-i18n="L&#x27;ostruzione del terreno è la differenza tra la frazione con orizzonte liscio e quella con orizzonte LOLA.">Terrain obstruction is the difference between the smooth-horizon fraction and the LOLA-horizon fraction.</span></p></div>
      <div class="card"><h4><span data-i18n="Comunicazioni (geometria)">Communications (geometry)</span></h4><div class="kv">
        <span data-i18n="Terra visibile">Earth visible</span><span>${s.earth_visible_h.toFixed(0)} h</span>
        <span data-i18n="Finestre">Windows</span><span>${r.comm_windows.length}</span>
        <span data-i18n="Interruzioni">Interruptions</span><span>${r.comm_gaps.length}</span>
        <span data-i18n="Interruzione più lunga">Longest interruption</span><span>${s.longest_comm_gap_h.toFixed(0)} h</span></div>
        <p><span data-i18n="Linea di vista Terra–sito. Non è un&#x27;analisi di collegamento radio: non include antenna, frequenza, link budget né la visibilità delle stazioni DSN.">Earth–site line of sight. This is not a radio-link analysis: it excludes antenna, frequency, link budget and DSN station visibility.</span></p></div>
      <div class="card"><h4><span data-i18n="Terreno">Terrain</span></h4><div class="kv">
        <span data-i18n="Quota">Elevation</span><span>${r.site.elevation_m.toFixed(0)} m</span>
        <span data-i18n="Pendenza">Slope</span><span>${r.site.slope_deg.toFixed(1)}°</span>
        <span data-i18n="Orizzonte max">Max horizon</span><span>${Math.max(...r.horizon.elev_deg).toFixed(2)}°</span>
        <span data-i18n="Orizzonte min">Min horizon</span><span>${Math.min(...r.horizon.elev_deg).toFixed(2)}°</span></div>
        <p>${terrainMethod(r.horizon.method)}. ${t(r.horizon.limits)}</p></div>
    </div>
    <div class="charts" style="margin-top:16px"><div class="card"><canvas id="an-power"></canvas></div><div class="card"><canvas id="an-horizon"></canvas></div></div>
    <h3 style="margin:26px 0 8px;font-weight:600"><span data-i18n="Fonti e limiti">Sources and limitations</span></h3>
    <div class="card"><p>
      <b><span data-i18n="Effemeridi">Ephemerides</span></b>: NASA/JPL Horizons API (${r.sun.meta.ephemeris || 'DE'})${t(', osservatore topocentrico sulla Luna, Az/El apparenti senza rifrazione, UTC. Recuperato')} ${r.sun.meta.retrieved_utc}.<br>
      <b><span data-i18n="Terreno">Terrain</span></b>: NASA LRO LOLA GDR LDEM_16 (~1.9 km/px), frame Moon ME.<br>
      <b><span data-i18n="Eventi">Events</span></b>${t(': transizioni tra campioni a {step} min (incertezza ±{uncertainty} min).', { step: r.step_min, uncertainty: r.step_min / 2 })}<br>
      <b><span data-i18n="Non inclusi">Not included</span></b><span data-i18n=": SPICE (sostituito da Horizons, che usa la stessa famiglia di effemeridi DE), ombre di massi e rilievi sotto i 2 km, link budget radio, modello termico.">: SPICE (replaced by Horizons, which uses the same DE ephemeris family), shadows from boulders and features below 2 km, radio link budget, thermal model.</span></p></div>
  </div>`;
  el.querySelector('#an-csv').onclick = () => exportCsv(r);
  el.querySelector('#an-pdf').onclick = () => window.print();
  const axis = { ticks: { color: '#b0c1d8', maxTicksLimit: 7 }, grid: { color: '#13284a' } };
  const legend = { labels: { color: '#cbd8e9', boxWidth: 10 } };
  const labels = r.t.map((t) => t.slice(5, 16).replace('T', ' '));
  charts.push(new Chart(el.querySelector('#an-power'), {
    type: 'line',
    data: { labels, datasets: r.power
      ? [{ label: t("Potenza (W)"), data: r.power.W, borderColor: '#3ddc97', backgroundColor: '#3ddc9722', fill: true, pointRadius: 0, borderWidth: 1.4 }]
      : [{ label: t("Frazione disco solare visibile"), data: r.sun.visible_frac, borderColor: '#ffb547', pointRadius: 0 }] },
    options: { maintainAspectRatio: false, animation: false, plugins: { legend, title: { display: true, text: r.power ? t("Potenza solare stimata (approssimata)") : t("Pannello non configurato: visibilità solare"), color: '#cbd8e9' } }, scales: { x: axis, y: { ...axis, min: 0 } } },
  }));
  charts.push(new Chart(el.querySelector('#an-horizon'), {
    type: 'line',
    data: { labels: r.horizon.az_deg, datasets: [{ label: t("Orizzonte LOLA (°)"), data: r.horizon.elev_deg, borderColor: '#ff9d3c', pointRadius: 0, borderWidth: 1.4 },
      { label: t("Percorso del Sole"), data: r.horizon.az_deg.map(() => null), borderColor: '#ffb547', showLine: false }] },
    options: { maintainAspectRatio: false, animation: false, plugins: { legend, title: { display: true, text: t("Profilo dell'orizzonte (azimut da Nord, °)"), color: '#cbd8e9' } }, scales: { x: { ...axis, ticks: { color: '#b0c1d8', maxTicksLimit: 12 } }, y: axis } },
  }));
  localize(el);
}

function exportCsv(r) {
  const head = ['time_utc', 'sun_az_deg', 'sun_el_deg', 'sun_horizon_deg', 'sun_visible_frac', 'earth_az_deg', 'earth_el_deg', 'earth_horizon_deg', 'earth_visible_frac', 'incidence_terrain_deg', 'power_W'];
  const lines = [
    `# Lunar Eye — Mission Planner - ${r.mission?.name || ''}`,
    `# site lat=${r.site.lat} lon_e=${r.site.lon} elevation_m=${r.site.elevation_m.toFixed(1)}`,
    `# source: JPL Horizons ${r.sun.meta.ephemeris || ''} (retrieved ${r.sun.meta.retrieved_utc}); terrain: LOLA LDEM_16; power: approximate model`,
    head.join(','),
    ...r.t.map((t, i) => [t, r.sun.az[i], r.sun.el[i], r.sun.mask_el[i], r.sun.visible_frac[i], r.earth.az[i], r.earth.el[i], r.earth.mask_el[i], r.earth.visible_frac[i], r.sun.incidence_terrain_deg[i], r.power ? r.power.W[i] : ''].join(',')),
  ];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  a.download = `${(r.mission?.name || 'missione').replace(/\W+/g, '_')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
