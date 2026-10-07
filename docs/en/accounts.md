# Accounts and roles

[← Back to the README](../../README.en.md) · [Français](../comptes.md)

The whole site sits behind a **login page** (no access without an account). Three roles:

| Role | Sees | Can modify |
|---|---|---|
| **Guest** (Invité) | the catalogue only (map, summits, grades, crampon, ski and snowshoe views) — nothing any user has added | nothing |
| **Member** (Membre) | **their own space**: summits done, notes, photos, GPX tracks | their space |
| **Administrator** | their space, plus any member's space (read-only, « Voir son espace » button) | their space + accounts |

- The administrator manages accounts from the **Utilisateurs** (Users) tab: creation (with a
  generated temporary password), role change, new password, deletion (with all the account's
  data). There is always at least one administrator left.
- Everyone can change their own password (**Mot de passe**); their other devices are then logged
  out.
- Security: passwords hashed with scrypt, session in an `HttpOnly`/`Secure`/`SameSite` cookie,
  protection against cross-site request forgery (CSRF), **temporary lockout after 5 failed
  logins** (per username and per IP address). Permissions are checked by the server on every
  request (the `ROUTES` table in `server/app.py`: any undeclared route is refused), and a test
  covers every route for every role (`tests/test_server_app.py`, "permission matrix").
- Data: `data/users.json` (accounts), `data/sessions.json` (sessions; only a hash of the token
  is stored), `data/users/<username>/` (each user's space).
- **5 GB maximum per user** (photos, videos, GPX; thumbnails not counted): beyond that, uploads
  are refused and a red banner stays on their space until they free some room. The admin sees
  each user's usage under « Utilisateurs ». Limit: `QUOTA_BYTES` in `server/storage.py`.
- Each member can **add their own summits** (+ Ajouter un sommet), place them on the map, then
  edit or delete them: they are only visible in their own space (`custom_peaks.json`).

## Admin commands

On the server:

```bash
docker compose exec app python3 server/app.py create-admin <username>   # first admin
docker compose exec app python3 server/app.py set-password <username>   # recovery (forgotten password)
docker compose exec app python3 server/app.py list-users
```

(Without Docker: `python3 server/app.py …`.) The password is typed at the prompt.
