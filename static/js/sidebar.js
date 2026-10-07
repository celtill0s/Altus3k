// Barre latérale : filtres, recherche, liste des sommets, liste mobile.
import { escapeHtml, formatDate } from './util.js';
import { DIFFS, DIFF_COLORS, REGIONS, STATUSES } from './config.js';
import { PEAKS, doneSet, passesBaseFilter, peakState, session, state, wishSet } from './store.js';
import { lazyBackground, peakImageStyle } from './peak-image.js';
import { flyToVisible, map, markers, syncMarkers } from './map.js';
import { openPeakPanel, toggleDone } from './panel.js';
import { refreshMine } from './mine.js';

// Bouton mobile « liste » : juste l'emoji (📋, ou ✕ quand la liste est ouverte) ; le nombre de
// sommets affichés reste disponible en infobulle et pour les lecteurs d'écran.
// Mobile : la liste s'affiche en plein écran (onglet « Liste », voir tabs.js).
export function setMobileListOpen(open) {
  document.getElementById('app').classList.toggle('mobile-list-open', open);
}

function closeMobileList() {
  setMobileListOpen(false);
}

function renderChips(containerId, values, activeCheckFn, labelFn, colorFn, onToggle) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  values.forEach(v => {
    const chip = document.createElement('div');
    chip.className = 'chip' + (activeCheckFn(v) ? ' active' : '');
    const dotColor = colorFn ? colorFn(v) : null;
    chip.innerHTML = (dotColor ? `<span class="dot" style="background:${dotColor}"></span>` : '') + labelFn(v);
    chip.onclick = () => { onToggle(v); };
    el.appendChild(chip);
  });
}

function toggleRegion(v) {
  if (state.regions.has(v)) state.regions.delete(v); else state.regions.add(v);
  if (state.regions.size === 0) REGIONS.forEach(r => state.regions.add(r));
  renderChipsAll();
  syncMarkers();
  renderList();
}

function toggleDifficulty(v) {
  if (state.difficulties.has(v)) state.difficulties.delete(v); else state.difficulties.add(v);
  if (state.difficulties.size === 0) DIFFS.forEach(d => state.difficulties.add(d));
  renderChipsAll();
  syncMarkers();
  renderList();
}

function setStatus(v) {
  state.status = v;
  renderChipsAll();
  renderList();
}

export function updateDoneCount() {
  const el = document.getElementById('count');
  const visible = PEAKS.filter(passesBaseFilter);
  const shown = `${visible.length} sommet${visible.length > 1 ? 's' : ''} affiché${visible.length > 1 ? 's' : ''} sur ${PEAKS.length}`;
  const doneCount = PEAKS.filter(p => doneSet.has(p.id)).length;
  // Invité : pas d'espace personnel, donc pas de « faits ».
  el.textContent = session.space === null ? shown : `${shown} · ${doneCount} fait${doneCount > 1 ? 's' : ''} au total`;
}

export function createPeakItem(p, { activity, onSelect } = {}) {
  const item = document.createElement('div');
  const st = peakState(p);
  item.className = `peak-item state-${st}` + (st === 'done' ? ' is-done' : '');
  const color = DIFF_COLORS[p.difficulty];
  const extras = [];
  if (st === 'done') extras.push(p.done_date ? `✓ Fait le ${formatDate(p.done_date)}` : '✓ Fait');
  if (st === 'wish') extras.push('★ Envie');
  const photos = (p.photos || []).length;
  if (photos) extras.push(`${photos} photo${photos > 1 ? 's' : ''}`);
  if (p.gpx) extras.push('GPX');
  const badge = { done: '&#10003;', wish: '&#9733;' }[st];
  item.innerHTML = `
    <div class="peak-thumb">${badge ? `<span class="peak-thumb-badge ${st}">${badge}</span>` : ''}</div>
    <div class="peak-info">
      <div class="row1">
        <span class="name">${escapeHtml(p.name)}</span>
        <input type="checkbox" class="done-check" ${st === 'done' ? 'checked' : ''} ${session.canEdit ? '' : 'disabled'} title="Marquer comme fait" aria-label="Marquer ${escapeHtml(p.name)} comme fait" />
      </div>
      <div class="meta">
        <span class="alt">${escapeHtml(p.altitude_m)} m</span>
        ${activity
          ? `<span class="activity-grade"><span class="badge" style="background:${escapeHtml(activity.color)}">${escapeHtml(activity.label)}</span></span>`
          : `<span class="badge" style="background:${color}">${escapeHtml(p.difficulty)}</span>`}
        <span class="massif">${escapeHtml(p.massif || p.region)}</span>
      </div>
      ${extras.length ? `<div class="extras">${escapeHtml(extras.join(' · '))}</div>` : ''}
    </div>
  `;
  lazyBackground(item.querySelector('.peak-thumb'), peakImageStyle(p, 64, 64));
  item.querySelector('.done-check').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDone(p);
  });
  item.addEventListener('click', onSelect || (() => showPeak(p)));
  return item;
}

export function renderList() {
  const list = document.getElementById('list');
  list.innerHTML = '';
  // En filtre "Tous" : sommets faits d'abord, puis les envies, puis le reste ; altitude
  // décroissante dans chaque groupe. Avec un filtre de statut, l'altitude seule suffit.
  const groupByState = state.status === 'Tous';
  const rank = p => (doneSet.has(p.id) ? 2 : wishSet.has(p.id) ? 1 : 0);
  const filtered = PEAKS.filter(passesBaseFilter).sort((a, b) => {
    if (groupByState && rank(a) !== rank(b)) return rank(b) - rank(a);
    return b.altitude_m - a.altitude_m;
  });
  updateDoneCount();

  filtered.forEach(p => {
    list.appendChild(createPeakItem(p));
  });
  refreshMine();
}

// Centre la carte sur un sommet et ouvre sa fiche (depuis la liste ou Mes 3000).
export function showPeak(p) {
  const m = markers.get(p.id);
  closeMobileList(); // sur mobile, sélectionner un sommet referme la liste plein écran
  flyToVisible([p.lat, p.lon], 12, { duration: 0.6 });
  // Attend la fin de l'animation pour positionner correctement le panneau à sa première ouverture
  // (il est en coordonnées écran, pas géographiques, donc pas suivi automatiquement pendant le flyTo).
  map.once('moveend', () => openPeakPanel(p, m.marker));
}

export function renderChipsAll() {
  renderChips('region-chips', REGIONS, v => state.regions.has(v), v => v, null, toggleRegion);
  renderChips('diff-chips', DIFFS, v => state.difficulties.has(v), v => v, v => DIFF_COLORS[v], toggleDifficulty);
  renderChips('status-chips', STATUSES, v => state.status === v, v => v, null, setStatus);
}

export function initSidebar() {
  document.getElementById('search').addEventListener('input', e => {
    state.query = e.target.value.trim();
    syncMarkers();
    renderList();
  });
}
