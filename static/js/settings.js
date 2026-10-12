// Panneau ⚙ Paramètres (à droite) : compte (rempli par account.js), filtres d'affichage (puces
// rendues par sidebar.js), apparence (thème clair / sombre), fond de carte et calques (traces GPX,
// pentes).
import { BASE_LAYER_NAMES, getBaseLayer, isOverlayVisible, setBaseLayer, setOverlayVisible } from './map.js';
import { escapeHtml } from './util.js';

function renderBaseLayerOptions() {
  const container = document.getElementById('base-layer-options');
  const current = getBaseLayer();
  container.innerHTML = BASE_LAYER_NAMES.map(name => `
    <label class="settings-check"><input type="radio" name="base-layer" value="${escapeHtml(name)}"${name === current ? ' checked' : ''}> ${escapeHtml(name)}</label>`).join('');
  container.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', () => { if (input.checked) setBaseLayer(input.value); });
  });
}

// Thème : même clé que js/theme.js, qui l'applique avant l'affichage de chaque page.
const THEME_KEY = 'altus.theme';
const THEMES = [['auto', 'Automatique (comme le système)'], ['light', 'Clair'], ['dark', 'Sombre']];

function storedTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch { return 'auto'; }
}

function applyTheme(theme) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch { /* stockage indisponible : le choix vaut pour cette visite */ }
}

function renderThemeOptions() {
  const container = document.getElementById('theme-options');
  const current = storedTheme();
  container.innerHTML = THEMES.map(([value, label]) => `
    <label class="settings-check"><input type="radio" name="theme" value="${value}"${value === current ? ' checked' : ''}> ${label}</label>`).join('');
  container.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', () => { if (input.checked) applyTheme(input.value); });
  });
}

function bindOverlay(id, name) {
  const input = document.getElementById(id);
  input.checked = isOverlayVisible(name);
  input.addEventListener('change', () => setOverlayVisible(name, input.checked));
}

// Sur mobile, ce panneau est l'onglet « Profil » (plein écran) ; sur ordinateur, il s'ouvre par ⚙.
export function setSettingsOpen(open) {
  const openBtn = document.getElementById('settings-open');
  document.getElementById('settings-panel').hidden = !open;
  openBtn.setAttribute('aria-expanded', String(open));
  openBtn.classList.toggle('active', open);
}

export function initSettings() {
  const panel = document.getElementById('settings-panel');
  const setOpen = setSettingsOpen;
  document.getElementById('settings-close').addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => {
    // Échap ferme d'abord les fenêtres ouvertes par-dessus (mot de passe, utilisateurs…).
    if (e.key === 'Escape' && !panel.hidden && !document.querySelector('.modal:not([hidden]), #admin-view:not([hidden])')) setOpen(false);
  });
  renderThemeOptions();
  renderBaseLayerOptions();
  bindOverlay('overlay-gpx', 'gpx');
  bindOverlay('overlay-slopes', 'slopes');
}
