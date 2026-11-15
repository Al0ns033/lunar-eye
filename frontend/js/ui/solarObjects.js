// Caricamento su richiesta; errori indipendenti dai pianeti, retry manuale.
import { api } from '../api.js';
import { state } from '../state.js';
import { sampleSeries, jdToMs } from '../science/ephem.js';
import { t, onLanguage } from '../i18n.js';

export function mountObjects(root, scene) {
  const records = new Map();
  const catalog = state.meta.objects || {};
  const names = { asteroid: 'Asteroidi', comet: 'Comete', spacecraft: 'Sonde' };
  for (const kind of Object.keys(names)) {
    const title = document.createElement('h4');
    title.textContent = t(names[kind]); root.append(title);
    onLanguage(() => { title.textContent = t(names[kind]); });
    for (const [key, obj] of Object.entries(catalog).filter(([, o]) => o.kind === kind)) {
      const row = document.createElement('label'); row.className = 'row';
      const check = document.createElement('input'); check.type = 'checkbox';
      const text = document.createElement('span'); text.textContent = obj.name;
      const status = document.createElement('small'); status.setAttribute('aria-live', 'polite');
      row.append(check, text, status); root.append(row);
      const r = { key, obj, check, status, series: null, pending: false, failed: false };
      records.set(key, r);
      check.onchange = () => { r.failed = false; scene.setObjectVisible(key, false); };
    }
  }
  function status(r, key) { r.status.textContent = key ? t(key) : ''; r.statusKey = key; }
  onLanguage(() => { for (const r of records.values()) status(r, r.statusKey); });
  return (jd) => {
    for (const r of records.values()) {
      if (!r.check.checked) continue;
      const value = r.series && sampleSeries(r.series, jd);
      scene.setObjectVisible(r.key, Boolean(value));
      if (value) { scene.updateMarker(r.key, value.pos); status(r, ''); continue; }
      if (r.pending || r.failed) continue;
      r.pending = true; status(r, 'Caricamento…');
      api.object(r.key, new Date(jdToMs(jd)).toISOString()).then((series) => {
        r.series = series; status(r, '');
        if (!scene.objs[r.key]) scene.addMarker(r.key, r.obj.name, r.obj.kind);
      }).catch(() => {
        r.failed = true; status(r, 'Dati non disponibili: disattiva e riattiva per riprovare.');
      }).finally(() => { r.pending = false; });
    }
  };
}
