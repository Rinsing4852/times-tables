# Recall Forge

Recall Forge 0.7.0 is a self-hosted times tables practice app for local use. It is intentionally focused: authenticated local profiles, adaptive practice, smart training quests, challenge mode, heat maps, SQLite, no external accounts, no analytics, and no AI API. It also includes a light companion creature theme where practice gives the creature energy and XP while the learning engine stays focused on recall and spaced practice. Each species has a distinct five-stage evolution path and a dedicated transformation moment, but remains a calm maths companion rather than a needy care system.

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

For Unraid with Dockge, use `compose.dockge.yml` from the cloned repository. Its relative build paths require the compose file, `backend`, and `frontend` to remain together in the repository root. It is set up for LAN/Tailscale use:

- only the frontend port is exposed
- the backend stays on the private Docker bridge network
- SQLite is stored at `/mnt/user/appdata/times-tables/data/recall_forge.db`
- the hardened backend runs as UID/GID `1000:1000`
- light runtime limits are set for memory, CPU, and process count
- containers drop Linux capabilities
- `no-new-privileges` is enabled
- container filesystems are read-only except `/tmp`, frontend cache, and backend `/data`

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

### Private GitHub Repo

You do not need to create a GitHub release to update Unraid. Pull the latest `main` branch into the existing private clone, then rebuild the stack.

For a private repo, use one of these approaches:

- Clone the repo onto Unraid with your GitHub credentials or a fine-grained token that has read access to this repo.
- Keep the repo cloned locally on Unraid and run the Dockge compose file from that repository root.
- GitHub remote build contexts are an alternative only when Dockge/Docker has credentials configured for the private repo; they are not used by the supplied compose file.

If you previously could not find the repo at `/mnt/user/appdata/times-tables`, check where it actually lives:

```bash
find /mnt/user/appdata -maxdepth 4 -name .git -type d
```

In your earlier setup the repo was found at:

```text
/mnt/user/appdata/recallforge
```

Use that path for updates if it is still where the repo lives.

### Update On Unraid

From a terminal on Unraid, update the cloned repo:

```bash
cd /mnt/user/appdata/recallforge
git pull
```

Then rebuild/recreate the stack. If using the terminal from the repo folder:

```bash
docker compose -f compose.dockge.yml up -d --build --force-recreate
```

If using Dockge:

1. Open the Recall Forge stack.
2. Pull/update the repo if Dockge does not do this automatically.
3. Click update/redeploy/recreate so the images rebuild.
4. Check the frontend logs and backend logs for startup errors.

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

If `git pull` says `fatal: not a git repository`, you are in the wrong folder. Run the `find /mnt/user/appdata -maxdepth 4 -name .git -type d` command above, then `cd` to the parent folder of the `.git` directory.

If Dockge cannot find `backend` or `frontend`, its stack folder is not the repo root. Either move/copy the repo contents into the Dockge stack folder, use relative contexts like `./backend`, or use GitHub remote build contexts.

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
