// Vue 3D d'un sommet : relief incliné autour du sommet, à faire tourner et pencher (deux doigts sur
// téléphone, clic droit ou Ctrl + glisser sur ordinateur). MapLibre GL (static/vendor/maplibre/,
// ~1 Mo) n'est chargé qu'à la première ouverture. Build « CSP » : son moteur tourne dans un worker
// servi par le site (worker-src 'self'), sans blob: ni eval.
// Relief : tuiles d'altitude « Terrarium » (AWS Open Data, ex-Mapzen), gratuites et sans clé ;
// image : Plan IGN ou photos aériennes IGN, comme la carte. Trace GPX du sommet si elle est chargée.
import { gpxStats } from './gpx.js';
import { escapeHtml } from './util.js';

const VENDOR = new URL('../vendor/maplibre/', import.meta.url);
const IGN_ATTRIBUTION = '&copy; <a href="https://www.ign.fr/" target="_blank" rel="noopener">IGN</a> – Géoplateforme';
const TERRAIN_ATTRIBUTION = 'Relief : <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Terrain Tiles</a> (Mapzen, AWS)';
const BASES = {
  photos: ['Photos', 'ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg'],
  plan: ['Plan IGN', 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png']
};

let loading = null;
let current = null; // { map, root, onKey }

function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve();
  loading ||= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = new URL('maplibre-gl.css', VENDOR).href;
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = new URL('maplibre-gl-csp.js', VENDOR).href;
    script.onload = () => {
      window.maplibregl.setWorkerUrl(new URL('maplibre-gl-csp-worker.js', VENDOR).href);
      resolve();
    };
    script.onerror = () => { loading = null; reject(new Error('MapLibre indisponible')); };
    document.head.appendChild(script);
  });
  return loading;
}

function ignTiles(layer, format) {
  return 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&STYLE=normal' +
    `&TILEMATRIXSET=PM&LAYER=${layer}&FORMAT=${format}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
}

function style() {
  const sources = {
    terrain: {
      type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 15,
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      attribution: TERRAIN_ATTRIBUTION
    }
  };
  const layers = [];
  for (const [key, [, layer, format]] of Object.entries(BASES)) {
    sources[key] = { type: 'raster', tiles: [ignTiles(layer, format)], tileSize: 256, maxzoom: 19, attribution: IGN_ATTRIBUTION };
    layers.push({ id: key, type: 'raster', source: key, layout: { visibility: key === 'photos' ? 'visible' : 'none' } });
  }
  return { version: 8, sources, layers, terrain: { source: 'terrain', exaggeration: 1.2 } };
}

function addTrace(map, p) {
  const points = gpxStats(p.id)?.points || [];
  if (points.length < 2) return;
  map.addSource('gpx', {
    type: 'geojson',
    data: { type: 'Feature', geometry: { type: 'LineString', coordinates: points.map(pt => [pt.lon, pt.lat]) } }
  });
  map.addLayer({ id: 'gpx', type: 'line', source: 'gpx', layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#e8442e', 'line-width': 4, 'line-opacity': 0.9 } });
}

export function close3dView() {
  if (!current) return;
  current.map?.remove();
  current.root.remove();
  document.removeEventListener('keydown', current.onKey);
  current = null;
}

export async function open3dView(p) {
  close3dView();
  const root = document.createElement('div');
  root.id = 'view-3d';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', `Vue 3D : ${p.name}`);
  root.innerHTML = `
    <div class="view-3d-bar">
      <h2>${escapeHtml(p.name)} <span>${escapeHtml(p.altitude_m)} m</span></h2>
      <div class="view-3d-bases" role="group" aria-label="Fond">
        ${Object.entries(BASES).map(([key, [label]]) =>
          `<button type="button" data-base="${key}" aria-pressed="${key === 'photos'}">${label}</button>`).join('')}
      </div>
      <button type="button" class="view-3d-close" aria-label="Fermer la vue 3D">&#10005;</button>
    </div>
    <div class="view-3d-map"><p class="view-3d-status">Chargement du relief…</p></div>`;
  document.body.appendChild(root);
  const onKey = (e) => { if (e.key === 'Escape') close3dView(); };
  current = { map: null, root, onKey };
  document.addEventListener('keydown', onKey);
  root.querySelector('.view-3d-close').addEventListener('click', close3dView);

  const container = root.querySelector('.view-3d-map');
  try {
    await loadMapLibre();
  } catch {
    container.querySelector('.view-3d-status').textContent = 'Vue 3D indisponible (hors ligne ?).';
    return;
  }
  if (current?.root !== root) return; // fermée pendant le chargement
  let map;
  try {
    map = new window.maplibregl.Map({
      container, style: style(), center: [p.lon, p.lat], zoom: 13.2, pitch: 65, bearing: -20,
      maxPitch: 80, attributionControl: { compact: true }
    });
  } catch {
    // Pas de WebGL (vieux téléphone, accélération graphique désactivée…).
    container.querySelector('.view-3d-status').textContent = 'Vue 3D non prise en charge par ce navigateur (WebGL).';
    return;
  }
  container.querySelector('.view-3d-status').remove();
  current.map = map;
  map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  const label = document.createElement('div');
  label.className = 'view-3d-summit';
  label.textContent = `${p.name} · ${p.altitude_m} m`;
  new window.maplibregl.Marker({ element: label, anchor: 'bottom' }).setLngLat([p.lon, p.lat]).addTo(map);
  map.on('load', () => addTrace(map, p));

  root.querySelectorAll('[data-base]').forEach(btn => btn.addEventListener('click', () => {
    if (!map.getLayer(btn.dataset.base)) return; // style pas encore chargé
    for (const key of Object.keys(BASES)) {
      map.setLayoutProperty(key, 'visibility', key === btn.dataset.base ? 'visible' : 'none');
      root.querySelector(`[data-base="${key}"]`).setAttribute('aria-pressed', String(key === btn.dataset.base));
    }
  }));
}
