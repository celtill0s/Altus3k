# Développement

[← Retour au README](../README.md)

## Organisation du dépôt

- **`static/index.html`** — la page de l'appli : liste des sommets, carte, barre d'outils
  (sélecteur À pied · Crampons · Ski · Raquettes), fiche flottante d'un sommet, Mes 3000,
  Paramètres, barre d'onglets mobile.
- **`static/js/`** — le code du frontend, en modules ES natifs (pas de bundler, pas de
  `npm install` pour faire tourner l'appli) :
  - `main.js` (point d'entrée), `store.js` (état partagé), `config.js` ;
  - `map.js` (carte à pied, fonds, calques) et `map-controls.js` (briques communes à toutes les
    cartes : regroupement des marqueurs, bouton œil, « me localiser », légende) ;
  - `mountain-map-view.js` (vues d'activité) avec `crampon.js`, `ski.js`, `snowshoe.js` ;
  - `sidebar.js` (liste), `panel.js` (fiche d'un sommet), `peak-image.js` (vignettes),
    `gpx.js`, `photos.js`, `lightbox.js`, `mine.js` (Mes 3000), `tabs.js` (onglets mobiles),
    `custom-peak.js` (sommets perso), `settings.js`, `account.js`, `admin.js`… ;
  - `eslint.config.mjs` sert uniquement à la CI.
- **`static/img/peaks/`** — photos libres des sommets (Wikimedia Commons), crédits dans
  `mountains.json`.
- **`static/mountains.json`** — le catalogue public : nom, altitude,
  coordonnées, massif, région, cotation de difficulté (échelle CAS/SAC),
  notes d'accès, source.
- **`server/`** — le backend (voir « Architecture » dans le [README](../README.md#-architecture)) : `app.py`
  (serveur HTTP, table des routes, démarrage), `auth.py` (comptes,
  sessions), `storage.py` (catalogue et espaces personnels sur disque),
  `files.py` (pages versionnées, GPX, miniatures), `cli.py` (commandes
  d'administration).
- **`static/vendor/`** — Leaflet 1.9.4 et Leaflet.markercluster 1.5.3,
  copiés tels quels (avec leur licence) : aucun script chargé depuis un
  CDN tiers.
- **`data/`** (généré à l'exécution, jamais commité) — `users.json`
  (comptes), `sessions.json` (sessions), et un dossier par utilisateur
  `users/<identifiant>/` : `progress.json` (sommets faits, commentaires,
  références photos-vidéos-gpx, indexés par `id` de sommet),
  `custom_peaks.json` (sommets ajoutés à la main, visibles de lui seul),
  `photos/<id>/`, `gpx/<id>.gpx`, `thumbs/` (miniatures, régénérables :
  inutile de les sauvegarder).
- **`android/`** — l'appli Android (voir `android/README.md`), construite et
  publiée par `.github/workflows/release.yml` à chaque tag `vX.Y.Z` posé sur `main`.
- **`scripts/`** — `backup.sh` (sauvegarde de `data/`), `screenshots.py` (captures du README).
- **`sources.md`** — méthodologie complète : comment chaque sommet a été
  sélectionné, comment sa cotation a été déterminée, sources utilisées et
  limites connues (inclut l'audit critique du 2026-09-01).

## Tests

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m playwright install chromium   # une fois : navigateur des tests du site
.venv/bin/python -m pytest -q                      # serveur, catalogue et site dans un vrai navigateur
```

| Fichier | Ce qui est testé |
|---|---|
| `tests/test_server_app.py` | routes, droits de chaque rôle sur chaque route, comptes, sessions, uploads, quota, sommets perso |
| `tests/test_catalog.py` | le catalogue `static/mountains.json` (champs, cotations, coordonnées, ids uniques, blocs ski / raquettes / photo) |
| `tests/test_frontend.py` | le site dans Chromium : connexion, filtres, sommet fait et date, envies, commentaire, sommets perso, vues crampons / ski / raquettes, onglets mobiles, Mes 3000, profil GPX, consultation admin (ignorés si Chromium est absent) |

La CI (GitHub Actions) lance tout ça à chaque push, plus le lint du JavaScript (ESLint), la
construction de l'image Docker et celle de l'APK.

Pour essayer sans toucher à tes données : `DATA_DIR=/tmp/essai PORT=8765 python3 server/app.py`
(après un `create-admin` avec le même `DATA_DIR`).

## Captures d'écran du README

```bash
.venv/bin/python scripts/screenshots.py
```

Lance le serveur sur des données de démo temporaires, ouvre le site dans Chromium (ordinateur et
téléphone) et réécrit `screenshots/*.webp` : toujours au même format, déjà compressées (environ
130 Ko chacune). Il faut du réseau pour les tuiles de carte.
