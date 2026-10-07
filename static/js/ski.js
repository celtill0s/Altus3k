// Vue ski : sommets avec un champ "ski" dans static/mountains.json (validé par tests/test_catalog.py).
import { PEAKS } from './store.js';
import { initMountainMapView, routeInfo, WINTER_WARNINGS } from './mountain-map-view.js';

// Couleur d'après la cotation la plus haute de la fourchette (« Ski 2.2–4.3 » → 4.3).
function skiDifficultyColor(grade) {
  const ratings = grade.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (/extrême/i.test(grade)) return 'var(--t4)';
  if (!ratings.length) return 'var(--activity-unrated)';
  const highestRating = Math.max(...ratings);
  if (highestRating <= 2.3) return 'var(--t2)';
  if (highestRating <= 3.3) return 'var(--t3)';
  return 'var(--t4)';
}

export function initSkiView() {
  initMountainMapView({
    viewId: 'ski-view',
    mapId: 'ski-map',
    listId: 'ski-peaks-list',
    openButtonId: 'ski-view-open',
    getPeaks: () => PEAKS.filter(peak => peak.ski),
    info: peak => routeInfo(peak.ski, skiDifficultyColor(peak.ski.grade), 'Ouvrir le topo'),
    title: 'à ski',
    warnings: WINTER_WARNINGS,
    slopes: true,
    legend: [['var(--t2)', 'Jusqu’à 2.3'], ['var(--t3)', '3.1 à 3.3'], ['var(--t4)', '4.1 et plus'], ['var(--activity-unrated)', 'Non coté']]
  });
}
