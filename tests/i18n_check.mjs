// Run: node tests/i18n_check.mjs. No browser or network required.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { t, setLanguage, language, siteName, message, LocalizedError, errorMessage } from '../frontend/js/i18n.js';
import catalog from '../frontend/js/locales/en.js';

// Default, persistence failure, invalid choices, and language changes without touching user data.
assert.equal(language(), 'en');
assert.equal(t('Pianificazione'), 'Planning');
globalThis.document = { documentElement: {}, querySelectorAll: () => [] };
globalThis.localStorage = { setItem() { throw new Error('storage disabled'); } };
const custom = { name: 'Polo Sud' };
assert.equal(siteName(custom), 'Polo Sud');
assert.equal(siteName({ name: 'Polo Sud', nameKey: 'Polo Sud' }), 'South Pole');
const error = errorMessage(new LocalizedError('Parametri non validi. Controlla coordinate, date e durata.'));
assert.match(t('Backend non raggiungibile: {error}', { error }), /Invalid parameters/);
setLanguage('it');
assert.equal(t('Pianificazione'), 'Pianificazione');
assert.match(t('Backend non raggiungibile: {error}', { error }), /Parametri non validi/);
setLanguage('xx');
assert.equal(language(), 'it');
assert.equal(custom.name, 'Polo Sud');
assert.match(message('Backend non raggiungibile: {error}', { error: '<img src=x>' }), /&lt;img src=x&gt;/);

// Every translation preserves the same interpolation parameters.
for (const [source, english] of Object.entries(catalog)) {
  const params = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  assert.deepEqual(params(english), params(source), source);
}
// Every explicit markup key must exist (Italian characters are HTML-escaped in attributes).
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const base = new URL('../frontend/', import.meta.url);
const files = ['index.html', ...readdirSync(new URL('js/ui/', base)).filter((p) => p.endsWith('.js')).map((p) => 'js/ui/' + p), 'js/main.js'];
for (const file of files) {
  for (const m of readFileSync(new URL(file, base), 'utf8').matchAll(/data-i18n(?:-title|-label)?="([^"]+)"/g)) {
    const key = decode(m[1]);
    assert.ok(Object.hasOwn(catalog, key), `${file}: ${key}`);
  }
}
console.log(`IT/EN: default, state, errors, escaping, ${Object.keys(catalog).length} catalog entries and markup coverage OK`);
