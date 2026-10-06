// Image d'un sommet (vignette de la liste, bandeau de la fiche), par ordre de préférence :
// 1. la première photo du membre ;
// 2. la photo du catalogue (champ « image » de mountains.json : fichier de static/img/peaks/,
//    sous licence libre, avec son crédit) ;
// 3. la tuile IGN « photos aériennes » qui contient le sommet, cadrée dessus.
// Une seule tuile par image (jamais de mosaïque) : le cadre est décalé pour rester dans la tuile,
// le sommet est donc toujours visible, centré autant que possible.
import { isVideoFile } from './util.js';
import { mediaUrls } from './api.js';

const TILE = 256;
const ORTHO_ZOOM = 16; // ~ 600 m de côté à nos latitudes : le sommet et ses abords immédiats

function orthoTileUrl(x, y) {
  return 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&STYLE=normal' +
    `&TILEMATRIXSET=PM&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&FORMAT=image/jpeg&TILEMATRIX=${ORTHO_ZOOM}&TILEROW=${y}&TILECOL=${x}`;
}

// Position du sommet en pixels « monde » (Web Mercator) au zoom choisi.
function worldPixel(lat, lon) {
  const n = 2 ** ORTHO_ZOOM;
  const latRad = lat * Math.PI / 180;
  return {
    x: (lon + 180) / 360 * n * TILE,
    y: (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n * TILE
  };
}

// Photo du catalogue affichée (pas de photo du membre) : son crédit doit apparaître (licences CC).
export function catalogImage(p) {
  if ((p.photos || []).some(f => !isVideoFile(f))) return null;
  return p.image && /^img\/peaks\/[a-z0-9-]+\.jpg$/.test(p.image.url) ? p.image : null;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Style CSS (background-*) d'une image de sommet pour un cadre de width × height px.
 * scale : agrandissement de la tuile (1 = 256 px ; 1.5 pour un bandeau large).
 */
export function peakImageStyle(p, width, height, scale = 1) {
  const photo = (p.photos || []).find(f => !isVideoFile(f));
  if (photo) {
    return `background-image:url("${mediaUrls(p, photo).thumb}");background-size:cover;background-position:center`;
  }
  if (catalogImage(p)) {
    return `background-image:url("/${encodeURI(p.image.url)}");background-size:cover;background-position:center`;
  }
  const lat = Number(p.lat), lon = Number(p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
  const world = worldPixel(lat, lon);
  const tx = Math.floor(world.x / TILE), ty = Math.floor(world.y / TILE);
  const size = TILE * scale;
  const px = (world.x - tx * TILE) * scale, py = (world.y - ty * TILE) * scale;
  // Décalage qui centre le sommet dans le cadre, borné pour ne jamais sortir de la tuile.
  const bx = clamp(width / 2 - px, width - size, 0), by = clamp(height / 2 - py, height - size, 0);
  return `background-image:url("${orthoTileUrl(tx, ty)}");background-size:${size}px ${size}px;` +
    `background-position:${Math.round(bx)}px ${Math.round(by)}px`;
}

// Chargement différé : l'image n'est demandée que lorsque l'élément devient visible (liste de 45
// sommets sur mobile : pas 45 téléchargements d'un coup).
const observer = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.setAttribute('style', entry.target.dataset.bg);
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '200px' })
  : null;

export function lazyBackground(el, style) {
  if (!style) return;
  el.dataset.bg = style;
  if (observer) observer.observe(el); else el.setAttribute('style', style);
}
