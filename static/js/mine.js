// « Mes 3000 » : progression sur le catalogue (anneau X/45, par massif), ascensions et envies
// (dépliables ; un clic sur un sommet l'affiche sur la carte).
// Les sommets ajoutés à la main ne comptent pas dans les 45, ils sont seulement mentionnés.
import { REGIONS } from './config.js';
import { PEAKS, doneSet, session, wishSet } from './store.js';
import { escapeHtml, formatDate } from './util.js';
import { showPeak } from './sidebar.js';

const fmt = n => n.toLocaleString('fr-FR');

function ringSvg(done, total) {
  const r = 52, c = 2 * Math.PI * r;
  const ratio = total ? done / total : 0;
  return `
    <svg class="mine-ring" viewBox="0 0 128 128" aria-hidden="true">
      <circle cx="64" cy="64" r="${r}" fill="none" stroke="rgba(27,58,44,.12)" stroke-width="12" />
      <circle cx="64" cy="64" r="${r}" fill="none" stroke="#1b3a2c" stroke-width="12" stroke-linecap="round"
        stroke-dasharray="${(c * ratio).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 64 64)" />
      <text x="64" y="62" text-anchor="middle" class="mine-ring-count">${done}/${total}</text>
      <text x="64" y="82" text-anchor="middle" class="mine-ring-pct">${Math.round(ratio * 100)} %</text>
    </svg>`;
}

// Ligne d'un sommet dans les listes dépliables : un clic l'affiche sur la carte.
function peakRow(p, detail) {
  return `<button type="button" class="mine-peak" data-id="${escapeHtml(p.id)}">
    <span class="mine-peak-name">${escapeHtml(p.name)}</span><span class="mine-peak-detail">${escapeHtml(detail)}</span>
  </button>`;
}

// Bloc dépliable (<details>) : résumé toujours visible, liste des sommets au dépliage.
function foldHtml(key, icon, value, label, rows) {
  return `<details class="mine-stat mine-fold" data-key="${key}">
    <summary><span class="mine-stat-icon">${icon}</span><div><strong>${value}</strong><span>${label}</span></div></summary>
    <div class="mine-fold-body">${rows || '<p class="mine-empty">Aucun sommet pour l\'instant.</p>'}</div>
  </details>`;
}

function mineHtml() {
  if (session.space === null) return '<p class="mine-empty">Connecte-toi pour suivre ta progression.</p>';
  const catalog = PEAKS.filter(p => !p.custom);
  const done = catalog.filter(p => doneSet.has(p.id));
  const regions = REGIONS.map(region => {
    const all = catalog.filter(p => p.region === region);
    const n = all.filter(p => doneSet.has(p.id)).length;
    const pct = all.length ? (n / all.length) * 100 : 0;
    return `<div class="mine-region">
      <div class="mine-region-head"><span>${escapeHtml(region)}</span><strong>${n}/${all.length}</strong></div>
      <div class="mine-bar"><div style="width:${pct.toFixed(1)}%"></div></div>
    </div>`;
  }).join('');
  // Ascensions : les plus récentes d'abord, les sommets faits sans date à la fin.
  const allDone = PEAKS.filter(p => doneSet.has(p.id)).sort((a, b) =>
    (b.done_date || '').localeCompare(a.done_date || '') || b.altitude_m - a.altitude_m);
  const last = allDone.find(p => p.done_date);
  const wishes = PEAKS.filter(p => wishSet.has(p.id)).sort((a, b) => b.altitude_m - a.altitude_m);
  const customDone = allDone.length - done.length;
  return `
    <div class="mine-top">
      ${ringSvg(done.length, catalog.length)}
      <div class="mine-regions">${regions}</div>
    </div>
    <div class="mine-stats">
      ${foldHtml('done', '✓', last ? `${escapeHtml(last.name)} · ${formatDate(last.done_date)}` : (allDone.length ? `${allDone.length} sommet${allDone.length > 1 ? 's' : ''} fait${allDone.length > 1 ? 's' : ''}` : '—'),
        last ? `dernière ascension · ${allDone.length} au total` : 'dernière ascension',
        allDone.map(p => peakRow(p, p.done_date ? formatDate(p.done_date) : 'sans date')).join(''))}
      ${foldHtml('wish', '★', `${wishes.length}`, `envie${wishes.length > 1 ? 's' : ''} dans ta liste`,
        wishes.map(p => peakRow(p, `${fmt(p.altitude_m)} m`)).join(''))}
    </div>
    ${customDone ? `<p class="mine-note">+ ${customDone} sommet${customDone > 1 ? 's' : ''} ajouté${customDone > 1 ? 's' : ''} à la main, hors catalogue.</p>` : ''}
  `;
}

export function refreshMine() {
  const view = document.getElementById('mine-view');
  if (!view || view.hidden) return;
  const body = document.getElementById('mine-body');
  // Garde dépliés les blocs qui l'étaient (le contenu est régénéré à chaque changement).
  const open = new Set([...body.querySelectorAll('details[open]')].map(d => d.dataset.key));
  body.innerHTML = mineHtml();
  body.querySelectorAll('details').forEach(d => { d.open = open.has(d.dataset.key); });
  body.querySelectorAll('.mine-peak').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = PEAKS.find(x => x.id === btn.dataset.id);
      if (!p) return;
      setMineOpen(false);
      showPeak(p);
    });
  });
}

export function setMineOpen(open) {
  const view = document.getElementById('mine-view');
  const btn = document.getElementById('mine-open');
  view.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  btn.classList.toggle('active', open);
  refreshMine();
}

document.getElementById('mine-close').addEventListener('click', () => setMineOpen(false));
