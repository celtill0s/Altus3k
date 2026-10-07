# Development

[← Back to the README](../../README.en.md) · [Français](../developpement.md)

## Repository layout

- **`static/index.html`** — the app page: summit list, map, toolbar (À pied · Crampons · Ski ·
  Raquettes view switcher), floating summit card, My 3000s, Settings, mobile tab bar.
- **`static/js/`** — the frontend code, as native ES modules (no bundler, no `npm install` needed
  to run the app):
  - `main.js` (entry point), `store.js` (shared state), `config.js`;
  - `map.js` (walking map, base maps, overlays) and `map-controls.js` (building blocks shared by
    every map: marker clustering, eye button, "locate me", legend);
  - `mountain-map-view.js` (activity views) with `crampon.js`, `ski.js`, `snowshoe.js`;
  - `sidebar.js` (list), `panel.js` (summit card), `peak-image.js` (thumbnails), `gpx.js`,
    `photos.js`, `lightbox.js`, `mine.js` (My 3000s), `tabs.js` (mobile tabs), `custom-peak.js`
    (personal summits), `settings.js`, `account.js`, `admin.js`…;
  - `eslint.config.mjs` is only used by the CI.
- **`static/img/peaks/`** — free photos of the summits (Wikimedia Commons), credited in
  `mountains.json`.
- **`static/mountains.json`** — the public catalogue: name, altitude, coordinates, range, region,
  difficulty grade (SAC scale), access notes, source.
- **`server/`** — the backend (see "Architecture" in the [README](../../README.en.md#architecture)):
  `app.py` (HTTP server, route table, startup), `auth.py` (accounts, sessions), `storage.py`
  (catalogue and personal spaces on disk), `files.py` (versioned pages, GPX, thumbnails), `cli.py`
  (admin commands).
- **`static/vendor/`** — Leaflet 1.9.4 and Leaflet.markercluster 1.5.3, copied as is (with their
  licenses): no script is loaded from a third-party CDN.
- **`data/`** (created at runtime, never committed) — `users.json` (accounts), `sessions.json`
  (sessions), and one folder per user `users/<username>/`: `progress.json` (summits done, notes,
  photo/video/GPX references, keyed by summit `id`), `custom_peaks.json` (summits added by hand,
  visible only to that user), `photos/<id>/`, `gpx/<id>.gpx`, `thumbs/` (thumbnails, can be
  regenerated: no need to back them up).
- **`android/`** — the Android app (see `android/README.md`), built and published by
  `.github/workflows/release.yml` for every `vX.Y.Z` tag on `main`.
- **`scripts/`** — `backup.sh` (backs up `data/`), `screenshots.py` (README screenshots).
- **`sources.md`** — full methodology (in French): how each summit was selected, how its grade
  was determined, sources used and known limits.

## Tests

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m playwright install chromium   # once: browser for the site tests
.venv/bin/python -m pytest -q                      # server, catalogue and site in a real browser
```

| File | What it tests |
|---|---|
| `tests/test_server_app.py` | routes, every role's permissions on every route, accounts, sessions, uploads, quota, personal summits |
| `tests/test_catalog.py` | the `static/mountains.json` catalogue (fields, grades, coordinates, unique ids, ski / snowshoe / photo blocks) |
| `tests/test_frontend.py` | the site in Chromium: login, filters, done and date, wish list, notes, personal summits, crampon / ski / snowshoe views, mobile tabs, My 3000s, GPX profile, admin read-only view (skipped if Chromium is missing) |

The CI (GitHub Actions) runs all of this on every push, plus the JavaScript lint (ESLint), the
Docker image build and the APK build.

To try things without touching your data: `DATA_DIR=/tmp/test PORT=8765 python3 server/app.py`
(after a `create-admin` with the same `DATA_DIR`).

## README screenshots

```bash
.venv/bin/python scripts/screenshots.py
```

Starts the server on temporary demo data, opens the site in Chromium (desktop and phone) and
rewrites `screenshots/*.webp`: always the same format, already compressed (about 130 KB each).
Map tiles need a network connection.
