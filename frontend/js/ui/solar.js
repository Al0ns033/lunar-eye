import { t, onLanguage, localize, bodyName, locale } from '../i18n.js';
// Pagina 1: Sistema Solare
import { state, ephem, on } from '../state.js';
import { api } from '../api.js';
import { mountObjects } from './solarObjects.js';
import { SolarScene } from '../render/solarScene.js';
import { msToJd, AU_KM } from '../science/ephem.js';

let updateObjects;
let orbitLoading = false, orbitRetryAt = 0;
let scene, panel, info, selected = 'earth', orbitMonth = null, lastInfo = 0;

export function mount(el) {
  el.innerHTML = `
    <div class="viewport" id="ss-view"></div>
    <div class="panel no-print" style="left:16px;top:16px;width:290px">
      <h3><span data-i18n="Scena">Scene</span></h3>
      <div class="field"><span data-i18n="Scala">Scale</span>
        <div class="seg" id="ss-mode"><button data-m="visual" class="on"><span data-i18n="Visualizzazione">Visual</span></button><button data-m="scientific"><span data-i18n="Scientifica">Scientific</span></button></div>
      </div>
      <label class="row" style="margin-top:10px;font-size:16px"><input type="checkbox" id="ss-orbits" checked> <span data-i18n="Orbite da effemeridi">Ephemeris orbits</span></label>
      <h4><span data-i18n="Corpi">Bodies</span></h4>
      <div class="list" id="ss-list"></div><div id="ss-extra"></div><p class="note" data-i18n="Oggetti aggiuntivi: icone illustrative, disponibili solo nelle date coperte da Horizons."></p>
      <p class="note"><span data-i18n="Doppio clic su un pianeta o clic sull&#x27;etichetta per selezionarlo e seguirlo.">Double-click a planet or click its label to select and follow it.</span></p>
    </div>
    <div class="panel" id="ss-info" style="right:16px;top:16px;width:340px"></div>
    <div class="scale-tag" id="ss-scale"></div>`;
  const bodies = state.meta.bodies;
  scene = new SolarScene(el.querySelector('#ss-view'), bodies, { onPick: pick });
  el.querySelector('#ss-list').innerHTML = Object.entries(bodies).map(([k, b]) => `<div class="row"><input type="checkbox" data-visible="${k}" aria-label="${bodyName(k)}" checked><button data-k="${k}">${bodyName(k)}<small>${b.id}</small></button></div>`).join('');
  updateObjects = mountObjects(el.querySelector('#ss-extra'), scene);
  el.querySelectorAll('[data-visible]').forEach((c) => { c.onchange = () => scene.setObjectVisible(c.dataset.visible, c.checked); });
  el.querySelectorAll('#ss-list button').forEach((b) => (b.onclick = () => pick(b.dataset.k)));
  el.querySelectorAll('#ss-mode button').forEach((b) => (b.onclick = () => {
    el.querySelectorAll('#ss-mode button').forEach((x) => x.classList.toggle('on', x === b));
    state.scaleMode = b.dataset.m; scene.setMode(b.dataset.m); scaleTag();
  }));
  el.querySelector('#ss-orbits').onchange = (e) => scene.showOrbits(e.target.checked);
  info = el.querySelector('#ss-info');
  panel = el;
  scaleTag();
  on('ephem', () => { lastInfo = 0; });
  onLanguage(() => {
    el.querySelectorAll('#ss-list button').forEach((b) => { b.firstChild.textContent = bodyName(b.dataset.k); });
    renderInfo(msToJd(state.timeMs));
  });
}

function scaleTag() {
  panel.querySelector('#ss-scale').innerHTML = state.scaleMode === 'visual'
    ? `<b><span data-i18n="Scala di visualizzazione attiva">Visual scale active</span></b><span data-i18n=": distanze dal Sole compresse r′ = 40·√(r/AU), direzioni reali conservate; raggi ingranditi (0.45·√R); distanza Terra–Luna espansa. I calcoli usano sempre le coordinate reali.">: distances from the Sun compressed as r′ = 40·√(r/AU), true directions preserved; radii enlarged (0.45·√R); Earth–Moon distance expanded. Calculations always use real coordinates.</span>`
    : `<b><span data-i18n="Scala scientifica">Scientific scale</span></b><span data-i18n=": distanze e raggi reali (1 unità = 10⁶ km). I pianeti sono minuscoli: usare la lista per seguirli.">: real distances and radii (1 unit = 10⁶ km). Planets are tiny: use the list to follow them.</span>`;
  localize(panel.querySelector('#ss-scale'));
}

async function loadOrbits(jd) {
  const d = new Date((jd - 2440587.5) * 86400000);
  const month = d.toISOString().slice(0, 7);
  if (month === orbitMonth || orbitLoading || Date.now() < orbitRetryAt) return;
  orbitMonth = month; orbitLoading = true;
  try { scene.setOrbits(await api.orbits(d.toISOString())); } catch (e) { orbitMonth = null; orbitRetryAt = Date.now() + 30000; console.warn(e); }
  finally { orbitLoading = false; }
}

function pick(k) {
  const control = panel.querySelector(`[data-visible="${k}"]`);
  if (control) control.checked = true;
  scene.setObjectVisible(k, true);
  selected = k; scene.flyTo(k); lastInfo = 0; }

const fmt = (x, d = 3) => (x == null || isNaN(x) ? '—' : Number(x).toLocaleString(locale(), { maximumFractionDigits: d, minimumFractionDigits: d }));

function renderInfo(jd) {
  const b = state.meta.bodies[selected];
  const st = scene.status?.[selected] || 'insufficient';
  const p = scene.sci[selected], sun = scene.sci.sun, earth = scene.sci.earth;
  const dSun = p && sun ? p.distanceTo(sun) : null;
  const dEarth = p && earth && selected !== 'earth' ? p.distanceTo(earth) : null;
  // velocità eliocentrica da differenze finite sulle posizioni interpolate (±30 min)
  let v = null;
  if (selected !== 'sun') {
    const a = ephem.get(selected, jd - 1 / 48), c = ephem.get(selected, jd + 1 / 48);
    const sa = ephem.get('sun', jd - 1 / 48), sc = ephem.get('sun', jd + 1 / 48);
    if (a && c && sa && sc) {
      if (selected === 'moon') v = Math.hypot(...[0, 1, 2].map((i) => c.pos[i] - a.pos[i])) / 3600;
      else v = Math.hypot(...[0, 1, 2].map((i) => (c.pos[i] - sc.pos[i]) - (a.pos[i] - sa.pos[i]))) / 3600;
    }
  }
  const rot = 360 / b.wdot * 24;
  info.innerHTML = `
    <h3>${bodyName(selected)} <span class="badge b-${st === 'real' ? 'real' : st === 'interpolated' ? 'interpolated' : 'insufficient'}">${st === 'insufficient' ? t("dati non disponibili") : t(st === 'real' ? 'reale' : 'interpolato')}</span></h3>
    <div class="kv">
      <span data-i18n="ID Horizons">Horizons ID</span><span>${b.id}</span>
      <span data-i18n="Raggio medio">Mean radius</span><span>${fmt(b.radius_km, 1)} km</span>
      ${selected !== 'sun' ? `<span data-i18n="Distanza dal Sole">Distance from the Sun</span><span>${dSun ? fmt(dSun / AU_KM, 5) + ' AU' : '—'}</span>` : ''}
      ${dEarth ? `<span data-i18n="Distanza dalla Terra">Distance from Earth</span><span>${dEarth > 5e6 ? fmt(dEarth / AU_KM, 5) + ' AU' : fmt(dEarth, 0) + ' km'}</span>` : ''}
      ${v ? `<span>${t('Velocità {frame}', { frame: selected === 'moon' ? t('geocentrica') : t('eliocentrica') })}</span><span>${fmt(v, 3)} km/s</span>` : ''}
      <span data-i18n="Rotazione siderale">Sidereal rotation</span><span>${fmt(Math.abs(rot), 2)} h${rot < 0 ? t(" (retrograda)") : ''}</span>
      ${b.period_d ? `<span data-i18n="Periodo orbitale">Orbital period</span><span>${fmt(b.period_d, 2)} d</span>` : ''}
      <span data-i18n="Polo nord (α, δ)">North pole (α, δ)</span><span>${fmt(b.ra0, 2)}°, ${fmt(b.dec0, 2)}°</span>
    </div>
    <p class="note"><span data-i18n="Posizione: JPL Horizons, frame ICRF, centro">Position: JPL Horizons, ICRF frame, centre</span> ${selected === 'moon' ? t("Terra (500@399)") : t("baricentro del Sistema Solare")}<span data-i18n="; tra un campione e l&#x27;altro interpolazione di Hermite cubica (posizione + velocità).">; cubic Hermite interpolation between samples (position + velocity).</span>
    <span data-i18n="Orientamento e rotazione:">Orientation and rotation:</span> ${t(state.meta.orientation_source)}<span data-i18n=". Velocità da differenze finite (±30 min).">. Velocity from finite differences (±30 min).</span></p>`;
  localize(info);
}

export function frame() {
  const jd = msToJd(state.timeMs);
  ephem.ensure(jd);
  loadOrbits(jd);
  scene.update(jd, (k) => ephem.get(k, jd));
  updateObjects?.(jd);
  const now = performance.now();
  if (now - lastInfo > 300) { renderInfo(jd); lastInfo = now; }
  scene.render();
}
