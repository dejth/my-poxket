# ADR 0009: Owner-managed accounts in the shared ledger

- Status: Accepted
- Date: 2026-09-05

## Context

The owner requested a Users feature containing only name, username, and
password. The existing schema already distinguishes owner and member accounts
sharing a single ledger.

## Decision

Expose authenticated owner-only listing, creation, and editing at `/api/users`
and `/users`. The server requires CSRF for mutations and rejects extra input
fields. New users are active members; editing never changes roles or activation
state. There are no user deletion, recovery, registration, or role controls.

Names are required (1–100 trimmed characters). Usernames follow existing login
normalization (trimmed, lowercase, 3–64 characters) and database uniqueness.
New passwords require 12–256 characters and use Argon2id. On edit, omitted or
empty passwords retain the existing hash. Responses contain only ID, name,
username, and the mutation's self-reauthentication flag; no password or hash is
returned.

A password change updates the hash and removes the target user's sessions in
one database transaction. Login locks the same user row until password
verification and session insertion finish, preventing a racing old-password
login from creating a session after revocation. Changing one's own password
requires a fresh login; changing only name or username preserves sessions.

Migration `0009_bored_scream.sql` adds name as nullable, backfills it from the
existing username, then makes it required. Existing IDs, roles, hashes,
activation state, and financial references remain unchanged. Owner bootstrap
uses its username as the initial name, editable later through Users.

## Consequences

- Members can use the shared ledger but cannot list or manage accounts.
- Migration must run before deploying the API that requires names.
- Login and password changes serialize briefly for the same user.
- Production migration and deployment remain separately approved checkpoints.
