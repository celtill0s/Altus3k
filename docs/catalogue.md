# Modifier le catalogue

[← Retour au README](../README.md)


Éditer `static/mountains.json` directement (tableau JSON, un objet par
sommet). Chaque entrée suit ce schéma :

```json
{
  "id": "nom-du-sommet",
  "name": "Nom du sommet",
  "altitude_m": 3025,
  "lat": 44.6783,
  "lon": 6.9636,
  "massif": "Nom du massif",
  "region": "Alpes" ou "Pyrénées",
  "difficulty": "T2" | "T3" | "T4",
  "notes": "Description courte de l'itinéraire/accès",
  "source": "domaine-source.fr",
  "source_url": "https://... (page précise, affichée en lien cliquable dans le \"Détail de la cotation\")",
  "crampon": {
    "grade": "F",
    "confirmed": true,
    "season": "Juin – juillet",
    "note": "Optionnel : extension crampons+piolet hors saison (vue dédiée)"
  },
  "ski": {
    "grade": "Ski 2.2–2.3",
    "route": "Versants Sud et SW",
    "note": "Optionnel : itinéraire à ski (vue ski)",
    "url": "https://skitour.fr/…"
  },
  "snowshoe": {
    "grade": "Soutenu · encadré",
    "route": "…",
    "note": "Optionnel : itinéraire en raquettes (vue raquettes)",
    "url": "https://…"
  },
  "image": {
    "url": "img/peaks/nom-du-sommet.jpg",
    "author": "Auteur de la photo",
    "license": "CC BY-SA 4.0",
    "source": "https://commons.wikimedia.org/wiki/File:…"
  }
}
```

Champs optionnels :

| Champ | Rôle |
|---|---|
| `crampon` | le sommet apparaît dans la vue **crampons + piolet** (grade alpin, confirmé ou estimé) |
| `ski` | le sommet apparaît dans la vue **ski** ; la couleur suit la cotation la plus haute de la fourchette (≤ 2.3 vert, ≤ 3.3 orange, au-delà rouge). Ne retenir que des itinéraires **sans corde ni matériel glacier** |
| `snowshoe` | le sommet apparaît dans la vue **raquettes** (`grade` commençant par « Soutenu » : orange, sinon rouge) |
| `image` | photo du sommet (vignette de la liste, bandeau de la fiche) : fichier dans `static/img/peaks/<id>.jpg`, **licence libre uniquement** (Wikimedia Commons), environ 480×300 px et 40 Ko au plus, crédit affiché sous le bandeau. Sans photo, la vue aérienne IGN prend le relais |

⚠️ **L'`id` ne doit jamais changer** une fois le sommet publié : c'est la
clé des données personnelles (`progress.json`, dossiers photos et GPX de
chaque utilisateur). Pour corriger un nom, modifier `name` seulement. Pour un nouveau
sommet, prendre le nom en minuscules, sans accents, mots séparés par des
tirets.

`pytest` valide automatiquement le catalogue (champs, cotations, coordonnées, unicité des ids,
format des blocs `ski` / `snowshoe` / `image`, présence des fichiers photo) — lancé aussi par la
CI à chaque push.

(Les champs `done`, `comment`, `photos`, `gpx` ne font **pas** partie du
catalogue : ce sont des données personnelles, propres à chaque utilisateur
et gérées par le serveur dans `data/users/<identifiant>/progress.json`.)

Voir [`sources.md`](../sources.md) pour le barème de cotation et les sources de référence à
utiliser pour toute nouvelle entrée.
