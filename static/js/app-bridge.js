// Intégration avec l'appli Android (android/) : inactive dans un navigateur normal. L'appli
// expose window.SommetsApp (pont natif), appelle window.__appBack() au bouton retour, et pose un
// bouton natif de déconnexion en haut à droite, que le site masque quand un écran le recouvre.

export const nativeApp = window.SommetsApp || null;

// Bouton retour Android : ferme d'abord ce qui est ouvert, du plus « au-dessus » au plus en
// dessous, en cliquant sur les boutons de fermeture existants. Renvoie false s'il n'y avait rien
// à fermer (l'appli quitte alors).
const CLOSABLES = [
  ['#photo-lightbox:not([hidden])', '#photo-lightbox-close'],
  ['#view-3d', '.view-3d-close'],
  ['#admin-view:not([hidden])', '#admin-view-close'],
  ['#settings-panel:not([hidden])', '#settings-close'],
  ['#peak-panel:not([hidden])', '#peak-panel-close'],
  ['#mine-view:not([hidden])', '#mine-close'],
  ['.summit-map-view.mobile-list-open:not([hidden])', '#tab-map'], // liste d'une vue → sa carte
  ['.summit-map-view:not([hidden])', '#mountain-view-open'], // vue crampons / ski / raquettes → carte à pied
  ['#app.mobile-list-open', '#tab-map'],
];

function appBack() {
  for (const [openSelector, closeSelector] of CLOSABLES) {
    const closeBtn = document.querySelector(openSelector) && document.querySelector(closeSelector);
    if (closeBtn) {
      closeBtn.click();
      return true;
    }
  }
  return false;
}

// Fichier généré par la page (trace GPX) → « Téléchargements » du téléphone : la vue web de
// l'appli ne sait pas enregistrer un lien blob: comme le ferait un navigateur.
export function saveFileNatively(filename, mimeType, text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return nativeApp.saveFile(filename, mimeType, btoa(binary));
}

// Bouton natif de déconnexion : masqué quand un écran plein écran le recouvre (vue 3D, visionneuse,
// liste, utilisateurs), dont les boutons sont eux aussi en haut. L'appli a sa propre surveillance
// (versions antérieures) : la liste ci-dessous la contient, pour ne pas se contredire.
const COVERING = '#view-3d, #photo-lightbox:not([hidden]), #admin-view:not([hidden]), #crampon-view:not([hidden]), #app.mobile-list-open';

function watchExitButton() {
  if (typeof nativeApp.setExitButtonVisible !== 'function') return;
  let last = null;
  const update = () => {
    const covered = !!document.querySelector(COVERING);
    if (covered !== last) {
      last = covered;
      nativeApp.setExitButtonVisible(!covered);
    }
  };
  new MutationObserver(update).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  update();
}

export function initAppBridge() {
  if (!nativeApp) return;
  window.__appBack = appBack;
  watchExitButton();
}
