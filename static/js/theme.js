// Thème clair / sombre, appliqué avant le premier affichage : chargé en <script> classique dans
// le <head> de chaque page (pas de flash clair au démarrage). « Automatique » suit le système
// (prefers-color-scheme) ; « Clair » / « Sombre » posent data-theme sur <html>. Le choix se fait
// dans ⚙ Paramètres › Apparence (js/settings.js), même clé de stockage.
(() => {
  let theme = null;
  try { theme = localStorage.getItem('altus.theme'); } catch { /* stockage indisponible */ }
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
})();
