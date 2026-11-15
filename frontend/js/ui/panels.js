import { t, onLanguage } from '../i18n.js';

const selector = '.panel, .card, .split > .form, .chart-box, .events, .edu-3d, .mission-hud, .mission-timeline';
let preferences = {};
try { preferences = JSON.parse(localStorage.getItem('lmp.panels')) || {}; } catch { /* storage unavailable */ }

export function mountPanels(root, page) {
  if (page === 'explorer' || root.dataset.panelsMounted) return;
  root.dataset.panelsMounted = 'true';
  let scheduled = false, menu, signature;
  const observer = new MutationObserver((records) => {
    if (records.some((r) => [...r.addedNodes].some((n) => n.nodeType === 1 && (n.matches(selector) || n.querySelector(selector)))
      || (r.target.matches?.(selector) && !r.target.querySelector(':scope > .managed-close')))) schedule();
  });
  function schedule() { if (!scheduled) { scheduled = true; queueMicrotask(refresh); } }
  function save() { try { localStorage.setItem('lmp.panels', JSON.stringify(preferences)); } catch { /* storage unavailable */ } }
  function set(panel, visible) {
    preferences[panel.dataset.panelKey] = !visible; panel.hidden = !visible; save();
    signature = null; refresh();
    if (!visible) { menu.open = true; menu.querySelector('summary').focus(); }
    window.dispatchEvent(new Event('resize'));
  }
  function refresh() {
    scheduled = false; observer.disconnect();
    if (!menu?.isConnected) {
      menu = document.createElement('details'); menu.className = 'panel-menu no-print';
      const summary = document.createElement('summary'); menu.append(summary, document.createElement('div'));
      root.append(menu); signature = null;
    }
    menu.querySelector('summary').textContent = t('Pannelli');
    const panels = [...root.querySelectorAll(page === 'education' ? '.edu-hero' : selector)];
    panels.forEach((panel, i) => {
      panel.dataset.panelKey ||= `${page}-${panel.id || i}`;
      panel.id ||= `panel-${panel.dataset.panelKey}`;
      panel.classList.add('managed-panel');
      panel.hidden = preferences[panel.dataset.panelKey] === true;
      const heading = panel.querySelector('h3, h4, b, [data-panel-heading]');
      const canvas = panel.querySelector('canvas');
      const titles = { 'pl-chart': 'Grafico missione', 'cmp-bar': 'Luce e visibilità', 'cmp-line': 'Elevazione del Sole', 'an-power': 'Energia', 'an-horizon': 'Orizzonte locale' };
      const fallback = titles[canvas?.id] || (panel.matches('.edu-3d, .edu-hero') ? 'Esperimento 3D' : panel.matches('.edu-3d') ? 'Vista 3D' : page === 'compare' && i === 0 ? 'Configurazione confronto' : 'Dettagli');
      const title = panel.dataset.panelTitle ? t(panel.dataset.panelTitle) : heading?.textContent.trim() || t(fallback);
      panel.dataset.panelLabel = title;
      if (!panel.querySelector(':scope > .managed-close')) {
        const close = document.createElement('button'); close.type = 'button';
        close.className = 'panel-close managed-close no-print'; close.textContent = '×';
        close.onclick = () => set(panel, false); panel.append(close);
      }
      panel.querySelector(':scope > .managed-close').setAttribute('aria-label', `${t('Nascondi pannello')}: ${title}`);
    });
    const next = panels.map((p) => `${p.id}:${p.dataset.panelLabel}:${p.hidden}`).join('|');
    if (next !== signature) {
      signature = next; const list = menu.querySelector('div'); list.replaceChildren();
      panels.forEach((panel) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'btn';
        button.textContent = panel.dataset.panelLabel; button.setAttribute('aria-controls', panel.id);
        button.setAttribute('aria-expanded', String(!panel.hidden));
        button.onclick = () => { set(panel, panel.hidden); };
        list.append(button);
      });
    }
    observer.observe(root, {childList: true, subtree: true});
  }
  onLanguage(schedule); refresh();
}

export function mountSidebar() {
  const button = document.getElementById('sidebar-toggle');
  const tooltip = document.createElement('div');
  tooltip.id = 'nav-tooltip'; tooltip.className = 'nav-tooltip';
  tooltip.setAttribute('role', 'tooltip'); tooltip.hidden = true;
  document.body.append(tooltip);
  const hideTooltip = () => { tooltip.hidden = true; };
  document.querySelectorAll('nav [data-page]').forEach((item) => {
    const reveal = () => {
      if (!document.body.classList.contains('sidebar-compact')) return;
      const rect = item.getBoundingClientRect();
      tooltip.textContent = item.getAttribute('aria-label');
      tooltip.style.top = `${rect.top + rect.height / 2}px`;
      tooltip.style.left = `${rect.right + 12}px`;
      tooltip.hidden = false;
    };
    item.setAttribute('aria-describedby', tooltip.id);
    item.addEventListener('pointerenter', reveal);
    item.addEventListener('focus', reveal);
    for (const event of ['pointerleave', 'blur', 'click']) item.addEventListener(event, hideTooltip);
  });
  window.addEventListener('resize', hideTooltip);
  document.querySelector('.sidebar').addEventListener('scroll', hideTooltip);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideTooltip(); });
  let compact = window.matchMedia('(max-width: 900px)').matches;
  try { const saved = localStorage.getItem('lmp.sidebar'); if (saved) compact = saved === 'compact'; } catch { /* storage unavailable */ }
  function refresh() {
    hideTooltip();
    document.body.classList.toggle('sidebar-compact', compact);
    document.body.classList.toggle('sidebar-expanded', !compact);
    button.setAttribute('aria-expanded', String(!compact));
    button.setAttribute('aria-label', t(compact ? 'Espandi menu' : 'Comprimi menu'));
    button.title = button.getAttribute('aria-label'); button.textContent = compact ? '»' : '«';
    document.querySelectorAll('nav [data-page]').forEach((item) => {
      const label = item.querySelector('span').textContent;
      item.title = label; item.setAttribute('aria-label', label);
    });
  }
  button.onclick = () => { compact = !compact; refresh(); try { localStorage.setItem('lmp.sidebar', compact ? 'compact' : 'expanded'); } catch { /* storage unavailable */ } window.dispatchEvent(new Event('resize')); };
  onLanguage(refresh); refresh();
}
