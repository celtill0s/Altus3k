// Carte Leaflet : fond, clusters, calques, contrôles, légende, marqueurs.
import { DIFF_COLORS, DIFF_LABELS, DIFFS } from './config.js';
import { PEAKS, passesBaseFilter, peakState } from './store.js';
import { MOUNTAIN_PATH, makeIcon } from './icons.js';
import { createCollapsibleLegend, createLocateControl, createMarkerLayers, createSeparateAllControl, placeControls } from './map-controls.js';
import { openPeakPanel } from './panel.js';

export const map = L.map('map', { zoomControl: true });

// Sur ordinateur, la liste (verre dépoli) recouvre la gauche de la carte : la zone vraiment
// visible est décalée vers la droite d'une demi-largeur de liste. Les recentrages en tiennent
// compte pour que le point visé tombe au milieu de ce qu'on voit, pas sous la liste.
// Valable pour toutes les cartes : chaque vue d'activité a aussi sa liste à gauche.
function hiddenLeftWidth(list) {
  return !list || window.matchMedia('(max-width: 760px)').matches ? 0 : list.offsetWidth;
}

export function visibleCenter(latlng, zoom, targetMap = map, list = document.getElementById('sidebar')) {
  const shift = hiddenLeftWidth(list) / 2;
  if (!shift) return L.latLng(latlng);
  return targetMap.unproject(targetMap.project(latlng, zoom).subtract([shift, 0]), zoom);
}

export function flyToVisible(latlng, zoom, options) {
  map.flyTo(visibleCenter(latlng, zoom), zoom, options);
}

map.setView(visibleCenter([44.8, 4.0], 6), 6);

// --- Fonds de carte ---
// IGN : flux WMTS public de la Géoplateforme (data.geopf.fr), gratuit et sans clé. Le SCAN 25
// (carte topo « randonnée ») n'y est pas : il exige une clé personnelle. Les tuiles IGN sont
// vides hors de France (versant espagnol des sommets frontaliers) : OSM reste proposé.
// crossOrigin : tuiles demandées en CORS (les deux serveurs l'autorisent), pour que le service
// worker puisse les garder en cache hors-ligne (une réponse opaque ne se met pas en cache).
const IGN_ATTRIBUTION = '&copy; <a href="https://www.ign.fr/">IGN</a> – Géoplateforme';
function ignLayer(layer, format, options) {
  return L.tileLayer(
    'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&STYLE=normal' +
    `&TILEMATRIXSET=PM&LAYER=${layer}&FORMAT=${format}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`,
    { maxZoom: 19, attribution: IGN_ATTRIBUTION, crossOrigin: true, ...options }
  );
}

// URL sans sous-domaine a/b/c : recommandée par OSM depuis leur passage au CDN.
function osmLayer(options) {
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    crossOrigin: true,
    ...options
  });
}

// Fond « Auto » : OSM tant qu'on voit tout un massif (plus lisible à petite échelle), Plan IGN
// dès qu'on zoome sur un secteur (relief, sentiers, courbes de niveau). Chaque couche n'affiche
// ses tuiles que dans sa plage de zoom : la bascule se fait toute seule. Les tuiles IGN étant
// opaques (blanches hors de France), pas de repli automatique sur OSM pour le versant espagnol
// ou italien : choisir « OpenStreetMap » à la main dans ce cas.
// Zoom 9 = premier niveau où l'échelle affiche « 20 km » (entre 42° et 46° de latitude, soit
// tous nos sommets) ; au zoom 8 elle affiche « 30 km ».
const IGN_FROM_ZOOM = 9;
const planIgnPath = ['GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png'];

const baseLayerFactories = {
  'Auto (OSM, puis IGN en zoomant)': () => L.layerGroup([
    osmLayer({ maxZoom: IGN_FROM_ZOOM - 1 }),
    ignLayer(...planIgnPath, { minZoom: IGN_FROM_ZOOM })
  ]),
  'Plan IGN': () => ignLayer(...planIgnPath),
  'Photos aériennes IGN': () => ignLayer('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg'),
  'OpenStreetMap': () => osmLayer()
};
const baseLayers = Object.fromEntries(Object.entries(baseLayerFactories).map(([name, create]) => [name, create()]));
const DEFAULT_BASE_LAYER = 'Auto (OSM, puis IGN en zoomant)';

// Surcouche IGN des pentes > 30° en montagne (zones avalancheuses potentielles) : servie
// jusqu'au zoom 17, agrandie au-delà.
export function createSlopesLayer(opacity = 0.55) {
  return ignLayer('GEOGRAPHICALGRIDSYSTEMS.SLOPES.MOUNTAIN', 'image/png', {
    maxNativeZoom: 17,
    opacity,
    zIndex: 10 // toujours au-dessus du fond, même après un changement de fond
  });
}
const slopesLayer = createSlopesLayer();

// Fond et calques choisis dans le panneau ⚙ (js/settings.js), mémorisés dans le navigateur
// (simple confort : sans stockage disponible, on retombe sur les valeurs par défaut).
const BASE_LAYER_KEY = 'summitfr.baseLayer';
const OVERLAYS_KEY = 'summitfr.overlays';
function readSetting(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeSetting(key, value) {
  try { localStorage.setItem(key, value); } catch { /* stockage indisponible */ }
}

export const BASE_LAYER_NAMES = Object.keys(baseLayers);
let currentBaseLayer = baseLayers[readSetting(BASE_LAYER_KEY)] ? readSetting(BASE_LAYER_KEY) : DEFAULT_BASE_LAYER;
baseLayers[currentBaseLayer].addTo(map);

export function getBaseLayer() {
  return currentBaseLayer;
}

export function createBaseLayer(name = currentBaseLayer) {
  return baseLayerFactories[name]?.();
}

const baseLayerListeners = [];
export function onBaseLayerChange(listener) {
  baseLayerListeners.push(listener);
}

export function setBaseLayer(name) {
  if (!baseLayers[name] || name === currentBaseLayer) return;
  map.removeLayer(baseLayers[currentBaseLayer]);
  baseLayers[name].addTo(map);
  currentBaseLayer = name;
  writeSetting(BASE_LAYER_KEY, name);
  baseLayerListeners.forEach(listener => listener(name));
}

// Marqueurs regroupés par secteur au dézoom, séparés au zoom ou via le bouton œil (voir
// map-controls.js). Les filtres (puces, recherche) ajoutent ou retirent les marqueurs de ce
// groupe, voir passesBaseFilter/syncMarkers.
const peakLayers = createMarkerLayers(map);

// Calque dédié aux traces GPX importées (itinéraires de rando par sommet).
export const gpxLayer = L.layerGroup();

// Surcouches activables dans le panneau ⚙ : traces GPX (affichées par défaut), pentes > 30°.
const overlays = { gpx: gpxLayer, slopes: slopesLayer };
const overlayState = { gpx: true, slopes: false, ...JSON.parse(readSetting(OVERLAYS_KEY) || '{}') };

export function isOverlayVisible(name) {
  return !!overlayState[name];
}

export function setOverlayVisible(name, visible) {
  overlayState[name] = visible;
  if (visible) overlays[name].addTo(map); else map.removeLayer(overlays[name]);
  writeSetting(OVERLAYS_KEY, JSON.stringify(overlayState));
}
Object.keys(overlays).forEach(name => { if (overlayState[name]) overlays[name].addTo(map); });

// Échelle métrique (km/m), en bas à gauche.
L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

export const markers = new Map(); // id -> {marker, data}

export function buildMarkers() {
  PEAKS.forEach(addPeakMarker);
}

function peakIcon(p) {
  return makeIcon(DIFF_COLORS[p.difficulty] || '#555', peakState(p), p.altitude_m);
}

export function addPeakMarker(p) {
  const marker = L.marker([p.lat, p.lon], { icon: peakIcon(p) });
  marker.on('click', () => openPeakPanel(p, marker));
  markers.set(p.id, { marker, data: p });
  return marker;
}

// Après un changement de statut, de cotation, d'altitude ou de position.
export function refreshPeakMarker(p) {
  const entry = markers.get(p.id);
  if (!entry) return;
  entry.marker.setIcon(peakIcon(p));
  entry.marker.setLatLng([p.lat, p.lon]);
  peakLayers.refresh();
}

export function removePeakMarker(p) {
  const entry = markers.get(p.id);
  if (!entry) return;
  peakLayers.remove(entry.marker);
  markers.delete(p.id);
}

export function syncMarkers() {
  markers.forEach(({ marker, data }) => peakLayers.show(marker, passesBaseFilter(data)));
}

// Légende (rappel des couleurs), repliée par défaut : juste « Cotation randonnée ▾ » ; un clic
// déplie le détail T2/T3/T4. En bas à droite sur ordinateur, en haut à gauche sur mobile (le
// bouton « Liste » occupe le bas à droite).
// Mini-marqueur (même dessin que sur la carte, en gris neutre) pour la légende des états.
function legendMarker(state) {
  const path = state === 'todo'
    ? `<path d="${MOUNTAIN_PATH}" fill="#fff" stroke="#6b7280" stroke-width="2.2" stroke-linejoin="round"/>`
    : `<path d="${MOUNTAIN_PATH}" fill="#6b7280" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>`;
  const badge = { done: '<span class="legend-badge">&#10003;</span>', wish: '<span class="legend-badge wish">&#9733;</span>' }[state] || '';
  return `<span class="legend-marker"><svg viewBox="0 0 24 24">${path}</svg>${badge}</span>`;
}

function legendBodyHtml() {
  return `
      ${DIFFS.map(d => `<div class="legend-row"><span class="legend-dot" style="background:${DIFF_COLORS[d]}"></span>${DIFF_LABELS[d]}</div>`).join('')}
      <div class="legend-states personal-only">
        <div class="legend-row">${legendMarker('done')}Sommet fait</div>
        <div class="legend-row">${legendMarker('wish')}Envie</div>
        <div class="legend-row">${legendMarker('todo')}À faire</div>
      </div>
  `;
}

const legend = createCollapsibleLegend({ id: 'legend', title: 'Cotation randonnée', bodyHtml: legendBodyHtml() });
legend.addTo(map);

// Contrôles : zoom (natif), œil, localisation ; placés selon l'écran (voir placeControls).
const separateAllControl = createSeparateAllControl(peakLayers).addTo(map);
const locateControl = 'geolocation' in navigator ? createLocateControl(map).addTo(map) : null;
if (locateControl) locateControl.visibleCenter = (latlng, zoom) => visibleCenter(latlng, zoom);
placeControls(map, { zoom: map.zoomControl, eye: separateAllControl, locate: locateControl, legend });
