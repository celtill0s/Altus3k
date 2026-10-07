# Auto-hébergement

[← Retour au README](../README.md)


Le projet fournit un `Dockerfile` + `docker-compose.yml` (appli + Caddy
en reverse proxy) prêts à l'emploi. Prérequis : Docker et Docker Compose
installés sur le serveur.

```bash
git clone https://github.com/celtill0s/Altus3k.git
cd Altus3k
```

1. **Lancer** :

   ```bash
   mkdir -p data   # à créer AVANT le premier lancement, voir ci-dessous
   docker compose up -d --build
   ```

   `data/` doit exister et appartenir à l'uid 1000 (l'utilisateur non-root
   du conteneur) : si Docker le crée lui-même au lancement, il appartient
   à root et l'appli plante (`PermissionError: '/data'`). Correction :
   `sudo chown -R 1000:1000 data`.

2. **Créer ton compte administrateur** :

   ```bash
   docker compose exec app python3 server/app.py create-admin <identifiant>
   ```

   Tant qu'aucun compte n'existe, personne ne peut se connecter (les logs
   le rappellent : `docker compose logs app`).

   Le site écoute sur `127.0.0.1:8087` (modifiable dans
   `docker-compose.yml`). Caddy ne vérifie pas de mot de passe (c'est
   l'appli qui gère les comptes) mais protège le serveur Python : délais
   d'expiration contre les connexions volontairement lentes, taille
   maximale des requêtes. Le conteneur de l'appli est verrouillé
   (système de fichiers en lecture seule sauf `data/`, aucun privilège).

3. **L'exposer** derrière ton propre reverse proxy / tunnel — le projet
   ne présuppose rien de particulier ici : un Caddy/nginx existant, un
   Cloudflare Tunnel, un Tailscale Funnel, etc. suffit à pointer un nom
   de domaine vers `http://<ton-serveur>:8087`. **HTTPS obligatoire** côté
   public (le cookie de session n'est envoyé qu'en HTTPS).

4. **Mettre à jour** plus tard :

   ```bash
   ./update.sh
   ```

   (`git pull --ff-only` puis `docker compose up -d --build`, sans arrêt
   préalable : si le pull échoue, l'appli continue de tourner avec la
   version actuelle. Ne touche jamais à `data/`, qui reste hors git).

## Mise à jour d'une instance d'avant les comptes

<details>
<summary>Instances installées avant l'arrivée des comptes (Basic Auth de Caddy, dossier <code>secrets/</code>)</summary>

Les versions précédentes protégeaient le site par la Basic Auth de Caddy
(fichiers `secrets/`), avec un seul espace de données. Après `./update.sh` :

1. **Créer ton compte administrateur** — tes données existantes
   (`data/progress.json`, `photos/`, `gpx/`) lui sont **automatiquement
   rattachées** (déplacées dans `data/users/<identifiant>/`, rien n'est
   supprimé ni écrasé) :

   ```bash
   docker compose exec app python3 server/app.py create-admin <identifiant>
   ```

   Entre `./update.sh` et cette commande, personne ne peut se connecter :
   enchaîne les deux.

2. Ouvre le site, connecte-toi, et crée les autres comptes depuis
   **👥 Utilisateurs** (l'ancien compte `operator` en lecture seule
   n'existe plus : crée à la place un compte **Invité** ou **Membre**).

3. Le dossier `secrets/` ne sert plus : tu peux le supprimer.

4. Appli Android : installe la version qui gère les comptes (l'ancienne
   utilisait la Basic Auth et ne peut plus se connecter).

Conseil : fais une sauvegarde de `data/` avant (`scripts/backup.sh`).

</details>

## Sauvegarde

Tout ce qui compte pour ton instance (progression, commentaires,
photos/vidéos, traces GPX) vit dans `data/` — un simple dossier à
sauvegarder comme n'importe quel autre (copie, rsync, snapshot…).

Le script `scripts/backup.sh` crée des snapshots datés de `data/` avec
`rsync --link-dest` (les fichiers inchangés sont des liens durs : chaque
snapshot est complet sans dupliquer l'espace disque), et purge ceux de
plus de 30 jours. Variables : `BACKUP_ROOT` (défaut
`~/backups-project3000summitFR`), `RETENTION_DAYS`, `DATA_DIR`.
Exemple de crontab (tous les jours à 3 h) :

```cron
0 3 * * * /chemin/vers/Altus3k/scripts/backup.sh >> ~/backup-summit.log 2>&1
```

⚠️ Les snapshots restent sur le même disque que l'appli : ils protègent
d'une suppression accidentelle, pas d'une panne matérielle. Copie
`BACKUP_ROOT` ailleurs pour ça.
