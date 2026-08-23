# Recall Forge Learning Roadmap

Recall Forge should measure durable recall, not only whether an answer was correct during the current session. This roadmap keeps the existing adaptive selector stable while introducing acquisition, scheduled review, and retention in small migrations.

## Phase 1: Maintainable Boundaries

Status: complete.

- Keep `app/page.tsx` responsible for navigation and shared state.
- Keep creature, dashboard, and administration presentation in focused frontend components.
- Keep profile/table policy in `backend/app/profiles.py`.
- Keep attempt recording and session rewards in `backend/app/learning.py`.
- Preserve the existing API contract and learning behavior while moving code.

## Phase 2: Fact Learning State

Status: complete in 0.9.0.

Explicit per-user fact state is additive to `fact_stats`:

- `learning_state`: `unseen`, `acquiring`, `reviewing`, or `secure`.
- `due_at`: when the fact should next be retrieved.
- `interval_days`: current review interval.
- `successful_reviews`: consecutive successful scheduled reviews.
- `lapse_count`: first-attempt failures after a fact entered review.
- `last_retrieval_at`: most recent first-attempt retrieval.

Initial transition rules:

1. An unseen fact becomes `acquiring` after its first retrieval.
2. An acquiring fact becomes `reviewing` after three first-attempt successes in its latest five attempts, including two consecutive successes.
3. A successful scheduled review advances intervals through `1, 3, 7, 14, 30, 60` days.
4. A first-attempt failure shortens the interval and returns the fact to `acquiring` after repeated lapses.
5. A fact becomes `secure` only after successful reviews at both 14 and 30 days.

Second-attempt corrections remain valuable for feedback and XP, but do not count as successful independent retrievals.

## Phase 3: Session Composition

Status: complete in 0.9.0.

Each normal practice session is built from bounded groups:

- 50% due review facts.
- 30% acquiring or weak facts.
- 20% interleaved secure, stale, or unseen facts.

When a group has too few facts, redistribute its slots. Every eligible fact keeps a small non-zero selection chance, and the same fact should not appear twice in succession when alternatives exist.

The existing priority score remains the ordering signal within each group. This preserves responsiveness to errors, slow answers, recent failure, and spacing while making due reviews predictable.

## Phase 4: Retention Reporting

Status: complete in 0.9.0.

Parent-facing measures answer whether learning lasted:

- Facts due today and overdue.
- Facts acquiring, reviewing, and secure.
- Seven-day and thirty-day scheduled-review accuracy.
- Lapses after prior mastery.
- Retention by table.

Keep the child home screen simple. It may say that a review quest is ready, but detailed retention analytics remain in the dashboard.

## Phase 5: Home Evaluation

Status: available for ongoing home use.

For a home project, use anonymous local profile identifiers and export only aggregate results. Compare two four-week periods:

- Baseline: existing adaptive practice.
- Trial: due-review session composition.

Track first-attempt accuracy, median response time, seven-day retention, thirty-day retention where available, and practice completion. Do not compare children with one another and do not add leaderboards.

## Phase 6: Accessible Local Installation

Status: complete in 0.9.0.

- Installable manifest and local service worker.
- Offline reconnection screen without caching authenticated API data.
- Keyboard skip target, visible focus, reduced-motion behavior, and forced-colour support.
- Desktop and phone browser coverage for the focused learning and dashboard paths.

## Phase 7: Operations And Stewardship

Status: complete in 0.9.0.

- MIT license.
- Architecture, backup, restore, update, rollback, and release documentation.
- Coordinated frontend/backend versioning and multi-architecture image release checks.

## Acceptance Gates

- Existing practice, challenge, quest, XP, energy, and evolution behavior remains intact.
- Database migration is additive and repeatable on an existing SQLite file.
- Due-review calculations use the configured application timezone.
- Selection tests use a seeded random source or test pure composition functions.
- API tests cover unseen, acquisition, successful review, and lapse transitions.
- Docker images build and both services report healthy before deployment.
