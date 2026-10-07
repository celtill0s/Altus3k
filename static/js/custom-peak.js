// Sommets ajoutés à la main (visibles uniquement dans l'espace de l'utilisateur) : formulaire,
// puis marqueur déplaçable sur la carte à valider. Sert à la création comme à la modification.
import { DIFF_COLORS } from './config.js';
import { ACTIVITY_PEAKS, PEAKS, session } from './store.js';
import { apiPost, peakApiBase } from './api.js';
import { MOUNTAIN_PATH } from './icons.js';
import { addPeakMarker, map, markers, refreshPeakMarker, syncMarkers, visibleCenter } from './map.js';
import { openPeakPanel } from './panel.js';
import { renderList } from './sidebar.js';
import { getActiveMountainMapView } from './mountain-map-view.js';

let editing = null; // sommet en cours de modification (null : création)
let placement = null; // { fields, marker }
let activityView = null;
const ACTIVITY_LABELS = { crampon: 'crampons + piolet', ski: 'ski', snowshoe: 'raquettes' };
const HIKING_LABELS = ['T2 · Randonnée montagne', 'T3 · Randonnée exigeante', 'T4 · Randonnée alpine'];
const ACTIVITY_DIFFICULTIES = ['Modérée', 'Soutenue', 'Très exigeante'];

function placementIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div class="placing-icon">
      <span class="placing-arrow up">&#9650;</span>
      <span class="placing-arrow down">&#9660;</span>
      <span class="placing-arrow left">&#9664;</span>
      <span class="placing-arrow right">&#9654;</span>
      <svg viewBox="0 0 24 24" class="placing-peak"><path d="${MOUNTAIN_PATH}" fill="${color}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>
    </div>`,
    iconSize: [72, 72],
    iconAnchor: [36, 36]
  });
}

function readForm() {
  const val = id => document.getElementById(id).value.trim();
  return {
    name: val('cp-name'),
    altitude_m: Number(val('cp-altitude')),
    difficulty: val('cp-difficulty'),
    region: val('cp-region'),
    massif: val('cp-massif'),
    notes: val('cp-notes'),
    links: val('cp-links').split(/\s+/).filter(Boolean)
  };
}

function fillForm(p) {
  const set = (id, value) => { document.getElementById(id).value = value ?? ''; };
  set('cp-name', p.name);
  set('cp-altitude', p.altitude_m);
  set('cp-difficulty', p.difficulty);
  set('cp-region', p.region);
  set('cp-massif', p.massif);
  set('cp-lat', p.lat);
  set('cp-lon', p.lon);
  set('cp-notes', p.notes);
  set('cp-links', (p.links || []).join('\n'));
  set('cp-activity-grade', p.activity_grade);
}

function readCoords() {
  const lat = document.getElementById('cp-lat').value.trim();
  const lon = document.getElementById('cp-lon').value.trim();
  if (!lat && !lon) return null;
  if (!lat || !lon) return 'Renseignez la latitude ET la longitude, ou aucune des deux.';
  return L.latLng(Number(lat), Number(lon));
}

function startPlacement(fields, coords) {
  const targetMap = activityView?.map || map;
  const start = coords || targetMap.getCenter();
  if (coords) {
    const zoom = Math.max(targetMap.getZoom(), 13);
    targetMap.setView(activityView ? coords : visibleCenter(coords, zoom), zoom);
  }
  const marker = L.marker(start, {
    icon: placementIcon(DIFF_COLORS[fields.difficulty] || '#555'),
    draggable: true,
    autoPan: true,
    zIndexOffset: 1000
  }).addTo(targetMap);
  placement = { fields, marker, map: targetMap };
  const bar = document.getElementById('placement-bar');
  targetMap.getContainer().parentElement.append(bar);
  document.body.classList.toggle('activity-placing', Boolean(activityView));
  document.getElementById('placement-name').textContent = fields.name;
  document.getElementById('placement-status').textContent = '';
  document.getElementById('placement-bar').hidden = false;
  targetMap.on('click', moveMarkerToClick);
}

function moveMarkerToClick(e) {
  if (placement) placement.marker.setLatLng(e.latlng);
}

function endPlacement() {
  if (!placement) return;
  placement.map.off('click', moveMarkerToClick);
  placement.map.removeLayer(placement.marker);
  placement = null;
  editing = null;
  document.getElementById('placement-bar').hidden = true;
  document.getElementById('map').append(document.getElementById('placement-bar'));
  document.body.classList.remove('activity-placing');
  activityView = null;
}

async function savePeak(body) {
  if (!editing) {
    const targetView = activityView;
    const peak = await apiPost('/api/peaks', body);
    if (peak.activity) {
      ACTIVITY_PEAKS.push(peak);
      targetView.addPeak(peak);
      return peak;
    }
    PEAKS.push(peak);
    addPeakMarker(peak);
    syncMarkers();
    return peak;
  }
  // Même objet conservé (et même id) : liste, marqueur, photos et GPX restent rattachés.
  const targetView = activityView;
  const peak = Object.assign(editing, await apiPost(peakApiBase(editing), body));
  if (peak.activity) targetView.updatePeak(peak); else refreshPeakMarker(peak);
  return peak;
}

async function confirmPlacement() {
  if (!placement) return;
  const btn = document.getElementById('placement-confirm');
  const status = document.getElementById('placement-status');
  const { lat, lng } = placement.marker.getLatLng().wrap();
  btn.disabled = true;
  try {
    const peak = await savePeak({ ...placement.fields, lat, lon: lng });
    endPlacement();
    renderList();
    if (!peak.activity) openPeakPanel(peak, markers.get(peak.id).marker);
  } catch (err) {
    status.textContent = `Échec : ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

export function openPeakDialog(peak) {
  if (!session.canEdit || placement) return;
  editing = peak;
  // Sommet d'une vue d'activité (création dans la vue ouverte, ou modification d'un sommet
  // ajouté depuis cette vue) : formulaire, placement et marqueur se font dans cette vue.
  activityView = !peak || peak.activity ? getActiveMountainMapView() : null;
  if (peak?.activity && activityView?.activity !== peak.activity) return;
  document.getElementById('custom-peak-form').reset();
  if (peak) fillForm(peak);
  const label = activityView ? ` · ${ACTIVITY_LABELS[activityView.activity]}` : '';
  document.getElementById('custom-peak-title').textContent = `${peak ? 'Modifier le sommet' : 'Ajouter un sommet'}${label}`;
  const labels = activityView ? ACTIVITY_DIFFICULTIES : HIKING_LABELS;
  [...document.getElementById('cp-difficulty').options].forEach((option, index) => { option.textContent = labels[index]; });
  document.getElementById('cp-activity-grade-field').hidden = !activityView;
  document.getElementById('cp-activity-grade').placeholder = activityView ?
    { crampon: 'F, PD, AD…', ski: '2.3, 3.1…', snowshoe: 'R1, R2…' }[activityView.activity] : '';
  document.getElementById('cp-status').textContent = '';
  document.getElementById('custom-peak-dialog').hidden = false;
  const focusTarget = window.matchMedia('(min-width: 761px) and (pointer: fine)').matches ? 'cp-name' : 'custom-peak-form';
  document.getElementById(focusTarget).focus({ preventScroll: true });
}

function closeDialog() {
  document.getElementById('custom-peak-dialog').hidden = true;
  if (!placement) editing = null;
}

export function initCustomPeak() {
  document.addEventListener('mountain-view-change', () => {
    endPlacement();
    closeDialog();
    activityView = null;
  });
  document.getElementById('custom-peak-open').addEventListener('click', () => openPeakDialog(null));
  document.getElementById('cp-cancel').addEventListener('click', closeDialog);
  document.getElementById('custom-peak-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fields = readForm();
    if (activityView) {
      fields.activity = activityView.activity;
      fields.activity_grade = document.getElementById('cp-activity-grade').value.trim();
    }
    const status = document.getElementById('cp-status');
    const coords = readCoords();
    if (typeof coords === 'string') {
      status.textContent = coords;
      return;
    }
    const badLink = fields.links.find(u => !/^https?:\/\//i.test(u));
    if (badLink) {
      status.textContent = `Lien invalide : ${badLink} (doit commencer par http:// ou https://)`;
      return;
    }
    const sameName = p => p !== editing && p.name.toLowerCase() === fields.name.toLowerCase();
    if ([...PEAKS, ...ACTIVITY_PEAKS].some(sameName)) {
      status.textContent = 'Un sommet porte déjà ce nom.';
      return;
    }
    const peak = editing;
    closeDialog();
    editing = peak;
    document.getElementById('app').classList.remove('mobile-list-open');
    startPlacement(fields, coords);
  });
  const bar = document.getElementById('placement-bar');
  L.DomEvent.disableClickPropagation(bar);
  document.getElementById('placement-confirm').addEventListener('click', confirmPlacement);
  document.getElementById('placement-cancel').addEventListener('click', endPlacement);
}
