# Recall Forge

Recall Forge 0.8.0 is a self-hosted times tables practice app for local use. It is intentionally focused: authenticated local profiles, adaptive practice, smart training quests, challenge mode, heat maps, SQLite, no external accounts, no analytics, and no AI API. It also includes a light companion creature theme where practice gives the creature energy and XP while the learning engine stays focused on recall and spaced practice. Each species has a distinct five-stage evolution path and a dedicated transformation moment, but remains a calm maths companion rather than a needy care system.

## Stack

- Frontend: Next.js
- Backend: FastAPI
- Database: SQLite
- Runtime: Docker Compose

## Run With Docker

From this folder:

```bash
docker compose up -d
```

Then open:

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API health check: http://localhost:8000/health

The local development compose file exposes both services to your machine for easier debugging. For Unraid/Dockge, use the hardened compose file below so only the frontend is exposed.

Stop the app:

```bash
docker compose down
```

The SQLite database is stored in the Docker volume `times-tables_backend-data`.

## Unraid / Dockge

For Unraid with Dockge, use `compose.dockge.yml`. It pulls prebuilt `amd64`/`arm64` images from GitHub Container Registry, so Dockge can update Recall Forge without cloning the source or rebuilding Next.js and FastAPI on the server. It is set up for LAN/Tailscale use:

- only the frontend port is exposed
- the backend stays on the private Docker bridge network
- SQLite is stored at `/mnt/user/appdata/times-tables/data/recall_forge.db`
- the hardened backend runs as UID/GID `1000:1000`
- light runtime limits are set for memory, CPU, and process count
- containers drop Linux capabilities
- `no-new-privileges` is enabled
- container filesystems are read-only except `/tmp`, frontend cache, and backend `/data`
- the app containers do not receive the Docker socket and cannot control other containers

Before deploying, copy `.env.unraid.example` to `.env` in the Dockge stack folder and confirm `UNRAID_LAN_IP` is your Unraid LAN address. Compose now stops with a clear error when this value is missing instead of binding to an incorrect example address:

```bash
cp .env.unraid.example .env
```

Or set `UNRAID_LAN_IP` directly in Dockge:

```yaml
ports:
  - "${UNRAID_LAN_IP:?Set UNRAID_LAN_IP in .env}:${RECALL_FORGE_PORT:-3000}:3000"
```

If another application already uses port `3000`, set `RECALL_FORGE_PORT=3001` in `.env` and open Recall Forge on port `3001` instead.

The data directory can also be overridden with `TIMES_TABLES_DATA_DIR`. On Unraid, the default is already:

```text
/mnt/user/appdata/times-tables/data
```

### First Dockge Installation

Create a Recall Forge stack in Dockge and paste in `compose.dockge.yml`, or place that file in the stack folder as `compose.yaml`. Add the values from `.env.unraid.example` to the stack environment and start it.

The images used by the stack are:

```text
ghcr.io/rinsing4852/recall-forge-backend:latest
ghcr.io/rinsing4852/recall-forge-frontend:latest
```

Public GHCR images can be pulled anonymously. No GitHub token is stored on Unraid.

### One-Click Updates

Every tested push to `main` publishes new `latest`, version-numbered, and commit-specific images. To update:

1. Open the Recall Forge stack in Dockge.
2. Click **Update**.
3. Dockge pulls both images and recreates the services.
4. Open Settings in Recall Forge and confirm the displayed version.

The terminal equivalent is:

```bash
docker compose pull
docker compose up -d
```

No `git pull`, source checkout, `--build`, GitHub release attachment, or in-app Docker access is required. Database migrations run automatically when the new backend starts.

### Move An Existing Source-Build Stack

For an existing installation that currently builds from `/mnt/user/appdata/recallforge-source`, you can update it from the terminal with the image-based file:

```bash
cd /mnt/user/appdata/recallforge-source
git pull origin main
docker compose -f compose.dockge.yml pull
docker compose -f compose.dockge.yml up -d --force-recreate
```

The persistent data path is unchanged, so profiles, statistics, creatures, and progress remain in place.

Running these commands from `recallforge-source` does not transfer ownership of the stack to Dockge. Dockge will show it as active but not managed. Terminal updates will continue to work normally.

To make the stack manageable through Dockge:

1. Take a Recall Forge backup from the admin settings.
2. In Dockge, create a new stack named `recall-forge` and paste the contents of `compose.dockge.yml` into its compose editor.
3. Add `UNRAID_LAN_IP`, `RECALL_FORGE_PORT`, `TIMES_TABLES_DATA_DIR`, `APP_TIMEZONE`, and `ADMIN_PASSWORD_MIN_LENGTH` from `.env.unraid.example` to the stack environment.
4. Stop the old terminal-managed stack with `docker compose -f compose.dockge.yml down` from `/mnt/user/appdata/recallforge-source`.
5. Start the new stack in Dockge.

`docker compose down` removes the old containers and network, but it does not remove the bind-mounted SQLite database under `/mnt/user/appdata/times-tables/data`. Do not add `--volumes` and do not delete that data directory.

### Pin Or Roll Back An Image

For controlled updates, replace `latest` on both `image:` lines with the same version, for example:

```yaml
image: ghcr.io/rinsing4852/recall-forge-backend:0.8.0
image: ghcr.io/rinsing4852/recall-forge-frontend:0.8.0
```

Keep both services on the same version. Take an admin database backup before rolling back across versions that include schema changes.

### Source-Build Fallback

`compose.dockge.build.yml` retains the hardened local-build deployment for development and recovery. It requires the full repository and updates with:

```bash
git pull origin main
docker compose -f compose.dockge.build.yml up -d --build --force-recreate
```

Your SQLite learning data should remain in:

```text
/mnt/user/appdata/times-tables/data/recall_forge.db
```

Do not delete the data folder unless you intentionally want to reset the app.

The browser should use:

```text
http://YOUR-UNRAID-IP:RECALL_FORGE_PORT
```

The frontend calls the backend through a same-origin proxy at `/backend-api/*`, then the frontend container forwards those requests internally to:

```text
http://times-tables-backend:8000
```

This means port `8000` does not need to be exposed to your LAN.

### Common Unraid Troubleshooting

If Dockge reports `manifest unknown`, wait for the GitHub Actions `CI` workflow to finish publishing the requested version and try again.

If Dockge reports `denied`, confirm both GHCR packages are public or authenticate Docker to GHCR. Public packages are recommended for this public repository.

If the frontend starts but the app cannot load data, check that `BACKEND_INTERNAL_URL` is set to:

```text
http://times-tables-backend:8000
```

If the app resets after redeploy, check that the data mount points to the persistent Unraid appdata folder and not a temporary container path.

## Local Development

Backend:

Python 3.9 or newer is required.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

By default, the frontend browser calls relative paths under `/backend-api`, and the Next.js server proxies those requests to the backend. For local development this falls back to `http://localhost:8000`. To override the server-side backend target, set:

```bash
BACKEND_INTERNAL_URL=http://localhost:8000
```

## Tests

Backend unit and API integration tests:

```bash
cd backend
pytest
```

Frontend smoke tests:

```bash
cd frontend
npm test
```

## Current Features

- Multiple authenticated local profiles. The first profile is the admin and requires a passcode of at least six characters by default.
- Admin profiles can create other admins, rename profiles, reset passcodes, reset progress, and delete profiles.
- A safe creature companion per profile with type, name, energy, XP, level, stage, weekly goal, cosmetic unlocks, and 30 lightweight species-stage SVGs.
- A visual five-stage growth path, six-species picker, and positive full-screen evolution moment.
- Smart training quests generated from fact accuracy, speed, and recent mistakes.
- A higher-reward explorer quest encourages tables that have had little or no practice.
- Practice and challenge modes can be set to multiplication only, division only, or mixed questions.
- Practice opens with a simple setup screen before the distraction-free answer surface.
- Practice mode with multiplication, reversed multiplication, division, and missing-factor prompts.
- One retry after an incorrect practice answer.
- Challenge mode with no visible timer and end-of-session summary.
- Per-user dashboard with accuracy and speed heat maps plus progress over time.
- Per-fact stats for correctness, first-attempt accuracy, second-attempt accuracy, response time, last seen, and recent failures.
- Rules-based adaptive priority scoring:

```text
priority_score = error_rate + slowness_score + spacing_score + recent_failure_boost - mastery_discount
```

Weak, slow, recently failed, or stale facts are selected more often. Consistently correct and fast facts gradually appear less often.
Recent performance uses the latest attempts for each fact, so strong facts appear less often while never disappearing entirely.

## Database Tables

The backend applies ordered, repeatable schema migrations, auto-creates tables on startup, and seeds multiplication facts from 2x2 through 12x12.

- `users`
- `auth_sessions`
- `facts`
- `question_attempts`
- `fact_stats`
- `learning_sessions`
- `learning_session_questions`
- `challenge_sessions`
- `challenge_attempts`
- `training_quests`

Creature state is stored on each local user profile:

- `is_admin`
- `password_hash`
- `password_salt`
- `password_updated_at`
- `creature_type`
- `creature_name`
- `energy`
- `xp`
- `level`
- `stage`
- `last_practised_at`
- `total_questions_answered`
- `total_sessions_completed`
- `unlocked_cosmetics`
- `selected_cosmetic`
- `weekly_practice_days`
- `last_weekly_reset_at`

## API Overview

- `GET /users`
- `POST /users`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /admin/{admin_user_id}/users`
- `POST /admin/{admin_user_id}/users`
- `PATCH /admin/{admin_user_id}/users/{target_user_id}`
- `POST /admin/{admin_user_id}/users/{target_user_id}/reset-progress`
- `DELETE /admin/{admin_user_id}/users/{target_user_id}`
- `GET /admin/{admin_user_id}/backup`
- `GET /admin/{admin_user_id}/progress.csv`
- `GET /version`
- `GET /facts`
- `GET /creature-types`
- `GET /users/{user_id}/creature`
- `PUT /users/{user_id}/creature`
- `PUT /users/{user_id}/creature/cosmetic`
- `GET /users/{user_id}/quests`
- `POST /users/{user_id}/quests/{quest_id}/start`
- `POST /practice/start`
- `POST /practice/question`
- `POST /practice/answer`
- `POST /challenge/start`
- `POST /challenge/submit`
- `GET /dashboard/{user_id}`

When accessed through the frontend, these same backend routes are available through `/backend-api`, for example:

```text
/backend-api/users
/backend-api/dashboard/1
```

## Notes

Recall Forge is designed for a trusted local network or Tailscale. Profile sessions use an HttpOnly, same-site cookie and server-side authorization; it does not provide internet-facing identity, password recovery email, or multi-device data sync. Existing profiles created before 0.5.0 may initially have a blank passcode, so set an admin passcode after upgrading. Set `COOKIE_SECURE=true` only when the app is served over HTTPS.

Practice, quest, and challenge rewards are calculated from questions issued and recorded by the backend. Repeating a completion request cannot award the same session twice.

The admin backup download is a consistent SQLite database snapshot. To restore it, stop the stack, replace the persistent `recall_forge.db` with the downloaded file, preserve ownership for UID/GID `1000:1000` on Unraid, and restart the stack.
