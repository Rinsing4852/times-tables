# Architecture

Recall Forge is a local-first web application with a Next.js frontend, FastAPI backend, and SQLite database. Runtime traffic stays inside the home LAN or Tailscale network.

## Request Flow

```text
Browser -> Next.js :3000 -> /backend-api proxy -> FastAPI :8000 -> SQLite /data/recall_forge.db
```

The hardened Unraid deployment exposes only the frontend. Browser requests use the same origin, and the frontend container reaches FastAPI through the private Compose network.

## Backend Boundaries

- `main.py`: HTTP routes, authentication, authorization, and transaction boundaries.
- `adaptive.py`: error, speed, spacing, and recent-attempt priority scoring.
- `scheduler.py`: acquisition states, review intervals, due checks, and practice-session composition.
- `learning.py`: attempt statistics, learning events, and session rewards.
- `profiles.py`: user payloads, required-table policy, and progress reset.
- `reports.py`: retention summaries and pseudonymous evaluation export.
- `quests.py`: rules-based quest generation and quest question variants.
- `creatures.py`: energy, XP, stages, cosmetics, and positive status language.
- `migrations.py`: ordered additive SQLite migrations.

## Frontend Boundaries

- `app/page.tsx`: authentication state, navigation, API orchestration, and focused learning modes.
- `components/CreatureExperience.tsx`: creature home, profile, and evolution views.
- `components/DashboardView.tsx`: parent statistics, retention, heat maps, and history.
- `components/AdminPanel.tsx`: local profile and export administration.
- `lib/types.ts`: shared API response contracts.
- `public/sw.js`: unauthenticated application-shell caching only. `/backend-api/*` is always network-only.

## Learning State

Each user/fact pair moves through:

```text
unseen -> acquiring -> reviewing -> secure
```

- Three successful first recalls in the latest five, including the latest two consecutively, start scheduled review.
- Review intervals advance through 1, 3, 7, 14, 30, and 60 days.
- A fact becomes secure after a successful 30-day review.
- A failed review shortens the interval; repeated lapses return the fact to acquisition.
- Second-attempt corrections are rewarded but do not count as independent retained recall.

Normal practice targets approximately 50% due reviews, 30% acquiring or weak facts, and 20% interleaved facts. Empty groups automatically redistribute to available facts, and every eligible fact retains a non-zero adaptive weight.

## Security Boundary

- Local cookie sessions are stored as SHA-256 token digests.
- Passcodes use PBKDF2-SHA256 with per-user salts.
- Admin routes verify the currently authenticated admin profile.
- The frontend sends no analytics and uses no external runtime service.
- Database backups and CSV exports require an authenticated admin.
- Containers run without extra capabilities or privilege in the hardened Compose file.
