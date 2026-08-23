# Home Evaluation

This protocol is intended for a family to check whether Recall Forge is helping durable recall. It is not a clinical study and should not be used to compare children.

## Question

Does scheduled review improve first-attempt recall without making practice harder to complete?

## Four-Week Check

1. Use the app normally for four weeks.
2. Aim for the existing soft weekly goal, without adding streak pressure or punishment.
3. At the end of each week, use **Settings -> Export evaluation CSV** from an admin profile.
4. Keep the exports locally. They contain pseudonymous profile keys and daily aggregates, not names, prompts, or answers.
5. Compare week 1 with week 4 for each profile key.

## Measures

- First-attempt accuracy: independent retrieval before hints or retries.
- Median response time: less distorted by a single interruption than the mean.
- Scheduled-review accuracy: performance only when a fact was actually due.
- Practice volume: enough attempts to interpret accuracy responsibly.
- Completion experience: whether sessions still feel manageable to the child.

Treat fewer than 20 scheduled reviews as insufficient evidence. An improvement in speed is useful only when accuracy remains stable or improves.

## Interpretation

Positive evidence is a rise in scheduled-review accuracy or stable accuracy at longer intervals. A temporary fall can occur when the app introduces previously unseen or weak facts, so inspect practice volume and the dashboard state counts alongside percentages.

Do not use the export for sibling rankings, rewards based on perfection, or pressure around missed days. The goal is to improve the learning engine, not evaluate the child.

## Data Handling

- Store exports on the same private home system as the app.
- Delete exports when they are no longer useful.
- Do not publish profile-level results.
- Take an admin database backup before upgrades that change learning-state behavior.
