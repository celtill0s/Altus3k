// Panneau flottant de détail d'un sommet (fait, commentaire, médias, GPX).
import { escapeHtml, formatDate, safeUrl, todayIso } from './util.js';
import { DIFF_COLORS, DIFF_CRITERIA } from './config.js';
import { ACTIVITY_PEAKS, doneSet, session, PEAKS, wishSet } from './store.js';
import { apiDelete, apiPost, peakApiBase } from './api.js';
import { map, refreshPeakMarker, removePeakMarker } from './map.js';
import { bindPhotosRow, photosRowHtml } from './photos.js';
import { bindGpxRow, clearGpxForPeak, gpxRowHtml, gpxStats, hideOnMap } from './gpx.js';
import { catalogImage, peakImageStyle } from './peak-image.js';
import { renderList } from './sidebar.js';
import { openPeakDialog } from './custom-peak.js';

// Zone de commentaire : hauteur qui suit le contenu (dans la limite COMMENT_EXPANDED_MAX),
// repliée à COMMENT_COLLAPSED_MAX avec un "Voir plus" tant que le texte n'a pas été déplié.
const COMMENT_COLLAPSED_MAX = 160;
const COMMENT_EXPANDED_MAX = 360;

function autosizeCommentTextarea(el, expanded) {
  el.style.height = 'auto';
  const naturalHeight = el.scrollHeight;
  const overflowsCollapsed = naturalHeight > COMMENT_COLLAPSED_MAX + 2;
  const cap = expanded ? COMMENT_EXPANDED_MAX : COMMENT_COLLAPSED_MAX;
  el.style.height = Math.min(naturalHeight, cap) + 'px';
  el.style.overflowY = naturalHeight > cap ? 'auto' : 'hidden';
  return overflowsCollapsed;
}

// Carte qui accueille le panneau : la carte à pied, ou celle d'une vue crampons / ski / raquettes
// (le panneau est déplacé dans son conteneur). list : liste qui recouvre la gauche de cette carte.
// (Renseigné dans initPeakPanel : map.js importe ce module, la carte n'existe pas encore ici.)
let host = { map: null, list: null, activity: null };

// Bloc « itinéraire » d'une vue d'activité : cotation en badge, voie, remarques, lien vers le topo.
// info : { grade, color, route, note, url, linkLabel } (voir mountain-map-view.js).
function activityBlockHtml(info) {
  const url = safeUrl(info.url);
  return `<div class="pop-activity">
    <div class="pop-activity-head">
      <span class="badge" style="background:${escapeHtml(info.color)}">${escapeHtml(info.grade)}</span>
      ${info.route ? `<span class="pop-activity-route">${escapeHtml(info.route)}</span>` : ''}
    </div>
    ${info.note ? `<p>${escapeHtml(info.note)}</p>` : ''}
    ${url ? `<a class="pop-activity-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(info.linkLabel || 'Ouvrir le topo')} ↗</a>` : ''}
  </div>`;
}

// popupHtml() reste le nom historique, mais son HTML est injecté dans #peak-panel-body
// (panneau flottant déplaçable) et non plus dans une popup Leaflet.
function popupHtml(p, activity) {
  // Dans une vue d'activité, la cotation randonnée (T2/T3/T4) et l'accès à pied laissent la place
  // au bloc itinéraire ; les notes et liens d'un sommet ajouté à la main restent affichés.
  const hiking = !activity && !p.activity;
  const showNotes = hiking || p.custom;
  const color = DIFF_COLORS[p.difficulty] || '#555';
  const checked = doneSet.has(p.id) ? 'checked' : '';
  const name = escapeHtml(p.name);
  const diff = escapeHtml(p.difficulty);
  const notes = escapeHtml(p.notes);
  const source = escapeHtml(p.source);
  const sourceUrl = safeUrl(p.source_url);
  const links = (p.links || []).map(safeUrl).filter(Boolean);
  const linksHtml = links.length
    ? `<ul class="pop-links">${links.map(u => `<li><a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">${escapeHtml(u)}</a></li>`).join('')}</ul>`
    : '';
  return `
    <div class="pop-banner" style='${peakImageStyle(p, 280, 110, 1.5).replace(/'/g, '&#39;')}'></div>
    ${imageCreditHtml(p)}
    <h3>${name}${p.custom ? ' <span class="pop-custom-tag">ajout perso</span>' : ''}</h3>
    <div class="pop-meta">${escapeHtml(p.altitude_m)} m &middot; ${p.massif ? `${escapeHtml(p.massif)} &middot; ` : ''}${escapeHtml(p.region)} &middot; <a href="https://www.google.com/maps?q=${Number(p.lat)},${Number(p.lon)}" target="_blank" rel="noopener noreferrer">Voir sur Google Maps</a></div>
    ${hiking ? `<span class="badge" style="background:${color}">${diff}</span>` : ''}
    <div class="pop-figures">${figuresHtml(p)}</div>
    ${activity ? activityBlockHtml(activity) : ''}
    ${showNotes ? `<div class="pop-notes">${notes}</div>
    ${linksHtml}` : ''}
    ${hiking && source ? `<div class="pop-source">Source : ${source}</div>` : ''}
    ${hiking ? `<button type="button" class="cotation-detail-toggle">Détail de la cotation ${diff}</button>
    <div class="cotation-detail-body">
      <div class="criteria"><strong>Critère général ${diff}</strong> (échelle CAS/SAC) : ${DIFF_CRITERIA[p.difficulty] || ''}</div>
      <div class="why"><strong>Pourquoi ce sommet est coté ${diff}</strong> : ${notes}</div>
      <div class="source-link">Source : ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${source}</a>` : source}. Voir <code>sources.md</code> dans le dépôt pour la méthodologie complète.</div>
    </div>` : ''}
    <div class="pop-actions">
      <label class="pop-done-row pop-action ${checked ? 'on' : ''}"><input type="checkbox" class="pop-done-checkbox" ${checked} ${session.canEdit ? '' : 'disabled'}/> Sommet fait</label>
      <button type="button" class="pop-action pop-wish-btn ${wishSet.has(p.id) ? 'on' : ''}" aria-pressed="${wishSet.has(p.id)}" ${session.canEdit ? '' : 'disabled'}>${wishSet.has(p.id) ? '&#9733;' : '&#9734;'} Envie</button>
    </div>
    <label class="pop-date-row" ${checked ? '' : 'hidden'}>Date d'ascension
      <input type="date" class="pop-done-date" value="${escapeHtml(p.done_date || '')}" max="${todayIso()}" ${session.canEdit ? '' : 'disabled'} />
    </label>
    <div class="pop-comment-row">
      <label>${session.viewingOther ? `Commentaire de ${escapeHtml(session.space)}` : 'Mon commentaire'}</label>
      <textarea class="pop-comment-input" placeholder="Notes perso : conditions, ressenti, conseils…" ${session.canEdit ? '' : 'readonly'}>${escapeHtml(p.comment || '')}</textarea>
      <button type="button" class="pop-comment-toggle" hidden>Voir plus</button>
      <div class="pop-comment-status"></div>
    </div>
    ${photosRowHtml(p)}
    ${gpxRowHtml(p)}
    ${p.custom && session.canEdit ? `<div class="pop-custom-actions">
      <button type="button" class="btn-secondary pop-custom-edit">Modifier ce sommet</button>
      <button type="button" class="btn-danger pop-custom-delete">Supprimer ce sommet</button>
    </div>` : ''}
  `;
}

// Crédit de la photo du catalogue (Wikimedia Commons, licences libres CC BY / BY-SA / CC0).
function imageCreditHtml(p) {
  const img = catalogImage(p);
  if (!img) return '';
  const source = safeUrl(img.source);
  const text = `Photo : ${escapeHtml(img.author)} · ${escapeHtml(img.license)}`;
  return `<div class="pop-banner-credit">${source ? `<a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">${text}</a>` : text}</div>`;
}

// Rangée de chiffres sous le titre : altitude, D+ et distance (si trace GPX), date d'ascension.
function figuresHtml(p) {
  const figs = [[`${p.altitude_m} m`, 'altitude']];
  const g = gpxStats(p.id);
  if (g && g.hasElevation) figs.push([`+${Math.round(g.elevGainM)} m`, 'dénivelé']);
  if (g && g.distanceKm > 0) figs.push([`${g.distanceKm.toFixed(1)} km`, 'distance']);
  if (doneSet.has(p.id) && p.done_date) figs.push([formatDate(p.done_date), 'fait le']);
  return figs.map(([v, k]) => `<div class="fig"><strong>${escapeHtml(v)}</strong><span>${escapeHtml(k)}</span></div>`).join('');
}

// Met à jour, dans le panneau ouvert, ce qui dépend de l'état fait/envie (sans régénérer le
// panneau : un commentaire en cours d'édition serait perdu).
function refreshPanelState(p) {
  if (activePeakId !== p.id) return;
  const root = document.getElementById('peak-panel-body');
  const done = doneSet.has(p.id), wish = wishSet.has(p.id);
  const doneEl = root.querySelector('.pop-done-checkbox');
  doneEl.checked = done;
  doneEl.closest('.pop-action').classList.toggle('on', done);
  const wishBtn = root.querySelector('.pop-wish-btn');
  wishBtn.classList.toggle('on', wish);
  wishBtn.setAttribute('aria-pressed', String(wish));
  wishBtn.innerHTML = `${wish ? '&#9733;' : '&#9734;'} Envie`;
  root.querySelector('.pop-date-row').hidden = !done;
  root.querySelector('.pop-done-date').value = p.done_date || '';
  root.querySelector('.pop-figures').innerHTML = figuresHtml(p);
}

function setDone(p, done, date) {
  if (done) doneSet.add(p.id); else doneSet.delete(p.id);
  if (done && date) p.done_date = date; else delete p.done_date;
  refreshPeakMarker(p);
  renderList();
  refreshPanelState(p);
  document.dispatchEvent(new Event('peak-state-change'));
}

function saveFailed() {
  alert("Impossible d'enregistrer sur le serveur — vérifie la connexion et réessaie.");
}

// Cocher « fait » enregistre la date du jour (modifiable ensuite dans la fiche).
export function toggleDone(p) {
  if (!session.canEdit) return; // invité, ou admin consultant l'espace d'un autre
  const wasDone = doneSet.has(p.id), oldDate = p.done_date;
  const date = wasDone ? null : todayIso();
  setDone(p, !wasDone, date);
  apiPost(`${peakApiBase(p)}/done`, wasDone ? { done: false } : { done: true, date }).catch(() => {
    setDone(p, wasDone, oldDate); // échec réseau : on annule l'affichage optimiste
    saveFailed();
  });
}

function changeDoneDate(p, date) {
  if (!session.canEdit || !doneSet.has(p.id)) return;
  const oldDate = p.done_date;
  setDone(p, true, date || null);
  apiPost(`${peakApiBase(p)}/done`, { done: true, date: date || null }).catch(() => {
    setDone(p, true, oldDate);
    saveFailed();
  });
}

function setWish(p, wish) {
  if (wish) wishSet.add(p.id); else wishSet.delete(p.id);
  refreshPeakMarker(p);
  renderList();
  refreshPanelState(p);
  document.dispatchEvent(new Event('peak-state-change'));
}

export function toggleWish(p) {
  if (!session.canEdit) return;
  const was = wishSet.has(p.id);
  setWish(p, !was);
  apiPost(`${peakApiBase(p)}/wish`, { wish: !was }).catch(() => {
    setWish(p, was);
    saveFailed();
  });
}

// Les statistiques GPX arrivent après coup (traces chargées en arrière-plan).
export function refreshPanelFigures(p) {
  if (activePeakId !== p.id) return;
  document.querySelector('#peak-panel-body .pop-figures').innerHTML = figuresHtml(p);
}

// --- Panneau flottant de détail d'un sommet (remplace la popup Leaflet ancrée au marqueur) ---
export let activePeakId = null;

function bindPanelContent(root, p) {
  const doneEl = root.querySelector('.pop-done-checkbox');
  if (doneEl) doneEl.addEventListener('change', () => toggleDone(p));
  root.querySelector('.pop-wish-btn').addEventListener('click', () => toggleWish(p));
  root.querySelector('.pop-done-date').addEventListener('change', (e) => changeDoneDate(p, e.target.value));
  const toggleBtn = root.querySelector('.cotation-detail-toggle');
  const toggleBody = root.querySelector('.cotation-detail-body');
  if (toggleBtn && toggleBody) {
    toggleBtn.addEventListener('click', () => {
      toggleBody.classList.toggle('open');
    });
  }
  const commentEl = root.querySelector('.pop-comment-input');
  const commentStatusEl = root.querySelector('.pop-comment-status');
  const commentToggleEl = root.querySelector('.pop-comment-toggle');
  if (commentEl) {
    let saveTimer = null;
    let lastSaved = commentEl.value.trim();
    let commentExpanded = false;
    const refreshCommentUI = () => {
      const overflowsCollapsed = autosizeCommentTextarea(commentEl, commentExpanded);
      if (commentToggleEl) {
        commentToggleEl.hidden = !overflowsCollapsed;
        commentToggleEl.textContent = commentExpanded ? 'Voir moins' : 'Voir plus';
      }
    };
    const saveComment = () => {
      clearTimeout(saveTimer);
      const text = commentEl.value.trim();
      if (text === lastSaved) return;
      lastSaved = text;
      p.comment = text;
      apiPost(`${peakApiBase(p)}/comment`, { comment: text })
        .then(() => { if (commentStatusEl) commentStatusEl.textContent = 'Enregistré sur le serveur.'; })
        .catch((err) => { if (commentStatusEl) commentStatusEl.textContent = `Échec de l'enregistrement (${err.message}).`; });
    };
    refreshCommentUI();
    commentEl.addEventListener('input', () => {
      if (!session.canEdit) return;
      if (commentStatusEl) commentStatusEl.textContent = '';
      refreshCommentUI();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveComment, 500);
    });
    commentEl.addEventListener('focus', () => {
      if (!commentExpanded) { commentExpanded = true; refreshCommentUI(); }
    });
    commentEl.addEventListener('blur', () => {
      if (session.canEdit) saveComment();
    });
    if (commentToggleEl) {
      commentToggleEl.addEventListener('click', () => {
        commentExpanded = !commentExpanded;
        refreshCommentUI();
      });
    }
  }
  bindPhotosRow(root, p);
  bindGpxRow(root, p);
  const deleteBtn = root.querySelector('.pop-custom-delete');
  if (deleteBtn) deleteBtn.addEventListener('click', () => deleteCustomPeak(p));
  const editBtn = root.querySelector('.pop-custom-edit');
  if (editBtn) editBtn.addEventListener('click', () => { closePeakPanel(); openPeakDialog(p); });
}

async function deleteCustomPeak(p) {
  if (!confirm(`Supprimer « ${p.name} » ainsi que ses photos, trace GPX et commentaire ?`)) return;
  try {
    await apiDelete(peakApiBase(p));
  } catch (err) {
    alert(`Suppression impossible (${err.message}).`);
    return;
  }
  removePeakMarker(p);
  clearGpxForPeak(p.id);
  [PEAKS, ACTIVITY_PEAKS].forEach(list => {
    const idx = list.indexOf(p);
    if (idx >= 0) list.splice(idx, 1);
  });
  document.dispatchEvent(new CustomEvent('peak-removed', { detail: p }));
  doneSet.delete(p.id);
  wishSet.delete(p.id);
  closePeakPanel();
  renderList();
}

// Recadre une valeur (position + taille) pour qu'elle tienne toujours entre `margin` et
// `containerSize - margin` — utilisé pour garantir qu'aucun coin du panneau ne sorte jamais
// de la zone carte, quels que soient la position du marqueur ou la taille du panneau.
function clampIntoRange(value, size, containerSize, margin, start = 0) {
  const minVal = start + margin;
  const maxVal = Math.max(minVal, containerSize - size - margin);
  return Math.min(Math.max(minVal, value), maxVal);
}

// Bord gauche utilisable : sur ordinateur, la liste (verre dépoli) recouvre le côté gauche de la
// carte, le panneau ne doit pas s'ouvrir ni se déplacer dessous.
function leftInset() {
  const list = host.list || document.getElementById('sidebar');
  return !list || window.matchMedia('(max-width: 760px)').matches ? 0 : list.offsetWidth;
}

const hostElement = () => host.map.getContainer();

// Bord haut utilisable : la barre d'outils (fixe, en haut) ne doit jamais recouvrir l'en-tête du
// panneau, sinon impossible de le déplacer ou de le fermer.
function topInset() {
  const toolbar = document.getElementById('map-toolbar');
  if (!toolbar) return 0;
  return Math.max(0, toolbar.getBoundingClientRect().bottom - hostElement().getBoundingClientRect().top);
}

// Position du panneau à sa toute première ouverture (ensuite il reste où l'utilisateur l'a
// laissé ou déplacé), toujours recadré pour tenir entièrement dans la carte :
// - mobile : au centre de l'écran (le doigt et le petit écran rendent le placement près du
//   marqueur peu pratique) ;
// - ordinateur : près du marqueur cliqué (au-dessus, légèrement à droite), jamais sous la liste.
function positionPanel(marker) {
  const panel = document.getElementById('peak-panel');
  const mapEl = hostElement();
  const margin = 8;
  const inset = leftInset();
  const mapW = mapEl.clientWidth, mapH = mapEl.clientHeight;
  const w = panel.offsetWidth, h = panel.offsetHeight;
  let left, top;
  if (window.matchMedia('(max-width: 760px)').matches || !marker) {
    left = inset + (mapW - inset - w) / 2;
    top = (mapH - h) / 2;
  } else {
    const pt = host.map.latLngToContainerPoint(marker.getLatLng());
    left = pt.x + 18;
    top = pt.y - h - 12;
  }
  panel.style.left = Math.round(clampIntoRange(left, w, mapW, margin, inset)) + 'px';
  panel.style.top = Math.round(clampIntoRange(top, h, mapH, margin, topInset())) + 'px';
}

// Filet de sécurité : si la fenêtre (ou le passage au layout mobile) redimensionne la carte
// après ouverture, on recadre le panneau déjà affiché dans les nouvelles limites.
function clampOpenPanelToMap() {
  const panel = document.getElementById('peak-panel');
  if (!panel || panel.hidden) return;
  const mapEl = hostElement();
  const margin = 8;
  panel.style.left = clampIntoRange(panel.offsetLeft, panel.offsetWidth, mapEl.clientWidth, margin, leftInset()) + 'px';
  panel.style.top = clampIntoRange(panel.offsetTop, panel.offsetHeight, mapEl.clientHeight, margin, topInset()) + 'px';
}
/**
 * Ouvre la fiche d'un sommet. options (vues d'activité) : { map, list, activity } — la carte qui
 * accueille le panneau, la liste qui recouvre sa gauche, et le bloc itinéraire à afficher.
 */
export function openPeakPanel(p, marker, options = {}) {
  const panel = document.getElementById('peak-panel');
  const body = document.getElementById('peak-panel-body');
  const target = { map: options.map || map, list: options.list || null, activity: options.activity || null };
  const moved = target.map !== host.map;
  if (moved) {
    host.map.off('resize', clampOpenPanelToMap);
    target.map.getContainer().append(panel);
    target.map.on('resize', clampOpenPanelToMap);
  }
  host = target;
  if (activePeakId === p.id && !panel.hidden && !moved) return; // déjà affiché : ne pas régénérer (édition en cours)
  const wasHidden = panel.hidden || moved;
  body.innerHTML = popupHtml(p, host.activity);
  activePeakId = p.id;
  panel.hidden = false; // avant bindPanelContent : la zone de commentaire mesure sa hauteur
  bindPanelContent(body, p);
  if (wasHidden) positionPanel(marker);
}

function closePeakPanel() {
  document.getElementById('peak-panel').hidden = true;
  activePeakId = null;
  hideOnMap();
}

export function initPeakPanel() {
  const panel = document.getElementById('peak-panel');
  const header = document.getElementById('peak-panel-header');
  document.getElementById('peak-panel-close').addEventListener('click', closePeakPanel);
  host.map = map;
  window.addEventListener('resize', clampOpenPanelToMap);
  map.on('resize', clampOpenPanelToMap);
  // Changement de vue (à pied ↔ ski…) : la fiche restait dans la carte qu'on quitte.
  document.addEventListener('mountain-view-change', closePeakPanel);

  // Le panneau est un enfant du conteneur Leaflet : sans ceci, tout clic/glisser dedans
  // (en-tête, mais aussi la zone de commentaire, la molette, etc.) remonte à la carte et
  // déclenche son propre panoramique/zoom en même temps que nos actions.
  L.DomEvent.disableClickPropagation(panel);
  L.DomEvent.disableScrollPropagation(panel);

  let drag = null;
  header.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#peak-panel-close')) return;
    e.stopPropagation();
    e.preventDefault();
    const mapEl = hostElement();
    drag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: panel.offsetLeft,
      startTop: panel.offsetTop,
      mapW: mapEl.clientWidth,
      mapH: mapEl.clientHeight,
      minTop: topInset()
    };
    header.classList.add('dragging');
    header.setPointerCapture(e.pointerId);
  });
  header.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const minLeft = leftInset();
    const maxLeft = Math.max(minLeft, drag.mapW - panel.offsetWidth);
    const maxTop = Math.max(drag.minTop, drag.mapH - panel.offsetHeight);
    panel.style.left = Math.min(Math.max(minLeft, drag.startLeft + dx), maxLeft) + 'px';
    panel.style.top = Math.min(Math.max(drag.minTop, drag.startTop + dy), maxTop) + 'px';
  });
  const endDrag = (e) => { drag = null; header.classList.remove('dragging'); if (e) e.stopPropagation(); };
  header.addEventListener('pointerup', endDrag);
  header.addEventListener('pointercancel', endDrag);
}
