// Vues d'activité (crampons + piolet, ski, raquettes) : une carte plein écran avec sa liste à
// gauche (recherche, filtre par cotation, avertissements de sécurité), les mêmes contrôles que la
// carte à pied et la même fiche de sommet, complétée d'un bloc « itinéraire ».
import { escapeHtml } from './util.js';
import { createBaseLayer, createSlopesLayer, map as baseMap, onBaseLayerChange, visibleCenter } from './map.js';
import { createCollapsibleLegend, createLocateControl, createMarkerLayers, createSeparateAllControl, placeControls } from './map-controls.js';
import { makeIcon } from './icons.js';
import { createPeakItem } from './sidebar.js';
import { ACTIVITY_PEAKS, peakState } from './store.js';
import { openPeakPanel } from './panel.js';

let activeView = null;

export const WINTER_WARNINGS = [
  'DVA, pelle et sonde obligatoires pour chaque participant, et savoir s’en servir.',
  'Consulter le bulletin d’estimation du risque d’avalanche (BERA) de Météo-France avant chaque sortie.',
  'Les topos ne garantissent pas les conditions : enneigement, stabilité du manteau et passages en crampons changent d’un jour à l’autre.'
];

// Pentes > 30° plus transparentes que sur la carte à pied : affichées par défaut ici, elles ne
// doivent pas masquer les marqueurs ni les noms.
const SLOPES_OPACITY = 0.4;
const DIFF_VARS = { T2: 'var(--t2)', T3: 'var(--t3)', T4: 'var(--t4)' };
const WARNING_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3z" /><path d="M12 10v5M12 18v.01" /></svg>';

export function getActiveMountainMapView() {
  return activeView;
}

// Itinéraire d'un sommet ajouté à la main dans une vue d'activité.
function customInfo(peak) {
  return {
    grade: peak.activity_grade || 'Non coté',
    color: DIFF_VARS[peak.difficulty] || 'var(--activity-unrated)',
    url: (peak.links || [])[0]
  };
}

// Avertissements repliables : ouverts tant qu'on n'a pas cliqué « J'ai compris » (mémorisé dans
// le navigateur) ; ensuite, seul le titre reste visible en rappel.
function warningsElement(activity, warnings) {
  const key = `altus.warningsRead.${activity}`;
  let read = false;
  try { read = localStorage.getItem(key) === '1'; } catch { /* stockage indisponible */ }
  const details = document.createElement('details');
  details.className = 'summit-map-warning';
  details.setAttribute('role', 'note');
  details.open = !read;
  details.innerHTML = `
    <summary>${WARNING_ICON}<span>Sécurité · à lire avant de partir</span></summary>
    <ul>${warnings.map(text => `<li>${escapeHtml(text)}</li>`).join('')}</ul>
    <button type="button" class="summit-map-warning-ok">J’ai compris</button>`;
  details.querySelector('.summit-map-warning-ok').addEventListener('click', () => {
    details.open = false;
    try { localStorage.setItem(key, '1'); } catch { /* stockage indisponible */ }
  });
  return details;
}

// Boutons du sélecteur de vues : un seul actif à la fois (aria-expanded : pour ceux qui ouvrent
// une vue d'activité).
function setButtonActive(button, active) {
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
  if (button.id !== 'mountain-view-open') button.setAttribute('aria-expanded', String(active));
}

// Cotation et itinéraire d'un champ « ski » / « snowshoe » du catalogue ({ grade, route, note, url }).
export function routeInfo(route, color, linkLabel) {
  return { ...route, color, linkLabel };
}

/**
 * info(peak) → { grade, label?, color, route, note, url, linkLabel } : cotation et itinéraire du
 * sommet pour cette activité (label : texte du badge de la liste, grade par défaut).
 * legend : [[couleur, libellé], …], sert aussi aux puces de filtre de la liste.
 */
export function initMountainMapView({ viewId, mapId, listId, openButtonId, getPeaks, info, title, legend = [], warnings = [], slopes = false }) {
  const view = document.getElementById(viewId);
  const list = document.getElementById(listId);
  const openButton = document.getElementById(openButtonId);
  const mountainButton = document.getElementById('mountain-view-open');
  const activity = viewId.replace('-view', '');
  const infoFor = peak => (peak.activity ? customInfo(peak) : info(peak));
  const peaksForView = () => [...getPeaks(), ...ACTIVITY_PEAKS.filter(peak => peak.activity === activity)]
    .sort((first, second) => second.altitude_m - first.altitude_m);
  const filter = { query: '', hidden: new Set() };
  const matches = peak => !filter.hidden.has(infoFor(peak).color) &&
    (!filter.query || `${peak.name} ${peak.massif}`.toLowerCase().includes(filter.query));
  let map = null;
  let layers = null;
  let items = null;
  let count = null;
  const markersById = new Map();
  const icon = peak => makeIcon(infoFor(peak).color, peakState(peak), peak.altitude_m);

  function showPeak(peak) {
    const marker = markersById.get(peak.id);
    const zoom = Math.max(map.getZoom(), 12);
    map.setView(visibleCenter(marker.getLatLng(), zoom, map, list), zoom, { animate: false });
    openPeakPanel(peak, marker, { map, list, activity: infoFor(peak) });
  }

  function renderItems() {
    const peaks = peaksForView();
    const shown = peaks.filter(matches);
    count.textContent = `${shown.length === peaks.length ? peaks.length : `${shown.length} / ${peaks.length}`} sommets · ${title}`;
    items.replaceChildren(...shown.map(peak => {
      const { grade, label, color } = infoFor(peak);
      return createPeakItem(peak, {
        activity: { label: label || grade, color },
        onSelect: () => {
          view.classList.remove('mobile-list-open');
          showPeak(peak);
        }
      });
    }));
    peaks.forEach(peak => {
      const marker = markersById.get(peak.id);
      if (marker) layers.show(marker, matches(peak));
    });
  }

  // En-tête de la liste, construit une fois : compteur, sécurité, recherche, puces de cotation.
  function buildListHeader() {
    count = document.createElement('h3');
    count.className = 'summit-map-list-count';
    const tools = document.createElement('div');
    tools.className = 'summit-map-filters';
    tools.innerHTML = `
      <input type="search" class="summit-map-search" placeholder="Rechercher un sommet, un massif…" aria-label="Rechercher dans les sommets ${escapeHtml(title)}">
      <div class="summit-map-chips" role="group" aria-label="Filtrer par cotation">
        ${legend.map(([color, label]) => `<button type="button" class="summit-map-chip" aria-pressed="true" data-color="${escapeHtml(color)}"><i class="difficulty-key" style="background:${escapeHtml(color)}"></i>${escapeHtml(label)}</button>`).join('')}
      </div>`;
    tools.querySelector('input').addEventListener('input', (event) => {
      filter.query = event.target.value.trim().toLowerCase();
      renderItems();
    });
    tools.querySelectorAll('.summit-map-chip').forEach(chip => chip.addEventListener('click', () => {
      const on = filter.hidden.has(chip.dataset.color);
      if (on) filter.hidden.delete(chip.dataset.color); else filter.hidden.add(chip.dataset.color);
      chip.setAttribute('aria-pressed', String(on));
      renderItems();
    }));
    items = document.createElement('div');
    items.className = 'summit-map-items';
    list.replaceChildren(count, ...(warnings.length ? [warningsElement(activity, warnings)] : []), tools, items);
  }

  function addPeak(peak, select = true) {
    const marker = L.marker([peak.lat, peak.lon], { icon: icon(peak) })
      .bindTooltip(escapeHtml(peak.name), { direction: 'top', offset: [0, -28] });
    marker.on('click', () => openPeakPanel(peak, marker, { map, list, activity: infoFor(peak) }));
    markersById.set(peak.id, marker);
    layers.show(marker, matches(peak));
    if (select) {
      renderItems();
      showPeak(peak);
    }
  }

  // Après modification d'un sommet ajouté dans cette vue : position, icône, liste, fiche.
  function updatePeak(peak) {
    markersById.get(peak.id)?.setLatLng([peak.lat, peak.lon]).setIcon(icon(peak));
    layers.refresh();
    renderItems();
    showPeak(peak);
  }

  function createMap() {
    map = L.map(mapId, { zoomControl: false, scrollWheelZoom: true });
    let baseLayer = createBaseLayer().addTo(map);
    onBaseLayerChange(name => {
      map.removeLayer(baseLayer);
      baseLayer = createBaseLayer(name).addTo(map);
    });
    const slopesLayer = createSlopesLayer(SLOPES_OPACITY);
    if (slopes) slopesLayer.addTo(map);
    layers = createMarkerLayers(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
    const legendControl = createCollapsibleLegend({
      title: `Cotation ${title}`,
      open: !window.matchMedia('(max-width: 760px)').matches,
      bodyHtml: legend.map(([color, label]) =>
        `<div class="legend-row"><span class="legend-dot" style="background:${escapeHtml(color)}"></span>${escapeHtml(label)}</div>`).join('') +
        `<label class="summit-map-slopes"><input type="checkbox" ${slopes ? 'checked' : ''}> Pentes &gt; 30°</label>`,
      onBody: body => body.querySelector('input').addEventListener('change', (event) => {
        if (event.target.checked) slopesLayer.addTo(map); else map.removeLayer(slopesLayer);
      })
    }).addTo(map);
    const zoom = L.control.zoom().addTo(map);
    const eye = createSeparateAllControl(layers).addTo(map);
    const locate = 'geolocation' in navigator ? createLocateControl(map).addTo(map) : null;
    if (locate) locate.visibleCenter = (latlng, z) => visibleCenter(latlng, z, map, list);
    placeControls(map, { zoom, eye, locate, legend: legendControl });
    buildListHeader();
    peaksForView().forEach(peak => addPeak(peak, false));
    renderItems();
  }

  function close() {
    if (view.hidden) return;
    document.dispatchEvent(new Event('mountain-view-change'));
    activeView = null;
    const listOpen = view.classList.contains('mobile-list-open');
    view.hidden = true;
    setButtonActive(openButton, false);
    setButtonActive(mountainButton, true);
    document.body.classList.remove('activity-map-open');
    document.getElementById('app').classList.toggle('mobile-list-open', listOpen);
    baseMap.setView(map.getCenter(), map.getZoom(), { animate: false });
  }

  function open() {
    // Centre, zoom et liste ouverte (mobile) repris de la vue affichée jusqu'ici.
    const previous = activeView;
    const fromMap = previous ? previous.map : baseMap;
    const center = fromMap.getCenter();
    const zoom = fromMap.getZoom();
    const listOpen = previous
      ? previous.view.classList.contains('mobile-list-open')
      : document.getElementById('app').classList.contains('mobile-list-open');
    document.dispatchEvent(new Event('mountain-view-change'));
    document.querySelectorAll('.summit-map-view').forEach((otherView) => {
      if (otherView === view) return;
      otherView.hidden = true;
      const otherButton = document.querySelector(`[aria-controls="${otherView.id}"]`);
      if (otherButton) setButtonActive(otherButton, false);
    });
    setButtonActive(mountainButton, false);
    document.body.classList.add('activity-map-open');
    document.getElementById('app').classList.remove('mobile-list-open');
    view.classList.toggle('mobile-list-open', listOpen);
    view.hidden = false;
    setButtonActive(openButton, true);
    if (!map) createMap();
    map.invalidateSize();
    map.setView(center, zoom, { animate: false });
    activeView = { activity, map, addPeak, updatePeak, view };
  }

  document.addEventListener('peak-state-change', () => {
    if (!map) return;
    peaksForView().forEach(peak => markersById.get(peak.id)?.setIcon(icon(peak)));
    layers.refresh();
    renderItems();
  });
  document.addEventListener('peak-removed', ({ detail: peak }) => {
    const marker = markersById.get(peak.id);
    if (!marker) return;
    layers.remove(marker);
    markersById.delete(peak.id);
    renderItems();
  });

  openButton.setAttribute('aria-controls', viewId);
  setButtonActive(openButton, false);
  openButton.addEventListener('click', open);
  mountainButton.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !view.hidden && !document.querySelector('.modal:not([hidden])')) close();
  });
}
