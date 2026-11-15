import { t, onLanguage } from '../i18n.js';
// Pagina 6: Centro didattico, con una dimostrazione 3D interattiva dell'illuminazione polare.
import { api } from '../api.js';
import { MoonGlobe } from '../render/moonGlobe.js';
import * as THREE from 'three';

let globe;
const TOPICS = () => [
  [t("Polo sud lunare"), t("L'asse di rotazione della Luna è inclinato di appena ~1.5° rispetto all'eclittica. Ai poli il Sole resta quindi sempre vicino all'orizzonte: le cime possono restare illuminate quasi sempre, mentre i fondi dei crateri restano al buio.")],
  [t("Regioni in ombra permanente (PSR)"), t("I fondi dei crateri polari, come Shackleton, non ricevono mai luce solare diretta. Ci sono temperature sotto i 40 K, che possono intrappolare ghiaccio d'acqua: una risorsa chiave per le missioni Artemis.")],
  [t("Illuminazione solare"), t("Un giorno lunare dura circa 29.5 giorni terrestri: all'equatore sono circa 14.7 giorni di luce e altrettanti di notte. Con il Sole a pochi gradi di elevazione, una collina distante decine di km può nasconderlo: per questo l'orizzonte va calcolato dal terreno reale.")],
  [t("Geometria delle comunicazioni"), t("La Luna mostra sempre la stessa faccia alla Terra, ma la librazione sposta la Terra di qualche grado nel cielo lunare. Dal polo sud la Terra oscilla attorno all'orizzonte: per settimane può sparire, e servono satelliti relay.")],
  [t("Terreno lunare"), t("La topografia viene dall'altimetro laser LOLA a bordo di LRO, che ha misurato miliardi di punti. Qui usiamo i modelli LDEM a 4 e 16 pixel per grado: abbastanza per orizzonti e grandi rilievi, non per massi e piccoli crateri.")],
  [t("Meccanica orbitale"), t("Le posizioni dei pianeti vengono dalle effemeridi JPL DE441, che integrano numericamente le equazioni del moto con le perturbazioni reciproche. Le orbite sono ellissi inclinate ed eccentriche, non cerchi.")],
  [t("Energia solare"), t("Sulla Luna l'irraggiamento è di circa 1361 W/m² (nessuna atmosfera). Con il Sole basso all'orizzonte i pannelli verticali che seguono il Sole in azimut sono molto più efficaci di quelli orizzontali, come mostra la pagina Pianificazione.")],
  [t("Pianificazione della missione"), t("Per scegliere un sito si incrociano luce, comunicazioni, pendenza, accesso alle PSR e rischi. Questo strumento calcola la geometria: le decisioni reali richiedono anche DEM ad alta risoluzione, modelli termici e analisi radio.")],
];

export function mount(el) {
  el.innerHTML = `<div class="scroll-page">
    <h2><span data-i18n="Centro didattico">Learning centre</span></h2><p class="sub"><span data-i18n="Le sfide dell&#x27;esplorazione lunare, con il terreno reale LOLA.">The challenges of lunar exploration, with real LOLA terrain.</span></p>
    <div class="edu-hero" data-panel-key="education-experiment" data-panel-title="Esperimento 3D">
      <div class="edu-3d"><div class="viewport" id="edu-view"></div></div>
      <div class="card">
        <h4><span data-i18n="Esperimento: luce radente al polo sud">Experiment: grazing sunlight at the south pole</span></h4>
        <p><span data-i18n="Muovi il Sole attorno alla Luna. Al polo la luce arriva sempre quasi orizzontale: guarda come le ombre dei crateri si allungano e alcune zone restano sempre buie.">Move the Sun around the Moon. At the pole, light arrives almost horizontally: watch crater shadows lengthen and some areas stay dark.</span></p>
        <p class="note" data-i18n="Trascina il globo per ruotarlo; sposta i cursori per cambiare la posizione del Sole e osservare le ombre.">Drag the globe to rotate it; move the sliders to change the Sun’s position and observe the shadows.</p>
        <label class="field" style="margin-top:12px"><span data-i18n="Longitudine sub-solare:">Subsolar longitude:</span> <b id="edu-lonv">0°</b><input type="range" id="edu-lon" min="0" max="360" value="0"></label>
        <label class="field"><span data-i18n="Latitudine sub-solare (±1.54° reali):">Subsolar latitude (actual range ±1.54°):</span> <b id="edu-latv">0°</b><input type="range" id="edu-lat" min="-10" max="10" step="0.1" value="0"></label>
        <p class="note"><span class="badge b-illustrative"><span data-i18n="illustrativo">illustrative</span></span> <span data-i18n="La posizione del Sole è controllata a mano. Rilievo LOLA esagerato 15× per rendere visibili le ombre.">The Sun position is controlled manually. LOLA relief is exaggerated 15× to reveal shadows.</span></p>
      </div>
    </div>
    <div class="cards" id="edu-topics">${TOPICS().map(([t, d]) => `<div class="card"><h4>${t}</h4><p>${d}</p></div>`).join('')}</div>
  </div>`;
  globe = new MoonGlobe(el.querySelector('#edu-view'), { exaggeration: 15 });
  api.globe().then((h) => { globe.build(h); globe.gridGroup.visible = false; globe.lookAt(-62, 0, 3.2); upd(); });
  const upd = () => {
    const lon = Number(el.querySelector('#edu-lon').value), lat = Number(el.querySelector('#edu-lat').value);
    el.querySelector('#edu-lonv').textContent = `${lon}°`; el.querySelector('#edu-latv').textContent = `${lat}°`;
    const p = lat * Math.PI / 180, l = lon * Math.PI / 180;
    globe.setSunDir(new THREE.Vector3(Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)));
  };
  onLanguage(() => { el.querySelector('#edu-topics').innerHTML = TOPICS().map(([title, description]) => `<div class="card"><h4>${title}</h4><p>${description}</p></div>`).join(''); });
  el.querySelector('#edu-lon').oninput = upd; el.querySelector('#edu-lat').oninput = upd;
}

export function frame() { if (globe?.el.clientWidth) globe?.render(); }
