# Fonctionnalités en détail

[← Retour au README](../README.md)


- **Filtres** (panneau ⚙ Paramètres) : par massif (Alpes/Pyrénées), par cotation (T2, T3, T4)
  et par statut (fait, à faire, envies) ; recherche texte libre (nom, massif) en haut de la liste.
- **Fonds de carte** : par défaut **« Auto »** — OpenStreetMap quand la
  carte est dézoomée, Plan IGN dès que l'échelle affiche 20 km — zoom 9 (constante
  `IGN_FROM_ZOOM` dans `static/js/map.js`) ; ou au choix Plan IGN, photos
  aériennes IGN, OpenStreetMap. Plus une surcouche IGN des **pentes > 30°** (zones
  potentiellement avalancheuses). Flux publics de la Géoplateforme IGN,
  sans clé. Les tuiles IGN sont vides hors de France : pour le versant
  espagnol ou italien d'un sommet frontalier, basculer sur OpenStreetMap.
  Le fond choisi est mémorisé par le navigateur. (Le SCAN 25, la carte
  topo « randonnée » IGN, n'est pas disponible sans clé personnelle.)
- **Échelle** métrique en bas de la carte.
- **Voir tous / Regrouper** (bouton œil) : affiche chaque sommet à sa vraie position au lieu de
  les regrouper par secteur.
- **Me localiser** : bouton cible (près du zoom) qui affiche ta position
  GPS en direct (point bleu + cercle de précision) et recentre la carte
  une fois ; second appui pour arrêter.
- **Application installable (PWA)** : sur Android, Chrome propose
  « Installer l'application » (menu ⋮) ; sur iPhone, Safari → Partager →
  « Sur l'écran d'accueil ». L'appli s'ouvre alors en plein écran avec sa
  propre icône, et se met à jour toute seule avec le site. Un service
  worker (`static/sw.js`) la rend utilisable **hors-ligne** pour ce qui a
  déjà été consulté avec du réseau : l'appli elle-même, la liste des
  sommets, les photos et les tuiles de carte déjà affichées (3 000 max).
  Hors-ligne, les modifications (coché, commentaire, upload) échouent avec
  un message : elles ne sont pas mises en attente.
- **Appli Android (APK)** : alternative à la PWA qui ne dépend d'aucun
  navigateur, avec écran de connexion (compte du site ; seule la session
  est mémorisée, chiffrée — jamais le mot de passe). Téléchargeable depuis les **Releases** GitHub ; voir
  [`android/README.md`](android/README.md) pour l'installation et la
  publication d'une nouvelle version.
- **Suivi "sommet fait"**, **commentaire personnel**, **photos et
  vidéos** (avec visionneuse plein écran et défilement entre médias) et
  **trace GPX par sommet** (import, profil altimétrique, dénivelé,
  export) : tout est enregistré immédiatement côté serveur, visible
  depuis n'importe quel appareil qui se connecte à la même instance.
- **Vidéos** servies avec support des requêtes `Range` (avance rapide,
  lecture sur iPhone/Safari) ; les uploads sont écrits sur disque au fil
  de l'eau, jamais chargés entièrement en mémoire (confortable sur un
  Raspberry Pi, même pour une vidéo de 500 Mo).
- **Miniatures et HEIC** : si [Pillow](https://python-pillow.org/) (et
  `pillow-heif`) est installé — c'est le cas dans l'image Docker —, la
  grille affiche des miniatures JPEG générées à la demande, et les photos
  HEIC d'iPhone sont converties en JPEG pour être visibles dans tous les
  navigateurs. Sans Pillow, les originaux sont servis tels quels.
  En local : `pip install -r requirements.txt`.
- **Vues crampons + piolet, ski et raquettes** : une carte par activité, avec sa liste
  (recherche, puces de cotation), ses avertissements de sécurité, la même fiche de sommet complétée
  d'un bloc itinéraire, et les pentes > 30° affichées par défaut. Données : champs `crampon`,
  `ski` et `snowshoe` du catalogue (voir [Modifier le catalogue](catalogue.md)). On peut y
  ajouter ses propres sommets, rattachés à l'activité.
- **Mes 3000** : anneau de progression sur les 45 sommets du catalogue, détail par massif,
  dernières ascensions datées et liste d'envies (dépliables, un toucher ouvre le sommet).
- **Date d'ascension et envies** : cocher « fait » enregistre la date du jour, modifiable dans
  la fiche ; ★ Envie marque les sommets à faire en priorité (marqueur étoile, filtre « Envies »).
- **Profil GPX interactif** : glisser sur le profil altimétrique déplace un point sur la trace,
  et survoler la trace place le curseur sur le profil.
