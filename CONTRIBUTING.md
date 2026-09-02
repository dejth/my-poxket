# Contributing to My Poxket

My Poxket is maintained as a small personal application and public portfolio.
Changes should be narrowly scoped, testable, and safe for a public repository.

## Before changing code

1. Read `AGENTS.md`, `README.md`, `PROJECT.md`, and relevant ADRs.
2. Inspect the current branch, status, history, scripts, migrations, and runtime
   configuration.
3. Preserve unrelated work.
4. Confirm the accepted behavior and validation plan.

## Public-safety rules

Use fictional data only. Never add real financial details, `.env` files,
database dumps, production backups, credentials, private keys, deployment
coordinates, production screenshots, personal logs, or sensitive source maps.

Before proposing a commit or push:

```bash
git status --short
git diff --cached --name-only
npm run validate
npm run secret:scan
docker compose config --quiet
git diff --check
```

Also inspect environment examples, generated output, logs, screenshots, and Git
history, then run the repository's approved secret scanner when configured.

## Code conventions

- Use strict TypeScript and explicit boundary validation.
- Keep financial and calendar rules outside React and HTTP handlers.
- Store money as integer minor units.
- Treat calendar dates separately from UTC event timestamps.
- Import components and modules directly; avoid broad barrel files.
- Add code-based tests for every behavior and boundary change.
- Do not claim visual UAT passed until the owner confirms it.

## Delivery workflow

The long-lived branch flow is `main` → `release` → `develop`. Start each
implementation from `develop` on a focused `tasks/<issue>-<slug>` branch and
open its pull request back into `develop`. After CI and the approved review
checkpoint pass, merge the pull request and delete the verified merged task
branch.

Promoting `develop` into `release`, or `release` into `main`, remains a separate
release checkpoint. Do not push feature work directly to any long-lived branch.
Production promotion, migration, and deployment require their own explicit
approval.
