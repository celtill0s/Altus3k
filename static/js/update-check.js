// Nouvelle version du site : un onglet ou une appli restés ouverts (téléphone surtout) gardent
// l'ancienne page et ses fichiers tant qu'on ne recharge pas. Au retour au premier plan, et toutes
// les 30 minutes, on compare l'empreinte des fichiers de cette page (/v/<empreinte>/ dans l'URL de
// ce module) à celle du serveur (/healthz) ; si elle a changé, un bandeau propose de recharger.
const CURRENT = new URL(import.meta.url).pathname.match(/^\/v\/([^/]+)\//)?.[1];
const CHECK_EVERY_MS = 30 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;
let lastCheck = 0;
let shown = false;

function showBanner() {
  shown = true;
  const bar = document.createElement('div');
  bar.id = 'update-banner';
  bar.setAttribute('role', 'status');
  bar.innerHTML = 'Nouvelle version d’Altus disponible <button type="button">Recharger</button>';
  bar.querySelector('button').addEventListener('click', () => location.reload());
  document.body.appendChild(bar);
}

async function check() {
  if (!CURRENT || shown || Date.now() - lastCheck < MIN_GAP_MS) return;
  lastCheck = Date.now();
  try {
    const res = await fetch('/healthz', { cache: 'no-store' });
    const { version } = await res.json();
    if (version && version !== CURRENT) showBanner();
  } catch { /* hors ligne : on réessaiera au prochain retour au premier plan */ }
}

export function initUpdateCheck() {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) check(); }); // page restaurée du cache
  window.addEventListener('focus', check);
  setInterval(check, CHECK_EVERY_MS);
}
