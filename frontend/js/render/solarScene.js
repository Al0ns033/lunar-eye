import { bodyName, onLanguage } from '../i18n.js';
// Scena del Sistema Solare. Le posizioni arrivano dalle effemeridi (km, ICRF); qui si applica solo
// la trasformazione di visualizzazione, che non modifica mai i dati scientifici.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeRenderer, fit, icrfToScene, orientation, starfield } from './common.js';
import { makeBody, makeRings, ringShadows } from './bodies.js';
import { AU_KM } from '../science/ephem.js';

const SCI_UNIT_KM = 1e6;       // modalità scientifica: 1 unità = 1 milione di km, tutto in scala reale
const VIS_C = 40;              // modalità visuale: r' = C * sqrt(r / AU), direzione conservata
const visRadius = (key, R) => key === 'sun' ? 6 : 0.45 * Math.sqrt(R / 1000);

export class SolarScene {
  constructor(container, bodies, { onPick } = {}) {
    this.el = container;
    this.bodiesMeta = bodies;
    this.mode = 'visual';
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    this.renderer = makeRenderer(canvas, { logDepth: true });
    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels-layer';
    container.appendChild(this.labels.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 1e-6, 2e6);
    this.camera.position.set(0, 120, 220);
    this.controls = new OrbitControls(this.camera, this.labels.domElement);
    this.controls.enableDamping = true;
    this.dirty = true;
    this.drawCount = 0;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.scene.add(starfield(1.5e6));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.035));
    this.sunLight = new THREE.PointLight(0xfff4e8, 3.2, 0, 0);
    this.scene.add(this.sunLight);

    this.objs = {};
    for (const key of Object.keys(bodies)) {
      const o = makeBody(key);
      if (key === 'saturn') {
        const [ri, ro] = bodies.saturn.rings_km.map((x) => x / bodies.saturn.radius_km);
        const ring = makeRings(ri, ro);
        o.spin.add(ring);
        this.ringU = ringShadows(o.mesh, ring, ri, ro);
      }
      const lab = document.createElement('div');
      lab.className = 'body-label'; lab.textContent = bodyName(key);
      onLanguage(() => { lab.textContent = bodyName(key); });
      lab.addEventListener('click', (e) => { e.stopPropagation(); onPick?.(key); });
      const l = new CSS2DObject(lab);
      o.group.add(l);
      o.label = l;
      this.scene.add(o.group);
      this.objs[key] = o;
    }
    this.orbitLines = {};
    this.focus = null;
    this.hidden = new Set();
    this.orbitsVisible = true;
    this.sci = {}; // ultime posizioni scientifiche (km, scena) per i pannelli

    // composer con bloom controllato (soglia alta: solo il Sole supera la soglia)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.4, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    const ray = new THREE.Raycaster();
    this.labels.domElement.addEventListener('dblclick', (e) => {
      const r = this.labels.domElement.getBoundingClientRect();
      const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(p, this.camera);
      const hit = ray.intersectObjects(Object.values(this.objs).filter((o) => !o.marker && o.group.visible).map((o) => o.mesh))[0];
      if (hit) onPick?.(hit.object.userData.body);
    });
  }

  setMode(m) { this.dirty = true; this.mode = m; this._orbitCache = null; this.rebuildOrbits(); this.camera.position.set(0, m === 'visual' ? 120 : 3000, m === 'visual' ? 220 : 5000); this.controls.target.set(0, 0, 0); }

  /** Trasformazione di visualizzazione di una posizione eliocentrica (vettore scena in km). */
  displayHelio(v) {
    if (this.mode === 'scientific') return v.clone().divideScalar(SCI_UNIT_KM);
    const r = v.length();
    if (r === 0) return v.clone();
    return v.clone().multiplyScalar(VIS_C * Math.sqrt(r / AU_KM) / r);
  }

  setOrbits(orbits) { this.orbits = orbits; this.rebuildOrbits(); }

  rebuildOrbits() {
    this.dirty = true;
    if (!this.orbits) return;
    const sunKm = this.sci.sun || new THREE.Vector3();
    for (const [key, o] of Object.entries(this.orbits)) {
      const pts = o.pos.map((p) => this.displayHelio(icrfToScene(p).sub(sunKm)));
      const sunDisp = this.sunDisplay || new THREE.Vector3();
      pts.forEach((p) => p.add(sunDisp));
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      if (this.orbitLines[key]) { this.orbitLines[key].geometry.dispose(); this.orbitLines[key].geometry = geo; continue; }
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: key === 'earth' ? 0x4fc3ff : 0x3f7fb3, transparent: true, opacity: key === 'earth' ? 0.85 : 0.5 }));
      this.orbitLines[key] = line;
      line.visible = this.orbitsVisible && !this.hidden.has(key);
      this.scene.add(line);
    }
  }

  showOrbits(v) { this.dirty = true; this.orbitsVisible = v; Object.entries(this.orbitLines).forEach(([k, l]) => (l.visible = v && !this.hidden.has(k))); }

  setObjectVisible(key, visible) {
    if (this.objs[key]?.group.visible !== visible) this.dirty = true;
    if (visible) this.hidden.delete(key); else this.hidden.add(key);
    if (this.objs[key]) this.objs[key].group.visible = visible;
    if (this.orbitLines[key]) this.orbitLines[key].visible = visible && this.orbitsVisible;
    if (!visible && this.focus === key) this.focus = null;
  }

  addMarker(key, name, kind) {
    const color = { asteroid: 0xffb547, comet: 0x3ddc97, spacecraft: 0xff7eb6 }[kind];
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color }));
    const group = new THREE.Group(); group.add(mesh);
    const label = document.createElement('div'); label.className = 'body-label'; label.textContent = name;
    group.add(new CSS2DObject(label)); group.visible = false;
    this.scene.add(group); this.objs[key] = { group, mesh, marker: true };
  }

  updateMarker(key, position) {
    const o = this.objs[key];
    if (!o || !this.sci.sun) return;
    const km = icrfToScene(position);
    const display = this.displayHelio(km.sub(this.sci.sun)).add(this.sunDisplay);
    if (!o.group.position.equals(display)) this.dirty = true;
    o.group.position.copy(display);
    // Icona convenzionale: non rappresenta dimensione o assetto fisico.
  }

  /** Aggiorna posizioni e orientamenti. getPos(key) -> {pos:[km ICRF], status} | null. */
  update(jd, getPos) {
    if (jd !== this.lastJd) this.dirty = true;
    this.lastJd = jd;
    const sunP = getPos('sun');
    if (!sunP) return false;
    const sunKm = icrfToScene(sunP.pos);
    const moveSun = !this.sci.sun || this.sci.sun.distanceTo(sunKm) > 1e5;
    this.sci.sun = sunKm;
    this.sunDisplay = this.mode === 'scientific' ? sunKm.clone().divideScalar(SCI_UNIT_KM) : sunKm.clone().multiplyScalar(VIS_C / AU_KM);
    if (moveSun) this.rebuildOrbits();
    this.status = {};
    for (const [key, o] of Object.entries(this.objs)) {
      if (o.marker) continue;
      const meta = this.bodiesMeta[key];
      let disp, R;
      if (key === 'moon') {
        const m = getPos('moon'); const e = this.sci.earth;
        if (!m || !e) { o.group.visible = false; continue; }
        const geo = icrfToScene(m.pos);
        this.sci.moon = e.clone().add(geo);
        this.status.moon = m.status;
        const eDisp = this.objs.earth.group.position;
        if (this.mode === 'scientific') disp = this.sci.moon.clone().divideScalar(SCI_UNIT_KM);
        else {
          const d = geo.length(), Re = visRadius('earth', 6371);
          disp = eDisp.clone().add(geo.clone().multiplyScalar(0.6 * Re * Math.sqrt(d / 6371) / d));
        }
      } else {
        const p = key === 'sun' ? sunP : getPos(key);
        if (!p) { o.group.visible = false; continue; }
        const km = icrfToScene(p.pos);
        this.sci[key] = km;
        this.status[key] = p.status;
        disp = key === 'sun' ? this.sunDisplay : this.displayHelio(km.clone().sub(sunKm)).add(this.sunDisplay);
      }
      if (o.group.visible !== !this.hidden.has(key)) this.dirty = true;
      o.group.visible = !this.hidden.has(key);
      R = this.mode === 'scientific' ? meta.radius_km / SCI_UNIT_KM : visRadius(key, meta.radius_km);
      o.group.position.copy(disp);
      o.group.scale.setScalar(R);
      orientation(meta, jd, o.spin.matrix);
      o.spin.matrixAutoUpdate = false;
      if (o.clouds) o.clouds.rotation.y = (jd * (key === 'venus' ? 0.3 : 0.02)) % (2 * Math.PI); // deriva illustrativa delle nubi
    }
    this.sunLight.position.copy(this.sunDisplay);
    // direzione del Sole per shader (Terra, atmosfere)
    for (const o of Object.values(this.objs)) {
      if (o.marker) continue;
      const L = this.sunDisplay.clone().sub(o.group.position).normalize();
      if (o.mesh.material.uniforms?.uSun) o.mesh.material.uniforms.uSun.value.copy(L);
      if (o.atm) o.atm.material.uniforms.uSun.value.copy(L);
    }
    if (this.ringU) { // ombre anelli/pianeta: polo di Saturno in coordinate mondo
      const sat = this.objs.saturn;
      this.ringU.uSunW.value.copy(this.sunDisplay);
      this.ringU.uCW.value.copy(sat.group.position);
      this.ringU.uRW.value = sat.group.scale.x;
      this.ringU.uNW.value.set(0, 1, 0).applyMatrix4(new THREE.Matrix4().extractRotation(sat.spin.matrix)).normalize();
    }
    if (this.focus) {
      const p = this.objs[this.focus].group.position;
      const delta = p.clone().sub(this.controls.target);
      this.controls.target.add(delta); this.camera.position.add(delta);
    }
    return true;
  }

  flyTo(key) {
    this.dirty = true;
    this.focus = key;
    const o = this.objs[key];
    const R = o.group.scale.x;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(o.group.position);
    this.camera.position.copy(o.group.position).add(dir.multiplyScalar(R * (key === 'saturn' ? 8 : 5)));
  }

  render() {
    fit(this.renderer, this.camera, this.el, this.composer);
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (this.labels._w !== w || this.labels._h !== h) { this.labels.setSize(w, h); this.labels._w = w; this.labels._h = h; }
    this.controls.update();
    const size = `${w}x${h}`;
    if (size !== this.lastSize) this.dirty = true;
    this.lastSize = size;
    if (!this.dirty) return;
    this.dirty = false;
    this.drawCount++;
    this.composer.render();
    this.labels.render(this.scene, this.camera);
  }
}
