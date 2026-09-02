# My Poxket Project Decisions

## Confirmed product configuration

| Setting               | Decision                                               |
| --------------------- | ------------------------------------------------------ |
| Primary currency      | THB                                                    |
| Decimal places        | 2                                                      |
| Financial rounding    | Round half up                                          |
| Installment remainder | Applied to the final installment                       |
| IANA timezone         | Asia/Bangkok                                           |
| Frontend              | React + Vite static CSR                                |
| API                   | TypeScript Node.js with Fastify                        |
| Local database        | MariaDB 11.8.6 through Docker Compose                  |
| Package manager       | npm workspaces, one lockfile                           |
| Design direction      | Calm Ledger, CSS tokens, accessible focused components |
| Online demo           | None                                                   |
| License               | MIT                                                    |

## Runtime decision

Development and production target Node.js 24 LTS. The reported Plesk runtime
Node.js 25.9.0 is not accepted because that release line is end-of-life. Before
deployment, Plesk must make a currently supported Node LTS version available.

MariaDB 11.8.6 is used locally to match the reported production series. The
exact production server settings, privileges, backup process, and import limits
remain deployment-time verification items.

## Authentication

- Credentials are username and password.
- Development bootstrap credentials come from an ignored local `.env`.
- `.env.example` contains placeholders only.
- Passwords are hashed with Argon2id.
- Sessions are server-managed; only an opaque token is sent in an HttpOnly
  cookie and only its SHA-256 hash is stored in the database.
- A normal session expires after 24 hours.
- “Remember me” expires after 7 days.
- State-changing authenticated requests require a CSRF token.
- Login errors are generic and login attempts are rate-limited.
- Production owner provisioning uses a controlled one-time CLI command with
  secrets supplied outside the repository.
- There is no public registration or password recovery.

The schema permits `owner` and `member` login credentials that share the same
private ledger. This is not multi-tenancy and does not create separate finance
data per account. Account-management UI is not included in Bootstrap and needs
confirmation before implementation.

## Money and dates

- Persist amounts as positive integer minor units.
- Direction comes from income/expense classification, not amount sign.
- Parse and round decimal input without binary floating point.
- Apply round-half-up at two THB decimal places.
- When a total cannot divide evenly across installments, apply the remainder
  to the final installment so occurrences sum exactly to the original total.
- Treat transaction, due, and payment dates as local calendar dates.
- Store event timestamps in UTC.
- Apply calendar-month arithmetic and clamp unavailable days to month end.

## Transactions and categories

- Categories are typed as `income` or `expense`, start empty, and can be
  deactivated without breaking historical references.
- Transactions use positive THB minor units up to `999,999,999.99`, with an
  explicit income/expense direction and local calendar date.
- Initial non-card payment methods are cash, bank transfer, debit card, and
  other. Credit-card transaction entry remains disabled until Issue #3.
- Corrections preserve the immutable original as `superseded` and create one
  linked replacement atomically. Cancellation changes status without deleting
  financial history.

For an installment beginning `2025-10-05` with 60 installments, occurrence
`1/60` is due `2025-10-05`, every later occurrence uses day 5, and `60/60` is
due `2030-09-05`. Each occurrence will have explicit unpaid/paid/cancelled
status so the user can check whether the current installment was paid.

A recurring rule beginning `2026-09-10` uses day 10 as its monthly occurrence
day. Occurrences will be materialized idempotently from the rule; the exact
future materialization horizon will be finalized with the upcoming-payables
feature so a background scheduler is not introduced without need.

## Credit-card dates

Each card records:

- `cutoffDay`, for example 17.
- `dueDay`, for example 1.

The official statement due date is derived from those monthly rules. A
transaction on the cut-off date belongs to the statement ending that day; a
later transaction belongs to the next statement.

The owner normally plans to pay card statements at the end of the month before
the official due month, such as September 30 for an October 1 or October 5 due
date. This must be represented separately from the provider's official due
date. The exact fallback for unusual card rules where that planned date would
precede the statement end remains to be confirmed before the card phase.

## Repository structure

```text
apps/web       React + Vite client
apps/api       Fastify API, database schema, migrations, CLI commands
packages/domain  Pure money and calendar rules
docs/architecture/decisions  Architecture decision records
```

## Development database and production import

Docker Compose binds MariaDB to loopback only and stores data in a named Docker
volume. Database passwords live in the ignored `.env` file.

When deployment is ready:

1. Verify the development database contains only approved data.
2. Run all migrations and validation against the final revision.
3. Export with a consistent transactional dump into an ignored artifact path.
4. Inspect the SQL artifact for credentials, production coordinates, and real
   financial data.
5. Establish and verify the Plesk database backup/restore path.
6. Import through the approved Plesk MySQL/MariaDB feature.
7. Verify schema version, owner account, read flow, and one safe write flow.

No database dump is committed to Git.

## Delivery phases

1. Issue #1 — Bootstrap and authentication foundation.
2. Issue #2 — Transactions and categories (owner UAT passed).
3. Issue #3 — Credit cards, statements, and planned payments.
4. Issue #4 — Installments with `N/N` and paid-state tracking.
5. Issue #5 — Recurring expenses and idempotent occurrences.
6. Issue #6 — Monthly activity and upcoming payables without double counting.
7. Issue #7 — Responsive polish, accessibility, and fictional portfolio screenshots.
8. Issue #8 — Plesk artifact preparation and dry run.
9. Separately approved production deployment and post-deploy verification.

Roadmap Issue #9 tracks the ordered MVP delivery plan and checkpoints.

The repository uses `main` → `release` → `develop` as its long-lived promotion
path. Issue work starts from `develop` on `tasks/<issue>-<slug>` and returns to
`develop` through a CI-gated pull request.

Implementation, code-based validation, owner UAT, commit/push, merge, and
production deployment remain separate approval checkpoints.
