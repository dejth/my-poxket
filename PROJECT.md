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
data per account. Issue #16 adds an owner-only user-management page with name,
username, and password fields. Owners can create member accounts and edit any
existing account without changing its role. Blank passwords on edit preserve
the current password; changing a password revokes all sessions for that account.
There is no role selector, account deletion, public registration, or recovery.

## Money and dates

- Persist amounts as positive integer minor units.
- Direction comes from income/expense classification, not amount sign.
- Parse and round decimal input without binary floating point.
- Apply round-half-up at two THB decimal places.
- Record an optional reference total and a required planned payment per
  installment; do not infer one from the other because financing costs may
  differ from the original loan or purchase amount.
- Record the exact amount paid on each occurrence; it may differ from the
  planned installment amount.
- Treat transaction, due, and payment dates as local calendar dates.
- Store event timestamps in UTC.
- Apply calendar-month arithmetic and clamp unavailable days to month end.

## Transactions and categories

- Categories are typed as `income` or `expense` and can be deactivated without
  breaking historical references. Issue #7 adds
  general-purpose starter categories for income and expenses. Initialization
  is safe to rerun without duplicates and preserves existing categories,
  owner customizations, and financial history.
- Run `npm run categories:init --workspace @my-poxket/api` after migrations to
  add 5 income and 16 expense categories. This explicit command is additive;
  it does not run on application startup or insert sample financial records.
- Transactions use positive THB minor units up to `999,999,999.99`, with an
  explicit income/expense direction and local calendar date.
- Initial non-card payment methods are cash, bank transfer, debit card, and
  other. Credit-card transaction entry remains disabled until Issue #3.
- Corrections preserve the immutable original as `superseded` and create one
  linked replacement atomically. Cancellation changes status without deleting
  financial history.
- Credit-card expenses require an active configured card. Correcting the date
  or card creates an auditable replacement and recalculates its statement.

For an installment beginning `2025-10-05` with 60 installments, occurrence
`1/60` is due `2025-10-05`, every later occurrence uses day 5, and `60/60` is
due `2030-09-05`. Each occurrence has explicit unpaid/paid/cancelled status and
records the actual paid amount and date when paid.

All finite installment occurrences are created atomically with the plan. A
client-generated idempotency key prevents duplicate plans on retry, while a
unique plan-and-installment-number constraint prevents duplicate occurrences.
Marking the final installment paid completes the plan; reverting a payment
reopens it. Cancelling a plan cancels only unpaid occurrences and preserves paid
history. These payable occurrences remain separate from transaction activity so
Issue #6 can avoid double counting.

An installment payment can be marked as closing the plan early. That occurrence
records the actual payoff amount and date, remaining unpaid occurrences are
cancelled atomically, and the plan is labeled `settled` rather than completed.
Reverting the payoff reopens those remaining occurrences without changing prior
paid history.

A recurring rule beginning `2026-09-10` uses day 10 as its monthly occurrence
day. Opening the recurring-expense view materializes missing occurrences
idempotently through the end of the next calendar month. Issue #6 may request a
later bounded horizon when its upcoming-payables window requires one; no
background scheduler is used.

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
date. If that planned date would precede the statement end, the official due
date is used instead.

Statements are derived from active linked purchases rather than persisted as
snapshots. Card date rules are immutable in this phase: deactivate the old
configuration and create a uniquely named replacement when rules change.
Issue #6 stores only statement payment state, the actual amount paid, and the
local payment date. Monthly activity still includes the card purchase, while
cash flow includes the later statement payment instead of counting both.

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

1. Issue #1 — Bootstrap and authentication foundation (complete).
2. Issue #2 — Transactions and categories (complete; owner UAT passed).
3. Issue #3 — Credit cards, statements, and planned payments (complete).
4. Issue #4 — Installments with `N/N` and paid-state tracking (complete).
5. Issue #5 — Recurring expenses and idempotent occurrences (complete; owner UAT passed).
6. Issue #6 — Monthly activity and upcoming payables without double counting (complete; owner UAT passed).
7. Issue #7 — Responsive polish, accessibility, general-purpose starter
   income/expense categories, and return to the previous page after quick-add.
   Portfolio screenshots are deferred until after production deployment and
   are not an Issue #7 completion gate.
8. Issue #8 — Owner-operated Plesk deployment handoff: step-by-step instructions,
   scripts the owner can run on the server, and inspected build artifacts for
   manual upload. Include configuration, migrations, category initialization,
   backup/rollback instructions, dry-run validation, and a post-deploy checklist.
   Verify hosting capabilities before finalizing server commands and paths.
9. The owner performs production deployment and runs the supplied verification
   steps. Issue #8 does not include agent-operated production deployment.

Roadmap Issue #9 tracks the ordered MVP delivery plan and checkpoints.

The repository uses `main` → `release` → `develop` as its long-lived promotion
path. Issue work starts from `develop` on `tasks/<issue>-<slug>` and returns to
`develop` through a CI-gated pull request.

After implementation and local validation, the owner performs manual UAT.
Acceptance such as “pass”, “ผ่าน”, or “ปิดงานได้” authorizes commit/push/PR,
CI-gated merge into develop, verified cleanup, and Issue/roadmap synchronization
without further approval. Browser/computer use is reserved for genuine necessity
or an explicit request. Production promotion, deployment, and production
migration still require separate approval.
