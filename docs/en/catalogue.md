# Editing the catalogue

[← Back to the README](../../README.en.md) · [Français](../catalogue.md)

The catalogue is licensed under [CC BY-SA 4.0](../../LICENSE-catalogue.md): every contribution is
published under that license. Its content (names, notes, routes) is written in French.

Edit `static/mountains.json` directly (a JSON array, one object per summit). Each entry follows
this schema:

```json
{
  "id": "summit-name",
  "name": "Summit name",
  "altitude_m": 3025,
  "lat": 44.6783,
  "lon": 6.9636,
  "massif": "Mountain range",
  "region": "Alpes" or "Pyrénées",
  "difficulty": "T2" | "T3" | "T4",
  "notes": "Short description of the route/access",
  "source": "source-domain.fr",
  "source_url": "https://... (exact page, shown as a link in the grade details)",
  "crampon": {
    "grade": "F",
    "confirmed": true,
    "season": "Juin – juillet",
    "note": "Optional: off-season crampons + ice axe extension (dedicated view)"
  },
  "ski": {
    "grade": "Ski 2.2–2.3",
    "route": "Versants Sud et SW",
    "note": "Optional: ski touring route (ski view)",
    "url": "https://skitour.fr/…"
  },
  "snowshoe": {
    "grade": "Soutenu · encadré",
    "route": "…",
    "note": "Optional: snowshoe route (snowshoe view)",
    "url": "https://…"
  },
  "image": {
    "url": "img/peaks/summit-name.jpg",
    "author": "Photo author",
    "license": "CC BY-SA 4.0",
    "source": "https://commons.wikimedia.org/wiki/File:…"
  }
}
```

Optional fields:

| Field | Purpose |
|---|---|
| `crampon` | the summit appears in the **crampons + ice axe** view (alpine grade, confirmed or estimated) |
| `ski` | the summit appears in the **ski** view; its colour follows the highest grade of the range (≤ 2.3 green, ≤ 3.3 orange, red above). Only keep routes **without rope or glacier gear** |
| `snowshoe` | the summit appears in the **snowshoe** view (`grade` starting with « Soutenu »: orange, red otherwise) |
| `image` | summit photo (list thumbnail, card banner): file in `static/img/peaks/<id>.jpg`, **free license only** (Wikimedia Commons), about 480×300 px and 40 KB at most, credit shown under the banner. Without a photo, the IGN aerial view is used instead |

**An `id` must never change** once the summit is published: it is the key of personal data
(`progress.json`, each user's photo and GPX folders). To fix a name, only change `name`. For a
new summit, use the name in lower case, without accents, words separated by hyphens.

`pytest` validates the catalogue automatically (fields, grades, coordinates, unique ids, format
of the `ski` / `snowshoe` / `image` blocks, presence of the photo files) — the CI runs it on every
push too.

(The `done`, `comment`, `photos` and `gpx` fields are **not** part of the catalogue: they are
personal data, specific to each user and managed by the server in
`data/users/<username>/progress.json`.)

See [`sources.md`](../../sources.md) (in French) for the grading scale and the reference sources
to use for any new entry.
