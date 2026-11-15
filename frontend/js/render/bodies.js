// Modelli dei corpi: ogni pianeta ha materiale e configurazione dedicati.
import * as THREE from 'three';
import { tex, glowTexture } from './common.js';

const SEG = [128, 96];

function atmosphere(color, intensity = 1.0, scale = 1.025, power = 3.0) {
  return new THREE.Mesh(new THREE.SphereGeometry(scale, 96, 64), new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uI: { value: intensity }, uP: { value: power } },
    vertexShader: `varying vec3 vN; varying vec3 vW;
      void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz;
      gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 uColor; uniform vec3 uSun; uniform float uI; uniform float uP; varying vec3 vN; varying vec3 vW;
      void main(){ vec3 V = normalize(cameraPosition - vW); float rim = pow(1.0 - abs(dot(vN, V)), uP);
      float lit = smoothstep(-0.25, 0.4, dot(vN, uSun)); gl_FragColor = vec4(uColor * rim * lit * uI, rim * lit); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.FrontSide,
  }));
}

function earthMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      dayMap: { value: tex('earth.jpg') }, nightMap: { value: tex('earth_night.jpg') },
      specMap: { value: tex('earth_specular.jpg', false) }, uSun: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){ vUv = uv; vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz;
      gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform sampler2D dayMap; uniform sampler2D nightMap; uniform sampler2D specMap; uniform vec3 uSun;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 N = normalize(vN); float d = dot(N, uSun);
        vec3 day = texture2D(dayMap, vUv).rgb; vec3 night = texture2D(nightMap, vUv).rgb;
        float spec = texture2D(specMap, vUv).r;
        vec3 V = normalize(cameraPosition - vW); vec3 H = normalize(uSun + V);
        float sp = pow(max(dot(N, H), 0.0), 60.0) * spec * 0.6 * step(0.0, d);
        float dayMix = smoothstep(-0.08, 0.12, d);
        vec3 col = mix(night * vec3(1.0, 0.85, 0.6) * 1.4, day * (0.02 + 1.15 * max(d, 0.0)) + sp, dayMix);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/** Crea il gruppo del corpo. La sfera ha raggio 1: la scala la imposta la scena. */
export function makeBody(key) {
  const g = new THREE.Group();
  g.name = key;
  const sphere = (mat, seg = SEG) => new THREE.Mesh(new THREE.SphereGeometry(1, seg[0], seg[1]), mat);
  let mesh;
  const extras = { atm: null, clouds: null };
  switch (key) {
    case 'sun': {
      mesh = sphere(new THREE.MeshBasicMaterial({ map: tex('sun.jpg'), color: new THREE.Color(1.6, 1.35, 1.1) }));
      const glow = (s, op, c1, c2) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(c1, c2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op })); sp.scale.setScalar(s); return sp; };
      g.add(glow(4.2, 0.9, 'rgba(255,236,190,1)', 'rgba(255,140,30,0)'));
      g.add(glow(9, 0.35, 'rgba(255,200,120,1)', 'rgba(255,120,20,0)'));
      break;
    }
    case 'mercury':
      mesh = sphere(new THREE.MeshStandardMaterial({ map: tex('mercury.jpg'), bumpMap: tex('mercury.jpg', false), bumpScale: 2.5, roughness: 0.95, metalness: 0 }));
      break;
    case 'venus':
      mesh = sphere(new THREE.MeshStandardMaterial({ map: tex('venus.jpg'), roughness: 1, color: 0xfff2d0 }));
      extras.clouds = sphere(new THREE.MeshStandardMaterial({ map: tex('venus.jpg'), transparent: true, opacity: 0.45, roughness: 1, depthWrite: false, color: 0xffe8b0 }));
      extras.clouds.scale.setScalar(1.012);
      extras.atm = atmosphere(0xffd890, 1.1, 1.04, 2.5);
      break;
    case 'earth':
      mesh = sphere(earthMaterial(), [192, 128]);
      extras.clouds = sphere(new THREE.MeshStandardMaterial({ alphaMap: tex('earth_clouds.jpg', false), color: 0xffffff, transparent: true, depthWrite: false, roughness: 1 }), [192, 128]);
      extras.clouds.scale.setScalar(1.008);
      extras.atm = atmosphere(0x5aa8ff, 1.4, 1.03, 3.2);
      break;
    case 'moon':
      mesh = sphere(new THREE.MeshStandardMaterial({ map: tex('moon.jpg'), bumpMap: tex('moon.jpg', false), bumpScale: 1.5, roughness: 1, metalness: 0 }), [160, 96]);
      break;
    case 'mars':
      mesh = sphere(new THREE.MeshStandardMaterial({ map: tex('mars.jpg'), bumpMap: tex('mars.jpg', false), bumpScale: 2, roughness: 0.95 }));
      extras.atm = atmosphere(0xffa070, 0.6, 1.02, 4.0);
      break;
    case 'jupiter':
      mesh = sphere(new THREE.MeshStandardMaterial({ map: tex('jupiter.jpg'), roughness: 1 }));
      extras.atm = atmosphere(0xffe0c0, 0.5, 1.02, 4.0);
      break;
    case 'saturn': {
      mesh = sphere(new THREE.MeshStandardMaterial({ map: tex('saturn.jpg'), roughness: 1 }));
      extras.atm = atmosphere(0xffe6b0, 0.4, 1.02, 4.0);
      break;
    }
    case 'uranus':
      mesh = sphere(new THREE.MeshStandardMaterial({ map: tex('uranus.jpg'), roughness: 1, color: 0xd8ffff }));
      extras.atm = atmosphere(0x9ff0ff, 0.8, 1.03, 3.0);
      break;
    case 'neptune':
      mesh = sphere(new THREE.MeshStandardMaterial({ map: tex('neptune.jpg'), roughness: 1 }));
      extras.atm = atmosphere(0x5d8bff, 0.9, 1.03, 3.0);
      break;
  }
  mesh.userData.body = key;
  // "spin" ruota con l'orientamento IAU; contiene mesh, nubi e anelli
  const spin = new THREE.Group();
  spin.add(mesh);
  if (extras.clouds) spin.add(extras.clouds);
  g.add(spin);
  if (extras.atm) g.add(extras.atm);
  return { group: g, spin, mesh, ...extras };
}

/** Anelli di Saturno nel piano equatoriale (coordinate locali: polo = +Y). inner/outer in raggi del pianeta. */
export function makeRings(inner, outer) {
  const geo = new THREE.RingGeometry(inner, outer, 256, 4);
  const pos = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5); }
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex('saturn_ring.png'), transparent: true, side: THREE.DoubleSide, roughness: 1, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/**
 * Ombre reciproche anelli/pianeta (Saturno), calcolate nello shader per frammento.
 * Pianeta: raggio dal punto verso il Sole intersecato con il piano degli anelli; opacità dalla texture degli anelli.
 * Anelli: raggio verso il Sole intersecato con la sfera del pianeta (schiacciamento polare trascurato).
 * Ritorna le uniform da aggiornare a ogni frame (posizioni in coordinate mondo).
 */
export function ringShadows(planetMesh, ringMesh, inner, outer) {
  const u = {
    uSunW: { value: new THREE.Vector3() }, uCW: { value: new THREE.Vector3() }, uNW: { value: new THREE.Vector3(0, 1, 0) },
    uRW: { value: 1 }, uInner: { value: inner }, uOuter: { value: outer }, uRingTex: { value: tex('saturn_ring.png') },
  };
  const vert = (s) => s.replace('#include <common>', '#include <common>\nvarying vec3 vRSW;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvRSW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  const head = 'uniform vec3 uSunW; uniform vec3 uCW; uniform vec3 uNW; uniform float uRW; uniform float uInner; uniform float uOuter; uniform sampler2D uRingTex; varying vec3 vRSW;\n';
  planetMesh.material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = vert(sh.vertexShader);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + head)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
      { vec3 L = normalize(uSunW - vRSW); float dn = dot(L, uNW);
        if (abs(dn) > 1e-4) { float t = dot(uCW - vRSW, uNW) / dn;
          if (t > 0.0) { float r = length(vRSW + t * L - uCW) / uRW;
            if (r > uInner && r < uOuter) { float a = texture2D(uRingTex, vec2((r - uInner) / (uOuter - uInner), 0.5)).a;
              gl_FragColor.rgb *= 1.0 - 0.85 * a; } } } }`);
  };
  ringMesh.material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = vert(sh.vertexShader);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + head)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
      { vec3 L = normalize(uSunW - vRSW); vec3 oc = vRSW - uCW; float b = dot(oc, L); float c = dot(oc, oc) - uRW * uRW;
        float disc = b * b - c; if (disc > 0.0 && -b - sqrt(disc) > 0.0) gl_FragColor.rgb *= 0.06; }`);
  };
  planetMesh.material.needsUpdate = ringMesh.material.needsUpdate = true;
  return u;
}
