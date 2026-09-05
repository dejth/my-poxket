# Issue #16 — User management UAT

Use a local/test database and fictional accounts. The primary working directory
now includes this feature together with the pending Issue #7 changes, so the
normal `npm run dev` serves `/users`. No production migration has been applied.
Browser-driven visual UAT is performed by the owner.

## Setup

Use the normal README setup with the API database environment configured for
the intended local database. Apply migrations before starting this revision:

```bash
npm run db:migrate --workspace @my-poxket/api
npm run dev
```

New migration: `apps/api/drizzle/0009_bored_scream.sql`. It initializes the new
name field from each existing username without changing IDs or passwords. On
an empty database, run the normal `auth:bootstrap` command first.

The owner account provisioned from `DEV_BOOTSTRAP_USERNAME` and
`DEV_BOOTSTRAP_PASSWORD` in the local `.env` has full application access,
including Users. No separate demo login is needed. These variables provision
the database account; they do not bypass normal authentication or automatically
reset an existing account on every startup.

## Checklist

- Sign in as owner and open `/users` using the desktop sidebar or the mobile
  “จัดการผู้ใช้” link below the page content.
- At 320px, 390px, 768px, and desktop widths, check that the form and list fit,
  long names wrap, buttons are touchable, and keyboard focus stays visible.
- Create `ผู้ใช้สมมติ` / `sample-member` with a fictional password of at least
  12 characters. Only name, username, and password fields should appear.
- Submit empty/short fields and a duplicate username. Errors must be clear and
  retain entered values. Retry a failed list request without reloading the page.
- Sign in as the new account in another browser profile. The account uses the
  shared ledger and cannot open Users or access `/api/users`.
- As owner, edit the name and username while leaving the password blank.
  The existing password should still work and the session should remain valid.
- Change the member's password. Its old session and old password must no longer
  work; the new password must work. Refresh any previously open browser tab to
  check server authorization rather than cached screen contents.
- Change the owner's password. The owner must be returned to login and can
  sign in with the new password. No financial data should change.
- Cancel editing and verify that the unsaved edit did not change the account.

## Automated validation

```bash
npm run validate
# TEST_DATABASE_URL must point only to a disposable, migrated test database.
npm run test:integration --workspace @my-poxket/api
git diff --check
```

Integration tests cover owner/member/anonymous permissions, CSRF, role
injection, duplicate usernames, safe listing, login, blank-password editing,
password hashing, session revocation, and owner reauthentication. Financial and
user suites run sequentially because both use the disposable test database.

Owner accepted the integrated local work on 2026-09-06. This is owner-reported
UAT acceptance, not agent-operated visual verification. Owner acceptance
authorizes commit/push/PR, CI-gated merge into develop, cleanup, and Issue/roadmap
synchronization. Production actions remain separately approved.
