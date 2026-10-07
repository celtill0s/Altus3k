# Features in detail

[← Back to the README](../../README.en.md) · [Français](../fonctionnalites.md)

- **Filters** (⚙ Paramètres panel): by range (Alps/Pyrenees), by grade (T2, T3, T4) and by
  status (done, to do, wish list); free-text search (name, range) at the top of the list.
- **Base maps**: **"Auto"** by default — OpenStreetMap when zoomed out, IGN topographic map once
  the scale shows 20 km — zoom 9 (`IGN_FROM_ZOOM` in `static/js/map.js`); or IGN topographic map,
  IGN aerial imagery or OpenStreetMap. Plus an IGN overlay of **slopes over 30°** (potential
  avalanche terrain). Public IGN Géoplateforme feeds, no API key. IGN tiles are blank outside
  France: for the Spanish or Italian side of a border summit, switch to OpenStreetMap. The chosen
  base map is remembered by the browser. (SCAN 25, IGN's hiking topo map, is not available
  without a personal key.)
- **Scale** in metres at the bottom of the map.
- **Show all / Group** (eye button): shows every summit at its real position instead of grouping
  them by area.
- **Locate me**: target button (next to the zoom) showing your live GPS position (blue dot +
  accuracy circle), centring the map once; tap again to stop.
- **Installable app (PWA)**: on Android, Chrome offers "Install app" (⋮ menu); on iPhone,
  Safari → Share → "Add to Home Screen". The app then opens full screen with its own icon and
  updates itself with the site. A service worker (`static/sw.js`) makes it usable **offline** for
  whatever was already viewed online: the app itself, the list of summits, photos and map tiles
  already displayed (3,000 max). Offline, changes (done, notes, uploads) fail with a message: they
  are not queued.
- **Android app (APK)**: an alternative to the PWA that does not depend on any browser, with a
  login screen (site account; only the encrypted session is stored — never the password).
  Download it from the GitHub **Releases**; see [`android/README.md`](../../android/README.md)
  (in French) for installation and publishing a new release.
- **Done tracking**, **personal notes**, **photos and videos** (full-screen viewer, swipe between
  media) and a **GPX track per summit** (import, elevation profile, elevation gain, export):
  everything is saved immediately on the server and visible from any device logged in to the
  same instance.
- **Videos** served with `Range` request support (seeking, playback on iPhone/Safari); uploads
  are streamed to disk, never fully loaded into memory (comfortable on a Raspberry Pi, even for a
  500 MB video).
- **Thumbnails and HEIC**: if [Pillow](https://python-pillow.org/) (and `pillow-heif`) is
  installed — it is in the Docker image —, the grid shows JPEG thumbnails generated on demand,
  and iPhone HEIC photos are converted to JPEG so every browser can show them. Without Pillow,
  originals are served as is. Locally: `pip install -r requirements.txt`.
- **Crampons + ice axe, ski and snowshoe views**: one map per activity, with its own list
  (search, grade chips), safety warnings, the same summit card plus a route block, and slopes
  over 30° shown by default. Data: the `crampon`, `ski` and `snowshoe` fields of the catalogue
  (see [Editing the catalogue](catalogue.md)). You can add your own summits there, attached to
  the activity.
- **Mes 3000** (My 3000s): progress ring over the 45 catalogue summits, breakdown by range, latest
  dated ascents and wish list (expandable; tapping a summit opens it).
- **Ascent date and wish list**: ticking "done" records today's date, editable in the card;
  ★ Envie (Wish) flags summits to do first (star marker, « Envies » filter).
- **Interactive GPX profile**: dragging along the elevation profile moves a point along the track,
  and hovering the track places the cursor on the profile.
