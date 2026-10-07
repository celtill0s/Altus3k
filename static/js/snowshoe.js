// Vue raquettes : sommets avec un champ "snowshoe" dans static/mountains.json (validé par tests/test_catalog.py).
import { PEAKS } from './store.js';
import { initMountainMapView, routeInfo, WINTER_WARNINGS } from './mountain-map-view.js';

const snowshoeColor = grade => (grade.startsWith('Soutenu') ? 'var(--t3)' : 'var(--t4)');

export function initSnowshoeView() {
  initMountainMapView({
    viewId: 'snowshoe-view',
    mapId: 'snowshoe-map',
    listId: 'snowshoe-peaks-list',
    openButtonId: 'snowshoe-view-open',
    getPeaks: () => PEAKS.filter(peak => peak.snowshoe),
    info: peak => routeInfo(peak.snowshoe, snowshoeColor(peak.snowshoe.grade), 'Ouvrir le topo raquettes'),
    title: 'en raquettes',
    warnings: [
      ...WINTER_WARNINGS,
      'Ces sommets en raquettes sont pour la plupart des courses alpines hivernales, pas des balades : crampons et piolet sont souvent nécessaires.'
    ],
    slopes: true,
    legend: [['var(--t3)', 'Soutenu'], ['var(--t4)', 'Très exigeant · alpin']]
  });
}
