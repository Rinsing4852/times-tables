# Recall Forge

Recall Forge is a self-hosted times tables practice app for local use. V1 is intentionally plain: local profiles, adaptive practice, challenge mode, heat maps, SQLite, no external login, no analytics, and no AI API.

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

Stop the app:

```bash
docker compose down
```

The SQLite database is stored in the Docker volume `times-tables_backend-data`.

## Local Development

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The frontend expects the backend at `http://localhost:8000`. To override it, set:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Tests

Backend adaptive selection tests:

```bash
cd backend
pytest
```

## V1 Features

- Multiple local user profiles.
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

## API Overview

- `GET /users`
- `POST /users`
- `GET /facts`
- `POST /practice/question`
- `POST /practice/answer`
- `POST /challenge/start`
- `POST /challenge/submit`
- `GET /dashboard/{user_id}`

## Notes

Recall Forge is designed for a trusted local network or a single machine. It does not include authentication, remote accounts, or multi-device sync in V1.
