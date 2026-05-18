# Recall Forge

Recall Forge is a self-hosted times tables practice app for local use. V1 is intentionally plain: local profiles, adaptive practice, challenge mode, heat maps, SQLite, no external login, no analytics, and no AI API. It also includes a light companion creature theme where practice gives the creature energy while the learning engine stays focused on recall and spaced practice.

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

For Unraid with Dockge, use `compose.dockge.yml` as the stack compose file. It is set up for LAN/Tailscale use:

- only the frontend port is exposed
- the backend stays on the private Docker bridge network
- SQLite is stored at `/mnt/user/appdata/times-tables/data/recall_forge.db`
- containers drop Linux capabilities
- `no-new-privileges` is enabled
- container filesystems are read-only except `/tmp`, frontend cache, and backend `/data`

Set `UNRAID_LAN_IP` to your Unraid LAN address before deploying, or replace the default `192.168.1.50` in the compose file:

```yaml
ports:
  - "${UNRAID_LAN_IP:-192.168.1.50}:3000:3000"
```

The data directory can also be overridden with `TIMES_TABLES_DATA_DIR`. On Unraid, the default is already:

```text
/mnt/user/appdata/times-tables/data
```

The browser should use:

```text
http://YOUR-UNRAID-IP:3000
```

The frontend calls the backend through a same-origin proxy at `/backend-api/*`, then the frontend container forwards those requests internally to:

```text
http://times-tables-backend:8000
```

This means port `8000` does not need to be exposed to your LAN.

## Local Development

Backend:

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

Backend adaptive selection tests:

```bash
cd backend
pytest
```

## V1 Features

- Multiple local user profiles.
- A safe creature companion per profile with type, name, energy, level, and stage.
- Practice mode with multiplication, reversed multiplication, division, and missing-factor prompts.
- One retry after an incorrect practice answer.
- Challenge mode with no visible timer and end-of-session summary.
- Per-user dashboard with accuracy and speed heat maps.
- Per-fact stats for correctness, first-attempt accuracy, second-attempt accuracy, response time, last seen, and recent failures.
- Rules-based adaptive priority scoring:

```text
priority_score = error_rate + slowness_score + spacing_score + recent_failure_boost - mastery_discount
```

Weak, slow, recently failed, or stale facts are selected more often. Consistently correct and fast facts gradually appear less often.

## Database Tables

The backend auto-creates tables on startup and seeds multiplication facts from 2x2 through 12x12.

- `users`
- `facts`
- `question_attempts`
- `fact_stats`
- `challenge_sessions`
- `challenge_attempts`

Creature state is stored on each local user profile:

- `creature_type`
- `creature_name`
- `energy`
- `last_practised_at`
- `total_questions_answered`
- `total_sessions_completed`

## API Overview

- `GET /users`
- `POST /users`
- `GET /facts`
- `GET /creature-types`
- `GET /users/{user_id}/creature`
- `PUT /users/{user_id}/creature`
- `POST /users/{user_id}/creature/session-complete`
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

Recall Forge is designed for a trusted local network or a single machine. It does not include authentication, remote accounts, or multi-device sync in V1.
