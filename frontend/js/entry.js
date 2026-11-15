// Home leggera: nessun modulo 3D o richiesta API prima dell'ingresso esplicito.
import { initLanguage, t } from './i18n.js';

initLanguage();
const pages = new Set(['solar', 'explorer', 'planning', 'compare', 'analysis', 'education']);
let entering = false;
document.getElementById('start-tour').addEventListener('click', () => { window.lmpStartTour = true; try { sessionStorage.setItem('lmp.tour', 'start'); } catch { /* storage unavailable */ } });
function route() {
  const page = location.hash.slice(1);
  if (entering && !pages.has(page)) {
    // Il tasto Indietro torna alla home liberando il ciclo e i renderer dell'app.
    location.reload();
    return;
  }
  if (pages.has(page) && !entering) {
    entering = true;
    document.body.classList.remove('home-active');
    document.getElementById('loading').hidden = false;
    import('./main.js').catch(() => {
      document.getElementById('ld-msg').textContent = t('Caricamento non riuscito. Ricarica la pagina per riprovare.');
    });
  } else if (page === 'home-guide' && !entering) {
    const guide = document.querySelector('#home-guide details');
    guide.open = true;
    guide.querySelector('summary').focus({ preventScroll: true });
    guide.scrollIntoView({ block: 'start' });
  }
}
window.addEventListener('hashchange', route);
route();
