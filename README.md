# My Poxket

My Poxket is a private, responsive personal-finance application for recording
income, expenses, credit-card activity, installments, recurring expenses, and
upcoming payables without mixing spending activity with payment obligations.

The source repository is public as a portfolio project. The production
application and financial data remain private and require authentication.

## Product vision

My Poxket should make the next financial action obvious: what happened this
month, what still needs to be paid, and whether every installment or recurring
item is on track. The product is intentionally designed for a small, private
installation rather than as a public multi-tenant service.

## Planned core features

- Income and expense transactions with safe correction and filtering.
- Categories that can be deactivated without breaking history.
- Credit cards with monthly cut-off and provider due-day rules.
- Finite installment plans with exact `N/N` progress and a paid/unpaid state.
- Open-ended recurring expenses with idempotent monthly occurrences.
- Separate monthly activity and upcoming-payables views.
- Deliberate mobile and desktop experiences.

## Architecture

```text
Browser
  -> React + Vite static CSR application
  -> same-origin HTTPS /api
  -> Fastify TypeScript API on Plesk Node.js
  -> MariaDB
```

The frontend never connects directly to MariaDB. Financial and calendar rules
live in pure domain modules rather than React components or HTTP handlers.

### Stack

- React, Vite, and strict TypeScript.
- Fastify TypeScript API.
- Drizzle ORM with versioned SQL migrations.
- MariaDB 11.8 for local development through Docker Compose.
- npm workspaces with one lockfile.
- Vitest and Testing Library for code-based tests.
- CSS design tokens and focused, accessible components.

Production targets Node.js 24 LTS. Node.js 25 is an end-of-life release and is
not an approved production runtime even if it remains selectable in Plesk.

## Responsive UX approach

The “Calm Ledger” design direction uses a warm neutral canvas, dark ink, and
semantic teal, amber, and red states paired with text labels. Mobile begins at
320 CSS pixels with 44-pixel minimum interactive targets. Desktop layouts use
the additional width for comparison, filters, and summary hierarchy rather
than stretched mobile cards.

## Local setup

Prerequisites:

- Node.js 24 LTS and npm 11 or later.
- Docker with Docker Compose.

```bash
cp .env.example .env
# Replace every placeholder with local-only fictional credentials.

npm install
docker compose up -d database
npm run db:migrate --workspace @my-poxket/api
npm run auth:bootstrap --workspace @my-poxket/api
npm run categories:init --workspace @my-poxket/api
npm run dev
```

The development owner username/password come from the ignored `.env` file.
They must never be copied into source, documentation, screenshots, or logs.

`categories:init` adds 21 general-purpose income/expense categories and is safe
to rerun without overwriting existing categories or financial history. It uses
the configured API database and does not insert sample transactions. See the
[Issue #7 UAT checklist and fictional dataset](docs/uat/issue-7.md) for details.

Open `http://127.0.0.1:5173`. Vite proxies `/api` to the local Node API.

## Testing and validation

```bash
npm run validate
npm run secret:scan
docker compose config --quiet
git diff --check
```

Validation covers formatting, linting, strict type checking, code-based tests,
and production builds. Manual responsive and visual UAT is performed by the
project owner through the local Node/Vite application; automated browser or
computer-control UAT is intentionally not part of the development workflow.

## Deployment overview

The frontend `dist` directory will be deployed as static assets. The API will
run as one Plesk Node.js application outside the public static directory, with
`/api` routed to it on the same origin. Secrets belong in Plesk environment
configuration, never in the frontend bundle or repository.

Before production deployment, the exact Plesk Node LTS availability, document
root, application root, startup file, routing, environment configuration,
backup process, and migration procedure must be verified. Local development
data may be exported as an ignored SQL artifact for a controlled Plesk database
import, but only after confirming it contains no real or sensitive data.

## Portfolio safety

There is no online demo. Portfolio screenshots are deferred until after production deployment and, when added,
will be captured locally using fictional data and reviewed before publication.
Production screenshots, database dumps, `.env` files, credentials, logs,
source maps, and real financial information must never enter the repository.

## Project status

Bootstrap and authentication foundation from Issue #1 is complete. Transactions
and categories from Issue #2 are implemented and passed owner UAT.
Credit cards and derived statements from Issue #3 and installment tracking from
Issue #4 are complete and passed owner UAT. Recurring expenses from Issue #5 are
also complete and passed owner UAT. Monthly activity and upcoming payables from
Issue #6 are complete and passed owner UAT. Roadmap Issue #9 links the remaining
responsive-polish and production-readiness phases. Issue #7 also adds
general-purpose starter income/expense categories with repeatable initialization
that preserves existing data. Issue #8 supplies deployment instructions, server
scripts, and inspected build artifacts for the owner to deploy to Plesk, plus
backup/rollback guidance and a post-deploy checklist.

See [PROJECT.md](./PROJECT.md) for the delivery plan and recorded decisions.

Issue #16 adds owner-managed accounts at `/users`: name, username, and password
only. Accounts share the same private ledger. Apply the new forward migration
before running this revision; existing accounts keep their credentials and use
their username as the initial name. See [user-management UAT](docs/uat/users.md).

## License

Licensed under the [MIT License](./LICENSE).
