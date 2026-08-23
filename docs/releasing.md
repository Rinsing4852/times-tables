# Release Checklist

1. Update the matching version in `frontend/package.json`, `frontend/package-lock.json`, `backend/pyproject.toml`, and `backend/app/quests.py`.
2. Add or update repeatable migrations for every schema change.
3. Run backend tests, frontend tests, lint, production build, and Playwright desktop/phone journeys.
4. Build and start both Docker services, then verify `/`, `/backend-api/version`, and backend health.
5. Take an existing-data backup and test the migration against a copy where practical.
6. Commit and push to `main`.
7. Wait for all GitHub Actions jobs, including multi-architecture image publishing, to pass.
8. Confirm matching `latest`, version, and commit tags exist for frontend and backend in GHCR.
9. Create a GitHub release for the version tag with concise user-facing changes and upgrade notes. Release attachments are not required because Dockge pulls container images from GHCR.
10. Update a test Unraid installation before updating the main home instance.

Do not publish only one service image. The frontend and backend API contracts are released together.
