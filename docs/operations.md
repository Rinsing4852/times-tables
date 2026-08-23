# Operations

## Health Checks

```bash
curl --fail http://YOUR-SERVER-IP:3000/
docker compose ps
docker compose logs --tail=100 frontend backend
```

The backend also exposes `/health`, but the hardened Unraid deployment keeps backend port `8000` private. Checking the frontend confirms both the browser entry point and container are available.

## Backup

Use **Settings -> Download backup** while logged in as an admin. The resulting SQLite file is a consistent snapshot.

For an additional filesystem backup, stop the stack before copying `/mnt/user/appdata/times-tables/data/recall_forge.db`. Include `-wal` and `-shm` files if copying while containers are running.

## Restore

1. Stop the Recall Forge stack.
2. Keep the current database as a rollback copy.
3. Place the backup at `/mnt/user/appdata/times-tables/data/recall_forge.db`.
4. Set ownership to the UID/GID configured for the backend container.
5. Start the stack and inspect logs for migration errors.

## Update

In Dockge, click **Update** to pull the current GHCR images. From a terminal:

```bash
docker compose pull
docker compose up -d --force-recreate
```

Keep frontend and backend on the same version tag. Create a backup before changing versions.

## Rollback

Pin both image lines to the previous matching version and recreate the stack. If the release included a database migration, restore the pre-update database backup before starting the older backend.

## Resource Checks

```bash
docker stats --no-stream
docker compose logs --since=24h frontend backend
```

SQLite is suitable for the expected single-family workload. Investigate repeated container restarts, database-lock errors, sustained memory growth, or a full appdata filesystem.
