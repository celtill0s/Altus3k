// Navigation : sur mobile, barre d'onglets en bas (Carte · Liste · Mes 3000 · Profil), chaque
// onglet en plein écran ; sur ordinateur, Mes 3000 et ⚙ s'ouvrent depuis la barre d'outils. Un
// seul de ces écrans est ouvert à la fois. L'onglet actif est déduit de ce qui est affiché
// (la liste se referme aussi quand on choisit un sommet, un panneau par sa croix ✕).
import { setMobileListOpen } from './sidebar.js';
import { setSettingsOpen } from './settings.js';
import { setMineOpen } from './mine.js';

// Dans une vue ski / crampons / raquettes, « Carte » et « Liste » pilotent la carte et la liste de cette vue.
const openActivityView = () => document.querySelector('.summit-map-view:not([hidden])');

function currentTab() {
  const activityView = openActivityView();
  const listOpen = activityView
    ? activityView.classList.contains('mobile-list-open')
    : document.getElementById('app').classList.contains('mobile-list-open');
  if (listOpen) return 'list';
  if (!document.getElementById('mine-view').hidden) return 'mine';
  if (!document.getElementById('settings-panel').hidden) return 'profile';
  return 'map';
}

function setTab(tab) {
  const activityView = openActivityView();
  activityView?.classList.toggle('mobile-list-open', tab === 'list');
  setMobileListOpen(!activityView && tab === 'list');
  setMineOpen(tab === 'mine');
  setSettingsOpen(tab === 'profile');
}

function refreshTabBar() {
  const tab = currentTab();
  document.querySelectorAll('#tab-bar button').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('active', active);
    if (active) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
  });
}

export function initTabs() {
  document.querySelectorAll('#tab-bar button').forEach(btn => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });
  const toggle = (tab) => () => setTab(currentTab() === tab ? 'map' : tab);
  document.getElementById('settings-open').addEventListener('click', toggle('profile'));
  document.getElementById('mine-open').addEventListener('click', toggle('mine'));
  const observer = new MutationObserver(refreshTabBar);
  observer.observe(document.getElementById('app'), { attributes: true, attributeFilter: ['class'] });
  ['mine-view', 'settings-panel'].forEach(id => {
    observer.observe(document.getElementById(id), { attributes: true, attributeFilter: ['hidden'] });
  });
  document.querySelectorAll('.summit-map-view').forEach(view => {
    observer.observe(view, { attributes: true, attributeFilter: ['hidden', 'class'] });
  });
}
