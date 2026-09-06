# ADR 0002: Credential authentication and server-managed sessions

- Status: Accepted
- Date: 2026-09-02

## Context

The private application needs username/password authentication. Development
needs fictional local credentials, while production needs a safe initial owner
account without public registration or secrets in Git.

## Decision

Hash passwords with Argon2id. Provision the first owner through a one-time CLI
command. Read development bootstrap values from an ignored `.env`; production
values are supplied only for the controlled command.

Store sessions in MariaDB. Send an opaque token through an HttpOnly, Secure in
production, SameSite=Strict cookie and persist only its SHA-256 hash. Require a
per-session CSRF token for state changes. Use a 24-hour normal lifetime and a
7-day “remember me” lifetime. Rate-limit login and use generic errors.

## Consequences

- No long-lived authentication token is available to frontend JavaScript.
- Production bootstrap is explicit and cannot silently overwrite an owner.
- Session cleanup and account-management behavior need implementation in the
  authentication phase.
- HTTPS and correct reverse-proxy trust are production prerequisites.
