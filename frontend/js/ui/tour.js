import { t, onLanguage } from '../i18n.js';

// The user moves between real screens; calculations are never started by the tour.
export function mountTour(show) {
  let start = Boolean(window.lmpStartTour);
  delete window.lmpStartTour;
  try { start = start || sessionStorage.getItem('lmp.tour') === 'start'; sessionStorage.removeItem('lmp.tour'); } catch { /* storage unavailable */ }
  if (!start) return;
  const steps = [
    ['explorer', 'Scegli un sito', 'Seleziona un sito noto o un punto sulla Luna. Poi passa alla pianificazione.'],
    ['planning', 'Configura la missione', 'Imposta data e durata, quindi premi Calcola geometria. Il calcolo parte solo quando lo richiedi.'],
    ['planning', 'Esplora i risultati', 'Dopo il calcolo, osserva Sole, Terra e potenza. Usa la timeline e Play in testata per esplorare il tempo.'],
  ];
  let index = 0;
  const box = document.createElement('aside');
  box.className = 'tour'; box.setAttribute('aria-label', t('Tutorial'));
  document.body.append(box);
  function render() {
    const [, title, description] = steps[index];
    box.innerHTML = `<small>${t('Tutorial')} · ${index + 1}/${steps.length}</small><h2>${t(title)}</h2><p>${t(description)}</p><div class="tour-actions"><button class="btn" data-back ${index === 0 ? 'disabled' : ''}>${t('Indietro')}</button><button class="btn primary" data-next>${t(index === steps.length - 1 ? 'Termina' : 'Avanti')}</button><button class="btn" data-close>${t('Chiudi tutorial')}</button></div>`;
    box.querySelector('[data-back]').onclick = () => navigate(index - 1);
    box.querySelector('[data-next]').onclick = () => index === steps.length - 1 ? close() : navigate(index + 1);
    box.querySelector('[data-close]').onclick = close;
  }
  function navigate(next) { index = next; show(steps[index][0]); render(); }
  function close() { box.remove(); unsubscribe(); }
  const unsubscribe = onLanguage(render);
  render();
}
