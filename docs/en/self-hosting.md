# Self-hosting

[← Back to the README](../../README.en.md) · [Français](../auto-hebergement.md)

The project ships a ready-to-use `Dockerfile` + `docker-compose.yml` (the app + Caddy as a
reverse proxy). Requirements: Docker and Docker Compose on the server.

```bash
git clone https://github.com/celtill0s/Altus3k.git
cd Altus3k
```

1. **Start it**:

   ```bash
   mkdir -p data   # create it BEFORE the first start, see below
   docker compose up -d --build
   ```

   `data/` must exist and belong to uid 1000 (the container's non-root user): if Docker creates
   it at startup, it belongs to root and the app crashes (`PermissionError: '/data'`). Fix:
   `sudo chown -R 1000:1000 data`.

2. **Create your administrator account**:

   ```bash
   docker compose exec app python3 server/app.py create-admin <username>
   ```

   As long as no account exists, nobody can log in (the logs remind you:
   `docker compose logs app`).

   The site listens on `127.0.0.1:8087` (configurable in `docker-compose.yml`). Caddy does not
   check passwords (the app manages accounts itself) but shields the Python server: timeouts
   against deliberately slow connections, maximum request size. The app container is locked
   down (read-only file system except `data/`, no privileges).

3. **Expose it** behind your own reverse proxy or tunnel — the project assumes nothing specific:
   an existing Caddy or nginx, a Cloudflare Tunnel, a Tailscale Funnel… anything that points a
   domain name to `http://<your-server>:8087`. **HTTPS is required** on the public side (the
   session cookie is only sent over HTTPS).

4. **Update** later:

   ```bash
   ./update.sh
   ```

   (`git pull --ff-only` then `docker compose up -d --build`, without stopping the app first: if
   the pull fails, the current version keeps running. It never touches `data/`, which stays out
   of git.)

## Updating an instance from before accounts existed

<details>
<summary>Instances installed before accounts were introduced (Caddy Basic Auth, <code>secrets/</code> folder)</summary>

Earlier versions protected the site with Caddy's Basic Auth (`secrets/` files), with a single
data space. After `./update.sh`:

1. **Create your administrator account** — your existing data (`data/progress.json`, `photos/`,
   `gpx/`) is **automatically attached** to it (moved to `data/users/<username>/`; nothing is
   deleted or overwritten):

   ```bash
   docker compose exec app python3 server/app.py create-admin <username>
   ```

   Between `./update.sh` and this command, nobody can log in: run them back to back.

2. Open the site, log in, and create the other accounts from **Utilisateurs** (Users). The old
   read-only `operator` account no longer exists: create a **Guest** or **Member** account
   instead.

3. The `secrets/` folder is no longer used: you can delete it.

4. Android app: install the version that supports accounts (the old one used Basic Auth and can
   no longer log in).

Tip: back up `data/` first (`scripts/backup.sh`).

</details>

## Backups

Everything that matters for your instance (progress, notes, photos and videos, GPX tracks) lives
in `data/` — a plain folder you can back up like any other (copy, rsync, snapshot…).

`scripts/backup.sh` creates dated snapshots of `data/` with `rsync --link-dest` (unchanged files
are hard links: every snapshot is complete without duplicating disk space) and deletes those older
than 30 days. Variables: `BACKUP_ROOT` (default `~/backups-project3000summitFR`),
`RETENTION_DAYS`, `DATA_DIR`. Example crontab (every day at 3 am):

```cron
0 3 * * * /path/to/Altus3k/scripts/backup.sh >> ~/backup-summit.log 2>&1
```

Snapshots stay on the same disk as the app: they protect against accidental deletion, not
against hardware failure. Copy `BACKUP_ROOT` somewhere else for that.

## License: if you modify the code

The code is under the [GNU AGPL v3](../../LICENSE). If you host a **modified version** for other
people, you must give them access to its source code: publish your changes (a GitHub fork is
enough) and point the « code source » link in the ⚙ Paramètres (Settings) panel
(`static/index.html`, « À propos » section) to your repository. If you don't modify the code,
there is nothing to do.
