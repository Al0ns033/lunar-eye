// Calcoli scientifici lato client: tempo, frame, interpolazione, orientamento IAU.
// Nessuna dipendenza da Three.js (regola: scienza separata dal rendering).

export const AU_KM = 149597870.7;
export const J2000 = 2451545.0;
const OBLIQUITY = 23.4392911 * Math.PI / 180; // eclittica J2000 (IAU 1976), per ruotare ICRF -> eclittica
const D2R = Math.PI / 180;

export const msToJd = (ms) => ms / 86400000 + 2440587.5;
export const jdToMs = (jd) => (jd - 2440587.5) * 86400000;
export const TDB_MINUS_UTC_S = 69.184; // 37 s di leap second + 32.184 s (valido dal 2017)

/** ICRF equatoriale (x,y,z) -> eclittica J2000 (x,y,z). */
export function icrfToEcliptic([x, y, z]) {
  const c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY);
  return [x, c * y + s * z, -s * y + c * z];
}

/** Interpolazione di Hermite cubica su posizione e velocità (km, km/s). */
export function hermite(jd0, s0, jd1, s1, jd) {
  const h = (jd1 - jd0) * 86400;
  const u = (jd - jd0) / (jd1 - jd0);
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) out[i] = h00 * s0[i] + h10 * h * s0[i + 3] + h01 * s1[i] + h11 * h * s1[i + 3];
  return out;
}

/** Posizione da una serie {jd:[], state:[[x,y,z,vx,vy,vz]]}. Ritorna {pos, status} o null se fuori intervallo. */
export function sampleSeries(series, jd) {
  const t = series.jd;
  if (!t?.length || jd < t[0] || jd > t[t.length - 1]) return null;
  let lo = 0, hi = t.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= jd) lo = m; else hi = m; }
  if (Math.abs(t[lo] - jd) < 1e-9) return { pos: series.state[lo].slice(0, 3), status: 'real' };
  return { pos: hermite(t[lo], series.state[lo], t[hi], series.state[hi], jd), status: 'interpolated' };
}

/** Matrice 3x3 (righe) body-fixed -> ICRF secondo IAU: R = Rz(α0+90°)·Rx(90°−δ0)·Rz(W). */
export function bodyToIcrf(body, jdUt) {
  const d = jdUt + TDB_MINUS_UTC_S / 86400 - J2000;
  const a = (body.ra0 + 90) * D2R, b = (90 - body.dec0) * D2R;
  const w = ((body.w0 + body.wdot * d) % 360) * D2R;
  const Rz = (t) => [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]];
  const Rx = (t) => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]];
  return mul(mul(Rz(a), Rx(b)), Rz(w));
}

export function mul(A, B) {
  return A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
}

export const ECL = (() => { const c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY); return [[1, 0, 0], [0, c, s], [0, -s, c]]; })();

/** Lat/lon selenografiche (gradi, lon Est) + raggio -> vettore body-fixed. */
export function latLonToBody(lat, lon, r = 1) {
  const p = lat * D2R, l = lon * D2R;
  return [r * Math.cos(p) * Math.cos(l), r * Math.cos(p) * Math.sin(l), r * Math.sin(p)];
}

export function bodyToLatLon([x, y, z]) {
  const r = Math.hypot(x, y, z);
  return { lat: Math.asin(z / r) / D2R, lon: ((Math.atan2(y, x) / D2R) + 360) % 360, r };
}

/** Direzione ENU (East, North, Up) da azimut (da Nord verso Est) ed elevazione in gradi. */
export function azElToEnu(az, el) {
  const a = az * D2R, e = el * D2R;
  return [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
}

export const fmtLon = (lon) => { const l = ((lon + 540) % 360) - 180; return `${Math.abs(l).toFixed(3)}° ${l >= 0 ? 'E' : 'W'}`; };
export const fmtLat = (lat) => `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}`;
