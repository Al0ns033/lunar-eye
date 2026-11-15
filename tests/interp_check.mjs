// Verifica l'interpolazione di Hermite del frontend (stesso modulo usato nel browser) contro Horizons.
// Uso: node tests/interp_check.mjs fixture.json -> stampa JSON con gli errori massimi in km per corpo.
import { readFileSync } from 'node:fs';
import { sampleSeries } from '../frontend/js/science/ephem.js';
const fx = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = {};
for (const [k, { series, ref }] of Object.entries(fx)) {
  let max = 0;
  ref.jd.forEach((jd, i) => {
    const p = sampleSeries(series, jd).pos, r = ref.state[i];
    max = Math.max(max, Math.hypot(p[0] - r[0], p[1] - r[1], p[2] - r[2]));
  });
  out[k] = max;
}
console.log(JSON.stringify(out));
