// Briques communes à toutes les cartes (carte à pied, vues crampons / ski / raquettes) :
// marqueurs regroupés ou séparés (bouton œil), « me localiser », légende repliable, et placement
// des contrôles selon l'écran.
import { clusterIcon } from './icons.js';

const isMobile = () => window.matchMedia('(max-width: 760px)').matches;

// Groupe de clustering : au dézoom, les sommets proches se regroupent sous un seul logo montagne
// avec le nombre de sommets du secteur ; au zoom, ils se séparent en marqueurs individuels.
export function createPeakClusterGroup() {
  return L.markerClusterGroup({
    iconCreateFunction: (cluster) => clusterIcon(cluster.getChildCount()),
    maxClusterRadius: 28, // rayon réduit (défaut Leaflet : 80) : se sépare beaucoup plus tôt au zoom
    disableClusteringAtZoom: 11, // au-delà, toujours des marqueurs individuels
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false
  });
}

/**
 * Marqueurs d'une carte, affichés soit regroupés (cluster), soit tous à leur position réelle
 * (bouton œil). show() ajoute ou retire un marqueur (filtres) dans le calque actif ; le mode
 * « séparé » choisi reste actif quand les filtres changent.
 */
export function createMarkerLayers(map) {
  const cluster = createPeakClusterGroup().addTo(map);
  const individual = L.layerGroup();
  const shown = new Set();
  const listeners = [];
  let separated = false;
  const active = () => (separated ? individual : cluster);

  function setSeparated(value) {
    if (value === separated) return;
    shown.forEach(marker => active().removeLayer(marker));
    map.removeLayer(active());
    separated = value;
    active().addTo(map);
    shown.forEach(marker => active().addLayer(marker));
    listeners.forEach(listener => listener(separated));
  }

  return {
    show(marker, visible = true) {
      if (visible && !shown.has(marker)) { shown.add(marker); active().addLayer(marker); }
      if (!visible && shown.has(marker)) { shown.delete(marker); active().removeLayer(marker); }
    },
    remove(marker) { this.show(marker, false); },
    // Après un changement d'icône (fait / envie) : les bulles de regroupement suivent.
    refresh() { cluster.refreshClusters(); },
    isSeparated: () => separated,
    toggleSeparated() { setSeparated(!separated); },
    onSeparatedChange(listener) { listeners.push(listener); }
  };
}

// Icône d'œil : ouvert = « voir tous les sommets » (regroupés pour l'instant), barré =
// « regrouper » (tous affichés pour l'instant). L'icône montre ce que fait le clic.
const EYE_OPEN = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />';
const EYE_CLOSED = '<path d="M9.9 4.2A10 10 0 0 1 12 4c6.4 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.6 8 10 8a9.6 9.6 0 0 0 5.4-1.6" /><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2" /><path d="m2 2 20 20" />';

function controlButton(className, onClick) {
  const control = L.control({ position: 'topright' });
  control.onAdd = () => {
    const div = L.DomUtil.create('div', `leaflet-bar ${className}`);
    const btn = L.DomUtil.create('a', '', div);
    btn.href = '#';
    btn.setAttribute('role', 'button');
    control.button = btn;
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.on(btn, 'click', L.DomEvent.stop).on(btn, 'click', onClick);
    control.onButton?.(btn);
    return div;
  };
  return control;
}

// Bouton « Voir tous / Regrouper » : bascule les sommets affichés vers leur vraie position
// individuelle, sans toucher au zoom ni à la vue.
export function createSeparateAllControl(layers) {
  const control = controlButton('separate-all-control', () => layers.toggleSeparated());
  const update = () => {
    const btn = control.button;
    if (!btn) return;
    const separated = layers.isSeparated();
    const label = separated ? 'Regrouper les sommets par zone' : 'Voir tous les sommets, à leur position réelle';
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${separated ? EYE_CLOSED : EYE_OPEN}</svg>`;
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.classList.toggle('active', separated);
  };
  control.onButton = update;
  layers.onSeparatedChange(update);
  return control;
}

// Bouton « me localiser » : position GPS en direct (point bleu + cercle de précision). Chaque
// carte a le sien, avec son propre suivi.
export function createLocateControl(map) {
  let watching = false;
  let centeredOnce = false;
  let dot = null;
  let accuracyCircle = null;

  const control = controlButton('locate-control', () => (watching ? stop() : start()));
  const setActive = (active) => {
    watching = active;
    const btn = control.button;
    btn.classList.toggle('active', active);
    btn.title = active ? 'Arrêter la localisation' : 'Me localiser';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-pressed', String(active));
  };
  control.onButton = (btn) => {
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8" fill="none"/></svg>';
    setActive(false);
  };

  function clearPosition() {
    if (dot) map.removeLayer(dot);
    if (accuracyCircle) map.removeLayer(accuracyCircle);
    dot = accuracyCircle = null;
  }
  function start() {
    centeredOnce = false;
    setActive(true);
    // watch : la position suit le déplacement (sur le sentier) ; haute précision = GPS.
    map.locate({ watch: true, enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  }
  function stop() {
    map.stopLocate();
    clearPosition();
    setActive(false);
  }
  map.on('locationfound', (e) => {
    if (!watching) return;
    if (!dot) {
      accuracyCircle = L.circle(e.latlng, { radius: e.accuracy, color: '#1a73e8', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
      dot = L.circleMarker(e.latlng, { radius: 7, color: '#fff', weight: 2, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(map);
      dot.bindTooltip('Vous êtes ici');
    } else {
      dot.setLatLng(e.latlng);
      accuracyCircle.setLatLng(e.latlng).setRadius(e.accuracy);
    }
    // Recentre une seule fois : ensuite l'utilisateur doit pouvoir explorer la carte librement.
    if (!centeredOnce) {
      centeredOnce = true;
      const zoom = Math.max(map.getZoom(), 14);
      map.setView(control.visibleCenter ? control.visibleCenter(e.latlng, zoom) : e.latlng, zoom);
    }
  });
  map.on('locationerror', (e) => {
    if (!watching) return;
    stop();
    // code 1 = refusé, 2 = position indisponible, 3 = délai dépassé (API Geolocation)
    const reasons = {
      1: "l'accès à la position a été refusé (autorise-le dans les réglages du navigateur pour ce site)",
      2: 'position indisponible (GPS désactivé ?)',
      3: 'le GPS met trop de temps à répondre, réessaie à découvert'
    };
    alert(`Localisation impossible : ${reasons[e.code] || e.message}.`);
  });
  return control;
}

// Légende repliable : un titre (« Cotation randonnée ▾ ») qui déplie le détail au clic.
export function createCollapsibleLegend({ title, bodyHtml, open = false, id = '', onBody }) {
  const control = L.control({ position: 'bottomright' });
  control.onAdd = () => {
    const div = L.DomUtil.create('div', 'map-legend');
    if (id) div.id = id;
    const bodyId = `${id || 'legend'}-body-${L.Util.stamp(control)}`;
    div.innerHTML = `
      <button type="button" class="legend-toggle" aria-expanded="${open}" aria-controls="${bodyId}">
        <span class="legend-title">${title}</span><span class="legend-arrow" aria-hidden="true">▾</span>
      </button>
      <div class="legend-body" id="${bodyId}" ${open ? '' : 'hidden'}>${bodyHtml}</div>`;
    const toggle = div.querySelector('.legend-toggle');
    const body = div.querySelector('.legend-body');
    const setOpen = (value) => {
      body.hidden = !value;
      toggle.setAttribute('aria-expanded', String(value));
      div.classList.toggle('open', value);
    };
    setOpen(open);
    toggle.addEventListener('click', () => setOpen(body.hidden));
    onBody?.(body);
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  return control;
}

/**
 * Place les contrôles d'une carte selon l'écran, et les replace au redimensionnement :
 * - ordinateur : zoom, œil et localisation à droite sous la barre d'outils, légende en bas à droite ;
 * - mobile : zoom, œil et localisation en colonne en bas à gauche (à portée de pouce), légende en
 *   haut à gauche sous la barre d'outils.
 */
export function placeControls(map, { zoom, eye, locate, legend }) {
  const apply = () => {
    const mobile = isMobile();
    // Ordre d'appel : en haut à droite, chaque contrôle s'ajoute dessous (localiser, zoom, œil) ;
    // en bas à gauche, chacun s'ajoute au-dessus (zoom, œil, localiser de haut en bas).
    const order = mobile ? [locate, eye, zoom] : [locate, zoom, eye];
    order.forEach(control => control?.setPosition(mobile ? 'bottomleft' : 'topright'));
    legend?.setPosition(mobile ? 'topleft' : 'bottomright');
  };
  apply();
  window.addEventListener('resize', apply);
}
