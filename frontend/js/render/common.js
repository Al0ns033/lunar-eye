import * as THREE from 'three';
import { ECL, mul, bodyToIcrf } from '../science/ephem.js';

// Gestione caricamento texture con schermata di attesa
export const loadingManager = new THREE.LoadingManager();
const texLoader = new THREE.TextureLoader(loadingManager);
const cache = new Map();
export function tex(name, srgb = true) {
  if (cache.has(name)) return cache.get(name);
  const t = texLoader.load(`textures/${name}`);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(name, t);
  return t;
}

export function makeRenderer(canvas, { logDepth = false } = {}) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: logDepth });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.0;
  r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}

export function fit(renderer, camera, el, composer) {
  const w = el.clientWidth, h = el.clientHeight;
  if (!w || !h) return;
  const c = renderer.domElement;
  if (c.width !== Math.floor(w * renderer.getPixelRatio()) || c.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

// Frame della scena: eclittica J2000 con asse Y verso il polo nord dell'eclittica.
// ecl (x,y,z) -> three (x, z, -y)
const S = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];
export const ICRF_TO_SCENE = mul(S, ECL);
// geometria sferica di Three (polo +Y, lon 0 su +X, lon 90E su -Z) -> body-fixed (x, y=90E, z=nord)
const GINV = [[1, 0, 0], [0, 0, -1], [0, 1, 0]];

export function icrfToScene(v) {
  const M = ICRF_TO_SCENE;
  return new THREE.Vector3(
    M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
    M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
    M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]);
}

/** Matrice di orientamento (locale geometria -> scena) da IAU per un corpo al tempo jd. */
export function orientation(body, jd, target = new THREE.Matrix4()) {
  const M = mul(mul(ICRF_TO_SCENE, bodyToIcrf(body, jd)), GINV);
  target.set(M[0][0], M[0][1], M[0][2], 0, M[1][0], M[1][1], M[1][2], 0, M[2][0], M[2][1], M[2][2], 0, 0, 0, 0, 1);
  return target;
}

/** Texture radiale per alone/corona. */
export function glowTexture(inner = 'rgba(255,240,200,1)', outer = 'rgba(255,160,40,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, inner); grd.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.55)'));
  grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function starfield(radius = 1e5) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32),
    new THREE.MeshBasicMaterial({ map: tex('stars.jpg'), side: THREE.BackSide, depthWrite: false, color: 0x777777 }));
  m.renderOrder = -1;
  return m;
}
