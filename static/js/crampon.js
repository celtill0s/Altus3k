// Vue « crampons + piolet » (sommets avec un champ crampon dans le catalogue).
import { PEAKS } from './store.js';
import { initMountainMapView } from './mountain-map-view.js';

// --- Vue "crampons + piolet" (POC) : sommets où une extension crampons+piolet à pied (pas de
// corde, pas de glace verticale) est documentée hors de la fenêtre de randonnée normale, avec
// le grade alpin (confirmé sur camptocamp.org, ou estimé sinon). Données : champ "crampon" des
// sommets concernés dans static/mountains.json (validé par tests/test_catalog.py).
function cramponDifficultyColor(peak) {
  const levels = { F: 0, 'PD-': 1, PD: 2, 'PD+': 3, 'AD-': 4, AD: 5, 'AD+': 6, 'D-': 7, D: 8, 'D+': 9, TD: 10, ED: 11 };
  const grades = peak.crampon.grade.toUpperCase().match(/ED|TD|AD[+-]?|PD[+-]?|D[+-]?|F[+-]?/g) || [];
  const highestLevel = Math.max(-1, ...grades.map(grade => levels[grade] ?? levels[grade.replace(/[+-]$/, '')]));
  if (highestLevel < 0) return 'var(--activity-unrated)';
  if (highestLevel === 0) return 'var(--t2)';
  if (highestLevel <= 3) return 'var(--t3)';
  return 'var(--t4)';
}

// Pas de topo en lien : la voie est celle de la randonnée, prolongée hors saison.
function cramponInfo(peak) {
  const { grade, confirmed, season, note } = peak.crampon;
  return {
    grade,
    label: `${grade} · ${confirmed ? 'Confirmé' : 'Estimé'}`,
    color: cramponDifficultyColor(peak),
    route: `${confirmed ? 'Grade confirmé' : 'Grade estimé, à confirmer avant de partir'} · ${season}`,
    note
  };
}

export function initCramponView() {
  initMountainMapView({
    viewId: 'crampon-view',
    mapId: 'crampon-map',
    listId: 'crampon-peaks-list',
    openButtonId: 'crampon-view-open',
    getPeaks: () => PEAKS.filter(peak => peak.crampon),
    info: cramponInfo,
    title: 'crampons + piolet',
    warnings: [
      'Marche sur neige avec crampons et piolet uniquement (auto-arrêt, pas de technique de glace ou de cascade, pas de corde) : extension hors saison de la voie normale « randonnée ».',
      'Grade alpin indiqué quand il est confirmé sur camptocamp.org ; sinon estimé à partir des descriptions disponibles (non formellement vérifié, à confirmer avant de partir).',
      'Écartées de cette liste : les variantes qui demandent en réalité une corde ou de l’escalade (ex. voie des Corridors au Pic de Campbieil : pentes de 60–65°, corde portée ; traversée de crête vers le Pic du Milieu : AD-, passage rocheux de niveau II).'
    ],
    slopes: true,
    legend: [['var(--t2)', 'F'], ['var(--t3)', 'PD'], ['var(--t4)', 'AD et plus'], ['var(--activity-unrated)', 'Non coté']]
  });
}
