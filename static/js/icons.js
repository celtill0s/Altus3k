// Icônes Leaflet : marqueur montagne par sommet et bulle de cluster.
import { startsMobile } from './config.js';

// Silhouette "montagne" (deux pointes) réutilisée pour les marqueurs individuels ET les
// bulles de cluster, dans un viewBox 24x24.
export const MOUNTAIN_PATH = 'M2 20 L9 8 L13 14 L16 9 L22 20 Z';

// Marqueur individuel : logo montagne, couleur = cotation (T2/T3/T4), altitude en petit en bas à
// droite. Forme selon l'état (voir peakState dans store.js) :
// - 'done' : plein, pastille ✓ (vert sapin) en haut à gauche ;
// - 'wish' : plein, pastille ★ (ambre) en haut à gauche ;
// - 'todo' : contour seul (intérieur blanc), pour que les sommets faits ressortent ;
// - 'plain' (invité) : plein, sans pastille.
// Plus grand sur PC (espace disponible, pas de doigt qui masque le point) qu'en mobile.
const PEAK_ICON_SCALE = startsMobile ? 1 : 1.4;
const BADGES = {
  done: { text: '&#10003;', className: 'peak-icon-check' },
  wish: { text: '&#9733;', className: 'peak-icon-check peak-icon-wish' }
};
export function makeIcon(color, state, altitudeM) {
  const s = PEAK_ICON_SCALE;
  const w = Math.round(34 * s), h = Math.round(36 * s);
  const svgSize = Math.round(30 * s), svgLeft = Math.round(2 * s);
  const checkSize = Math.round(13 * s), checkFont = Math.round(9 * s), checkOff = Math.round(-2 * s);
  const altFont = Math.round(8 * s);
  const badge = BADGES[state];
  const badgeHtml = badge ? `<div class="${badge.className}" style="width:${checkSize}px;height:${checkSize}px;top:${checkOff}px;left:${checkOff}px;font-size:${checkFont}px;">${badge.text}</div>` : '';
  const alt = altitudeM != null ? `<div class="peak-icon-alt" style="font-size:${altFont}px;">${altitudeM}</div>` : '';
  const outline = state === 'todo';
  const path = outline
    ? `<path d="${MOUNTAIN_PATH}" fill="#fff" fill-opacity="0.9" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>`
    : `<path d="${MOUNTAIN_PATH}" fill="${color}" stroke="${state === 'done' ? '#1b3a2c' : '#fff'}" stroke-width="1.4" stroke-linejoin="round"/>`;
  return L.divIcon({
    className: '',
    html: `<div class="peak-icon-wrap peak-${state}" style="width:${w}px;height:${h}px;">
      <svg viewBox="0 0 24 24" class="peak-icon-svg" style="width:${svgSize}px;height:${svgSize}px;left:${svgLeft}px;">${path}</svg>
      ${badgeHtml}${alt}
    </div>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2]
  });
}

// Bulle de cluster (dézoom) : même logo montagne, couleur neutre (mélange de difficultés),
// avec le nombre total de sommets du secteur affiché par-dessus. Taille légèrement croissante
// selon l'effectif du groupe, purement visuel.
// Badge (rond + chiffre) dessiné DANS le même SVG que la montagne, peint après elle (donc
// forcément au-dessus, sans dépendre d'un empilement CSS/HTML qui peut être perturbé par le
// contexte d'empilement créé par le filter drop-shadow du logo).
export function clusterIcon(count) {
  const size = Math.round((count >= 25 ? 46 : count >= 10 ? 40 : 34) * PEAK_ICON_SCALE);
  const label = String(count);
  const r = label.length > 2 ? 6.5 : 5.5; // un peu plus large pour 3 chiffres
  const cx = 24 - r - 1;
  const cy = 24 - r - 1;
  return L.divIcon({
    className: '',
    html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="display:block; filter: drop-shadow(0 1px 3px rgba(0,0,0,.4));">
      <path d="${MOUNTAIN_PATH}" fill="#2c5f4a" stroke="#1b3a2c" stroke-width="1.2" stroke-linejoin="round"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="#1b3a2c" stroke-width="1.3"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${label.length > 2 ? 6 : 7}" font-weight="800" fill="#1b3a2c">${label}</text>
    </svg>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}
