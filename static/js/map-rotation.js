// Rotation de la carte (vendor/leaflet-rotate, chargé avant ce module) : options des cartes,
// gestes à deux doigts (zoom OU rotation tant que le nord est en haut) et boussole.
import { controlButton } from './map-controls.js';

// Options de L.map pour la rotation (vendor/leaflet-rotate) : à deux doigts sur téléphone (comme
// Google Maps), Maj + molette sur ordinateur. Pas de rotation automatique selon la boussole du
// téléphone ; le contrôle d'origine est remplacé par createCompassControl().
export const ROTATE_OPTIONS = {
  rotate: true, bearing: 0, touchRotate: true, shiftKeyRotate: true, compassBearing: false, rotateControl: false
};

// Deux doigts, carte orientée nord en haut : zoom OU rotation, jamais les deux. Le premier
// mouvement net décide pour tout le geste : écart des doigts qui change (≥ ZOOM_THRESHOLD) → zoom
// seul, la carte ne tourne pas ; doigts qui tournent (≥ ROTATE_THRESHOLD_DEG) → mode « tourner »,
// sans zoom, jusqu'à ce qu'on lève les doigts. Une fois la carte tournée, plus de seuil : rotation
// et zoom ensemble, fluides (comme Google Maps), jusqu'au retour au nord (boussole).
// Corrige aussi leaflet-rotate, qui restait bloqué après deux doigts posés sans bouger.
const ROTATE_THRESHOLD_DEG = 20;
const ZOOM_THRESHOLD = 0.06; // 6 % d'écart entre les doigts
const touchGeometry = (map, e) => {
  const a = map.mouseEventToContainerPoint(e.touches[0]);
  const b = map.mouseEventToContainerPoint(e.touches[1]);
  const v = a.subtract(b);
  return { deg: Math.atan2(v.y, v.x) * 180 / Math.PI, dist: a.distanceTo(b) };
};
const isRotated = (map) => Math.abs(((map.getBearing() + 180) % 360 + 360) % 360 - 180) > 0.5;
const gestures = L.Map.TouchGestures?.prototype;
if (gestures) {
  const { _onTouchStart: start, _onTouchMove: move, _onTouchEnd: end } = gestures;
  gestures._onTouchStart = function (e) {
    start.call(this, e);
    if (this._zooming || this._rotating) {
      this._mode = isRotated(this._map) ? 'free' : null;
      this._start = touchGeometry(this._map, e);
    }
  };
  gestures._onTouchMove = function (e) {
    if (!(this._zooming || this._rotating) || e.touches?.length !== 2) return;
    if (this._mode === 'free') { move.call(this, e); return; } // carte déjà tournée : tout est libre
    const now = touchGeometry(this._map, e);
    const turned = ((now.deg - this._start.deg + 540) % 360) - 180;
    if (!this._mode) {
      if (this.rotate && Math.abs(turned) >= ROTATE_THRESHOLD_DEG) {
        this._mode = 'rotate';
        this._start = now; // pas de saut : la rotation part de la position actuelle des doigts
        this._startBearing = this._map.getBearing();
      } else if (Math.abs(now.dist / this._start.dist - 1) >= ZOOM_THRESHOLD) {
        this._mode = 'zoom';
      } else {
        L.DomEvent.preventDefault(e);
        return; // pas encore décidé
      }
    }
    if (this._mode === 'rotate') {
      this._map.setBearing(this._startBearing + turned);
      L.DomEvent.preventDefault(e);
      return;
    }
    const rotating = this._rotating;
    this._rotating = false; // zoom (et déplacement) seul
    move.call(this, e);
    this._rotating = rotating;
  };
  gestures._onTouchEnd = function (e) {
    end.call(this, e);
    this._rotating = false;
    this._zooming = false;
    this._mode = null;
    L.DomEvent.off(document, 'touchmove', this._onTouchMove, this).off(document, 'touchend touchcancel', this._onTouchEnd, this);
  };
}

// Remet le nord en haut en tournant par le plus court chemin (≈ 0,3 s).
function resetNorth(map) {
  const from = ((map.getBearing() + 180) % 360 + 360) % 360 - 180; // entre -180 et 180
  if (!from) return;
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 300);
    map.setBearing(from * (1 - (1 - (1 - k) ** 3))); // décélération
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Boussole : l'aiguille rouge montre le nord quand la carte est tournée ; un appui remet le nord
// en haut.
export function createCompassControl(map) {
  const control = controlButton('compass-control', () => resetNorth(map));
  const update = () => {
    const btn = control.button;
    if (!btn || !map.getBearing) return;
    const bearing = map.getBearing();
    const rotated = isRotated(map);
    btn.querySelector('svg').style.transform = `rotate(${bearing}deg)`;
    btn.classList.toggle('active', rotated);
    btn.title = rotated ? 'Remettre le nord en haut' : 'Nord en haut (tourne la carte à deux doigts, ou Maj + molette)';
    btn.setAttribute('aria-label', btn.title);
  };
  control.onButton = (btn) => {
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="compass-north" d="M12 2.5 15.5 12h-7z"/>'
      + '<path class="compass-south" d="M12 21.5 8.5 12h7z"/><circle cx="12" cy="12" r="1.6"/></svg>';
    update();
  };
  map.on('rotate', update);
  return control;
}
