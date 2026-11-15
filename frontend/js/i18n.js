import english from './locales/en.js';

const STORAGE_KEY = 'lmp.language';
let current = 'en';
try { if (localStorage.getItem(STORAGE_KEY) === 'it') current = 'it'; } catch { /* storage unavailable */ }
const listeners = new Set();
export const language = () => current;
export const locale = () => current === 'it' ? 'it-IT' : 'en-GB';

/** Italian source messages are keys; interpolate once so user text is never translated. */
export function t(source, params = {}) {
  const message = current === 'it' ? source : (english[source] ?? source);
  return message.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(params, key) ? (params[key]?.i18nKey ? t(params[key].i18nKey, params[key].params) : String(params[key])) : match);
}
export function localize(root = document) {
  const marked = root.matches?.('[data-i18n]') ? [root, ...root.querySelectorAll('[data-i18n]')] : root.querySelectorAll('[data-i18n]');
  marked.forEach((el) => { const value = t(el.dataset.i18n, JSON.parse(el.dataset.i18nParams || '{}')); if (el.textContent !== value) el.textContent = value; });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-label]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nLabel)); });
}
export function onLanguage(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function setLanguage(value) {
  if (!['en', 'it'].includes(value) || current === value) return;
  current = value;
  try { localStorage.setItem(STORAGE_KEY, value); } catch { /* storage unavailable */ }
  document.documentElement.lang = current;
  localize();
  syncLanguageControls();
  listeners.forEach((fn) => fn(current));
}
function syncLanguageControls() {
  document.querySelectorAll('[data-language]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.language === current));
  });
}
export function initLanguage() {
  document.documentElement.lang = current;
  localize();
  const observer = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType === 1) localize(node);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  syncLanguageControls();
  document.querySelectorAll('[data-language]').forEach((button) => {
    button.addEventListener('click', () => setLanguage(button.dataset.language));
  });
}
export const bodyName = (key) => t({ sun: 'Sole', mercury: 'Mercurio', venus: 'Venere', earth: 'Terra', moon: 'Luna', mars: 'Marte', jupiter: 'Giove', saturn: 'Saturno', uranus: 'Urano', neptune: 'Nettuno' }[key] || key);
// Only explicitly tagged built-in labels are translated. User names remain verbatim.
export const siteName = (site) => site.nameKey ? t(site.nameKey) : site.name;
export function terrainMethod(method) {
  const m = method.match(/^ray casting su LOLA LDEM_16, (\d+) campioni per azimut fino a ([\d.]+) km, osservatore a ([\d.]+) m dal suolo, curvatura lunare inclusa$/);
  return m ? t('ray casting su LOLA LDEM_16, {samples} campioni per azimut fino a {distance} km, osservatore a {height} m dal suolo, curvatura lunare inclusa', { samples: m[1], distance: m[2], height: m[3] }) : method;
}

export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Mark a dynamic message explicitly; parameters and custom names remain verbatim. */
export function message(source, params = {}) {
  return `<span data-i18n="${escapeHtml(source)}" data-i18n-params="${escapeHtml(JSON.stringify(params))}">${escapeHtml(t(source, params))}</span>`;
}

export class LocalizedError extends Error {
  constructor(source, params = {}) { super(t(source, params)); this.i18nKey = source; this.params = params; }
}
export const errorMessage = (error) => error.i18nKey ? { i18nKey: error.i18nKey, params: error.params } : (error.message || String(error));
