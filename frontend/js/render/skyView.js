import { t, onLanguage } from '../i18n.js';
// Vista dell'orizzonte locale: terreno LOLA attorno al sito (scala reale), cupola celeste con griglia
// Az/El, profilo dell'orizzonte topografico, Sole e Terra nelle posizioni calcolate.
// Frame: ENU -> three (x = Est, y = Alto, z = -Nord). Unità: km.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { makeRenderer, fit, tex, glowTexture } from './common.js';
import { azElToEnu } from '../science/ephem.js';

const enu3 = ([e, n, u]) => new THREE.Vector3(e, u, -n);

export class SkyView {
  constructor(container) {
    this.el = container;
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    this.renderer = makeRenderer(canvas);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.labels = new CSS2DRenderer(); this.labels.domElement.className = 'labels-layer';
    container.appendChild(this.labels.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02040a);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 2000);
    this.camera.position.set(-50, 42, 62);
    this.controls = new OrbitControls(this.camera, this.labels.domElement);
    this.dirty = true;
    this.drawCount = 0;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.controls.enableDamping = true; this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 35; this.controls.maxDistance = 150;
    this.scene.add(new THREE.AmbientLight(0x9fb4d0, 0.18));
    this.sun = new THREE.DirectionalLight(0xffffff, 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 300 });
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);
    this.earthLight = new THREE.DirectionalLight(0x8fb8ff, 0.08); // luce cinerea (illustrativa)
    this.scene.add(this.earthLight);
    this.R = 42; // raggio della cupola celeste in km (solo rappresentazione)
    this.scene.add(this.dome());
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(7);
    this.sunSprite = glow; this.scene.add(glow);
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshStandardMaterial({ map: tex('earth.jpg'), roughness: 0.9 }));
    this.scene.add(this.earth);
    this.sunLabel = this.label(t('Sole')); this.earthLabel = this.label(t('Terra'));
    // Distanziare solo i testi, mantenendo inalterate le posizioni astronomiche.
    this.sunLabel.center.set(0.5, 1.4); this.earthLabel.center.set(0.5, -0.4);
    for (const object of [this.sunSprite, this.earth, this.sunLabel, this.earthLabel]) object.visible = false;
    onLanguage(() => {
      this.dirty = true;
      if (this.lastBodies) this.setBodies(...this.lastBodies);
      else { this.sunLabel.element.textContent = t('Sole'); this.earthLabel.element.textContent = t('Terra'); }
    });
    this.observer = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 16), new THREE.MeshBasicMaterial({ color: 0xffb547 }));
    this.scene.add(this.observer);
  }

  label(t) { const d = document.createElement('div'); d.className = 'sky-label'; d.textContent = t; const o = new CSS2DObject(d); this.scene.add(o); return o; }

  dome() {
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: 0x3fa9e0, transparent: true, opacity: 0.25 });
    for (const el of [0, 15, 30, 45, 60, 75]) {
      const pts = []; for (let a = 0; a <= 360; a += 3) pts.push(enu3(azElToEnu(a, el)).multiplyScalar(this.R));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), el === 0 ? new THREE.LineBasicMaterial({ color: 0x3fa9e0, opacity: 0.6, transparent: true }) : mat));
    }
    for (let a = 0; a < 360; a += 30) {
      const pts = []; for (let el = 0; el <= 90; el += 3) pts.push(enu3(azElToEnu(a, el)).multiplyScalar(this.R));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
    for (const [a, n] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
      const d = document.createElement('div'); d.className = 'card-label'; d.textContent = n;
      const o = new CSS2DObject(d); o.position.copy(enu3(azElToEnu(a, 0)).multiplyScalar(this.R * 1.04)); g.add(o);
    }
    return g;
  }

  /** patch: {n, half_km, h_m, h0_m}; mask: {az_deg, elev_deg}. */
  setTerrain(patch, mask) {
    this.dirty = true;
    if (this.terrain) { this.scene.remove(this.terrain); this.terrain.geometry.dispose(); this.terrain.material.dispose(); }
    const { n, half_km, h_m, h0_m } = patch;
    const geo = new THREE.PlaneGeometry(2 * half_km, 2 * half_km, n - 1, n - 1);
    geo.rotateX(-Math.PI / 2); // piano XZ; x = Est, z = -Nord
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    let min = Infinity, max = -Infinity; h_m.forEach((h) => { min = Math.min(min, h); max = Math.max(max, h); });
    for (let i = 0; i < pos.count; i++) {
      // PlaneGeometry ruotata: riga 0 a z = -half (Nord). h_m: riga 0 = N = -half km
      const row = Math.floor(i / n), c = i % n;
      const h = h_m[(n - 1 - row) * n + c];
      pos.setY(i, (h - h0_m) / 1000);
      const t = (h - min) / (max - min || 1);
      const g = 0.32 + 0.4 * t; col.set([g, g * 0.98, g * 0.95], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    this.terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: false }));
    this.terrain.castShadow = this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
    this.observer.position.set(0, 0.8, 0);
    this.half = half_km;
    if (this.maskLine) { this.scene.remove(this.maskLine); this.maskLine.geometry.dispose(); this.maskLine.material.dispose(); }
    if (mask) {
      const pts = mask.az_deg.map((a, i) => enu3(azElToEnu(a, mask.elev_deg[i])).multiplyScalar(this.R));
      pts.push(pts[0].clone());
      this.maskLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xff9d3c }));
      this.scene.add(this.maskLine);
    }
  }

  /** Posiziona Sole e Terra (gradi). Il diametro della Terra è ingrandito 4x per leggibilità. */
  setBodies(sun, earth) {
    this.dirty = true;
    for (const object of [this.sunSprite, this.earth, this.sunLabel, this.earthLabel]) object.visible = true;
    this.lastBodies = [sun, earth];
    const sd = enu3(azElToEnu(sun.az, sun.el));
    this.sun.position.copy(sd).multiplyScalar(150);
    this.sun.intensity = sun.visible > 0 ? 3.2 * sun.visible : 0;
    this.sunSprite.position.copy(sd).multiplyScalar(this.R);
    this.sunLabel.position.copy(sd).multiplyScalar(this.R * 1.08);
    this.sunLabel.element.textContent = `${t('Sole')} ${sun.el.toFixed(2)}°`;
    const ed = enu3(azElToEnu(earth.az, earth.el));
    this.earth.position.copy(ed).multiplyScalar(this.R);
    const angR = (earth.diam || 1.9) * Math.PI / 180 / 2;
    this.earth.scale.setScalar(this.R * Math.tan(angR) * 4);
    this.earthLabel.position.copy(ed).multiplyScalar(this.R * 1.1);
    this.earthLabel.element.textContent = `${t('Terra')} ${earth.el.toFixed(2)}° (×4)`;
    this.earthLight.position.copy(ed).multiplyScalar(100);
    // la Terra è illuminata dal Sole: fase corretta
    this.earthSun = sd;
  }

  resetView() {
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(-50, 42, 62);
    this.controls.update();
    this.dirty = true;
  }

  render() {
    fit(this.renderer, this.camera, this.el);
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    if (this.labels._w !== w || this.labels._h !== h) { this.labels.setSize(w, h); this.labels._w = w; this.labels._h = h; }
    this.controls.update();
    const size = `${w}x${h}`;
    if (size !== this.lastSize) this.dirty = true;
    this.lastSize = size;
    if (!this.dirty) return;
    this.dirty = false;
    this.drawCount++;
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}
