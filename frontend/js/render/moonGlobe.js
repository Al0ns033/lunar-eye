import { siteName } from '../i18n.js';
// Globo lunare con rilievo reale LOLA (LDEM_4 ridotto a 2 px/grado) e drappeggio della texture LROC.
// Frame del globo: polo nord selenografico = +Y, lon 0 = +X, lon 90E = -Z (stessa convenzione di SphereGeometry).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { makeRenderer, fit, tex, starfield } from './common.js';

const R_M = 1737400;
const D2R = Math.PI / 180;

export function latLonToLocal(lat, lon, r = 1) {
  const p = lat * D2R, l = lon * D2R;
  return new THREE.Vector3(r * Math.cos(p) * Math.cos(l), r * Math.sin(p), -r * Math.cos(p) * Math.sin(l));
}
export function localToLatLon(v) {
  const r = v.length();
  return { lat: Math.asin(v.y / r) / D2R, lon: ((Math.atan2(-v.z, v.x) / D2R) + 360) % 360 };
}

export class MoonGlobe {
  constructor(container, { onPick, exaggeration = 8 } = {}) {
    this.el = container;
    this.exag = exaggeration;
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    this.renderer = makeRenderer(canvas);
    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels-layer';
    container.appendChild(this.labels.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.001, 100);
    this.camera.position.set(0.8, -1.6, 2.6);
    this.controls = new OrbitControls(this.camera, this.labels.domElement);
    this.controls.enableDamping = true; this.controls.minDistance = 1.03; this.controls.maxDistance = 10;
    this.controls.rotateSpeed = 0.5;
    this.scene.add(starfield(50));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.06));
    this.light = new THREE.DirectionalLight(0xffffff, 2.6);
    this.scene.add(this.light);
    this.headlight = true;
    this.markers = new THREE.Group(); this.scene.add(this.markers);

    const ray = new THREE.Raycaster();
    let down = null;
    this.labels.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
    this.labels.domElement.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || !this.mesh) return;
      const r = this.labels.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
      const hit = ray.intersectObject(this.mesh)[0];
      if (hit) onPick?.(localToLatLon(hit.point));
    });
  }

  /** heights: {h, w, data:Int16Array} in metri, riga 0 = lat +90, colonna 0 = lon 0. */
  build(heights) {
    this.heights = heights;
    const geo = new THREE.SphereGeometry(1, 720, 360);
    this.base = geo.attributes.position.array.slice();
    this.geo = geo;
    this.applyExaggeration(this.exag);
    const mat = new THREE.MeshStandardMaterial({ map: tex('moon.jpg'), roughness: 1, metalness: 0 });
    // Coordinate texture calcolate per frammento dalla direzione (lat/lon), con gradienti senza salto
    // sulla linea di cambio data: elimina la "stella" di triangoli stirati ai poli.
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDirL;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDirL = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vDirL;')
        .replace('#include <map_fragment>', `
          vec3 dL = normalize(vDirL);
          float lonA = atan(-dL.z, dL.x);
          vec2 uvA = vec2(lonA / 6.2831853 + 0.5, asin(clamp(dL.y, -1.0, 1.0)) / 3.1415927 + 0.5);
          vec2 uvB = vec2(fract(uvA.x + 0.5), uvA.y);
          vec2 gxA = dFdx(uvA), gyA = dFdy(uvA), gxB = dFdx(uvB), gyB = dFdy(uvB);
          bool useB = abs(gxB.x) + abs(gyB.x) < abs(gxA.x) + abs(gyA.x);
          vec2 gx = useB ? gxB : gxA, gy = useB ? gyB : gyA;
          diffuseColor *= textureGrad(map, uvA, gx, gy);`);
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.mesh);
    this.scene.add(this.grid());
  }

  heightAt(lat, lon) {
    const { h, w, data } = this.heights;
    const y = Math.min(Math.max((90 - lat) * (h / 180) - 0.5, 0), h - 1.001);
    const x = (((lon % 360) + 360) % 360) * (w / 360) - 0.5;
    const y0 = Math.floor(y), x0 = Math.floor(x), fy = y - y0, fx = x - x0;
    const X0 = (x0 + w) % w, X1 = (x0 + 1) % w, Y1 = Math.min(y0 + 1, h - 1);
    const v = (r, c) => data[r * w + c];
    return (v(y0, X0) * (1 - fx) + v(y0, X1) * fx) * (1 - fy) + (v(Y1, X0) * (1 - fx) + v(Y1, X1) * fx) * fy;
  }

  /**
   * Quota per la mesh. Oltre 75° di latitudine la griglia lat/lon converge e produce creste radiali:
   * si media su un disco di raggio fisico fisso (~12 km, ordine della risoluzione del DEM) nel piano tangente.
   */
  meshHeight(v, lat, lon) {
    if (Math.abs(lat) < 75) return this.heightAt(lat, lon);
    const n = v.clone().normalize();
    const e = new THREE.Vector3(0, 1, 0).cross(n);
    if (e.lengthSq() < 1e-12) e.set(1, 0, 0); else e.normalize();
    const t = n.clone().cross(e);
    const rad = 12000 / R_M;
    let sum = this.heightAt(lat, lon), cnt = 1;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const q = n.clone().addScaledVector(e, Math.cos(a) * rad).addScaledVector(t, Math.sin(a) * rad);
      const ll = localToLatLon(q);
      sum += this.heightAt(ll.lat, ll.lon); cnt++;
    }
    return sum / cnt;
  }

  applyExaggeration(k) {
    this.exag = k;
    const p = this.geo.attributes.position, b = this.base, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(b[3 * i], b[3 * i + 1], b[3 * i + 2]);
      const { lat, lon } = localToLatLon(v);
      const r = 1 + (this.meshHeight(v, lat, lon) / R_M) * k;
      p.setXYZ(i, v.x * r, v.y * r, v.z * r);
    }
    p.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    this.refreshMarkers?.();
  }

  surface(lat, lon, lift = 0.002) { return latLonToLocal(lat, lon, 1 + (this.heightAt(lat, lon) / R_M) * this.exag + lift); }

  grid() {
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: 0x5fd4ff, transparent: true, opacity: 0.22 });
    const r = 1.025;
    for (let lat = -75; lat <= 75; lat += 15) {
      const pts = []; for (let lon = 0; lon <= 360; lon += 2) pts.push(latLonToLocal(lat, lon, r));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
    for (let lon = 0; lon < 360; lon += 15) {
      const pts = []; for (let lat = -90; lat <= 90; lat += 2) pts.push(latLonToLocal(lat, lon, r));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lon === 0 ? new THREE.LineBasicMaterial({ color: 0x5fd4ff, transparent: true, opacity: 0.6 }) : mat));
    }
    this.gridGroup = g;
    return g;
  }

  setSites(sites, selected) {
    this._sites = sites; this._sel = selected;
    this.refreshMarkers = () => {
      this.markers.clear();
      for (const s of sites) {
        const div = document.createElement('div'); div.className = 'site-label'; div.textContent = siteName(s);
        const l = new CSS2DObject(div); l.position.copy(this.surface(s.lat, s.lon, 0.01));
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), new THREE.MeshBasicMaterial({ color: 0x9fe6ff }));
        dot.position.copy(this.surface(s.lat, s.lon));
        this.markers.add(dot, l);
      }
      if (selected) {
        const p = this.surface(selected.lat, selected.lon);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 16), new THREE.MeshBasicMaterial({ color: 0xffb547 }));
        cone.position.copy(p.clone().multiplyScalar(1.02));
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), p.clone().normalize()); // punta verso la superficie
        this.markers.add(cone);
      }
    };
    if (this.mesh) this.refreshMarkers();
  }

  lookAt(lat, lon, dist = 1.9) {
    const dir = latLonToLocal(lat, lon).normalize();
    this.controls.target.set(0, 0, 0);
    this.camera.position.copy(dir.multiplyScalar(dist));
  }

  /** Direzione del Sole nel frame del globo (opzionale): se null usa una luce solidale alla camera. */
  setSunDir(v) { this.sunDir = v; }

  render() {
    fit(this.renderer, this.camera, this.el);
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (this.labels._w !== w || this.labels._h !== h) { this.labels.setSize(w, h); this.labels._w = w; this.labels._h = h; }
    this.controls.update();
    if (this.sunDir) this.light.position.copy(this.sunDir).multiplyScalar(10);
    else this.light.position.copy(this.camera.position).add(new THREE.Vector3(0.6, 0.8, 0).applyQuaternion(this.camera.quaternion));
    // nasconde etichette e marker sul lato non visibile del globo
    const cam = this.camera.position;
    for (const o of this.markers.children) {
      const p = o.position;
      o.visible = p.dot(cam.clone().sub(p)) > 0;
    }
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}
