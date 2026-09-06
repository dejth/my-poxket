# Build and runtime

```bash
npm run build
```

Output: `dist/standalone/` and `dist/my-poxket.tar.gz`. The archive contains the
application files directly, so extract it into a new application directory.
Set runtime environment variables externally, then start `node start.cjs` or
`npm start` from that directory. No server-side build or dependency installation
is needed on a supported, tested platform.

## Contents

```text
start.cjs                  Node startup entry point
package.json               Runtime commands
package-lock.json          Locked dependency versions
node_modules/              Production dependencies, including native prebuilds
apps/api/dist/             Compiled API and database commands
apps/api/drizzle/          SQL migrations and journal
packages/domain/           Compiled financial/calendar rules
public/                   Static CSR frontend; the only public file directory
REVISION                   Source revision, marked if the working tree is dirty
SHA256SUMS                 File checksums
MIGRATIONS.txt             Ordered migration list
```

The Node application serves `public/` and `/api` on the same origin. HTML page
navigation falls back to `index.html`; API paths, missing assets, and private-file
requests never fall back to the frontend. Only `public/` may be exposed by an
external static web server. Do not set the public document root to the entire
application directory.

## Reproducibility and platform requirements

- Build with Node.js 24 and npm 11+, using the committed lockfile.
- Build input includes current source files, including untracked files. A dirty
  build is labeled as such; rebuild from the approved revision for production.
- Dependencies install in a temporary directory. The build does not load or copy
  `.env` files or inherit frontend environment overrides from the calling shell.
- Runtime dependencies install with `--omit=dev --ignore-scripts`. Argon2 uses
  its distributed native prebuilds. Test the archive on the target OS/CPU/libc;
  it is not a promise of universal binary compatibility.
- The bundled dependencies are outside `public/`; third-party sources/licenses
  remain intact. Application tests, source maps, local settings, and credentials
  are excluded from the application payload.
- `npm run build:apps` builds workspace outputs only, for development tooling.

## Environment

| Name           | Value                                                               |
| -------------- | ------------------------------------------------------------------- |
| `NODE_ENV`     | `production`                                                        |
| `API_HOST`     | `127.0.0.1` behind a trusted local reverse proxy                    |
| `API_PORT`     | `3000` by default; configure the host's internal listener as needed |
| `WEB_ORIGIN`   | Public HTTPS origin, without a path or trailing slash               |
| `DATABASE_URL` | Private `mysql://user:encoded-password@host:port/database`          |

Use a dedicated runtime database user with DML privileges only. Use separate,
temporary migration credentials for schema changes. The current database adapter
targets a local database; a remote database requires a reviewed TLS configuration.
Production assumes a trusted reverse proxy: keep the backend listener private,
terminate HTTPS at the proxy, and normalize incoming forwarded headers there.

Provider-specific paths, UI instructions, and settings belong in ignored
`.local/`, never in this document or the build. No `.local/` files are bundled.

## Database setup and upgrades

Run these commands from the extracted application directory, with the appropriate
environment supplied to the command. They can also be run through a hosting
control panel's npm script UI:

```bash
npm run db:migrate
# New database only: supply BOOTSTRAP_USERNAME and BOOTSTRAP_PASSWORD temporarily.
npm run auth:bootstrap
npm run categories:init
```

Migrations are explicit, never an application-start side effect. Remove bootstrap
variables afterward. Existing databases with an owner skip bootstrap; duplicate
bootstrap is rejected. Category initialization is additive/idempotent and adds
5 income and 16 expense categories without replacing existing history.

For upgrades, compare `MIGRATIONS.txt`, the SQL checksums, and journal timestamps
against `SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at`.
An empty database needs all packaged migrations. Missing/mismatched history on
an existing schema must be investigated before applying migrations.

Pause writes and verify a private backup before changing an existing schema.
Restore that backup into a new disposable database and compare data/schema to
prove it works. Database DDL can commit partially; do not blindly retry a failed
migration, edit applied migrations, or import a backup over the failed database.

Rollback: stop traffic, preserve the failed database for diagnosis, select the
previous application bundle and matching configuration, and restore the verified
backup into a new database if the schema is incompatible. Account for writes
after the backup before switching the connection; otherwise they would be lost.
Restart and verify login, read/write, schema, and revision before reopening traffic.

## Verification and owner UAT

```bash
npm run validate
npm run test:build
# Or verify a particular archive:
npm run test:build -- /absolute/path/to/my-poxket.tar.gz
```

The build test extracts the archive and checks checksums, then starts it in a
disposable Linux Node 24 container without installing dependencies. It verifies
migrations, category initialization, frontend/API separation, login/logout, CSRF,
a fictional transaction, and dump/restore with matching data and migration hashes.
It uses a separate MariaDB 11.8.6 container and deletes its own test resources.

Owner UAT: open and refresh `/`, `/transactions`, `/users` at 390px and 1440px;
check login/logout, a safe write, and missing asset/API 404 responses. On the
production host also verify HTTPS, cookie flags, database schema, private-file
protection, sanitized logs, and the deployed `REVISION`.
Local tests do not constitute owner UAT or live deployment verification.

Verification on 2026-09-06: the same archive passed the standalone test on Linux
ARM64 and Linux x64 (Docker emulation), using Node 24 and MariaDB 11.8.6 without
installing runtime dependencies. Source validation passed 48 unit/component tests;
all 19 database integration tests passed separately on a disposable database.
Dependency audit found zero vulnerabilities. Secret scan, Compose configuration,
and whitespace checks passed. The frontend retains the existing >500 kB chunk
warning; the build succeeds. Other OS/CPU/libc combinations and live hosting
remain unverified.
