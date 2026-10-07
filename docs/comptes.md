# Comptes et rôles

[← Retour au README](../README.md) · [English](en/accounts.md)

Tout le site est derrière une **page de connexion** (aucun accès sans
compte). Trois rôles :

| Rôle | Voit | Peut modifier |
|---|---|---|
| **Invité** | le catalogue seul (carte, sommets, cotations, vues crampons, ski et raquettes) — rien de ce qu'un utilisateur a ajouté | rien |
| **Membre** | **son propre espace** : ses sommets faits, commentaires, photos, traces GPX | son espace |
| **Administrateur** | son espace, et l'espace de n'importe quel membre (lecture seule, bouton « Voir son espace ») | son espace + les comptes |

- L'administrateur gère les comptes depuis l'onglet **👥 Utilisateurs** :
  création (avec mot de passe provisoire généré), changement de rôle,
  nouveau mot de passe, suppression (avec toutes les données du compte).
  Il reste toujours au moins un administrateur.
- Chacun peut changer son propre mot de passe (**🔑 Mot de passe**) ; ses
  autres appareils sont alors déconnectés.
- Sécurité : mots de passe hachés (scrypt), session dans un cookie
  `HttpOnly`/`Secure`/`SameSite`, protection contre les requêtes forgées
  (CSRF), **blocage temporaire après 5 échecs de connexion** (par
  identifiant et par adresse IP). Les droits sont vérifiés par le serveur
  sur chaque requête (table `ROUTES` de `server/app.py` : toute route non
  déclarée est refusée), et un test couvre chaque route pour chaque rôle
  (`tests/test_server_app.py`, « matrice des droits »).
- Données : `data/users.json` (comptes), `data/sessions.json` (sessions,
  seule l'empreinte du jeton est gardée), `data/users/<identifiant>/`
  (espace de chaque utilisateur).
- **5 Go maximum par utilisateur** (photos, vidéos, GPX ; miniatures non
  comptées) : au-delà, les envois sont refusés et un bandeau rouge reste
  affiché sur son espace tant qu'il n'a pas libéré de place. L'admin voit
  l'espace occupé par chacun dans « Utilisateurs ». Limite modifiable :
  `QUOTA_BYTES` dans `server/storage.py`.
- Chaque membre peut **ajouter ses propres sommets** (➕ Ajouter un sommet),
  les placer sur la carte, puis les modifier ou les supprimer : ils ne sont
  visibles que dans son espace (`custom_peaks.json`).

## Commandes d'administration

Sur le serveur :

```bash
docker compose exec app python3 server/app.py create-admin <identifiant>   # premier admin
docker compose exec app python3 server/app.py set-password <identifiant>   # secours (mot de passe oublié)
docker compose exec app python3 server/app.py list-users
```

(sans Docker : `python3 server/app.py …`). Le mot de passe est demandé au
clavier.
