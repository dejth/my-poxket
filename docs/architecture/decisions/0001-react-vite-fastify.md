# ADR 0001: React/Vite frontend and Fastify API

- Status: Accepted
- Date: 2026-09-02

## Context

My Poxket needs a static CSR frontend for Plesk and a server-side API for
authenticated MariaDB access. It does not have a confirmed requirement for
SSR, React Server Components, Server Actions, or public SEO.

## Decision

Use React with Vite for the static frontend and a single TypeScript Fastify API.
Deploy static assets and the API on the same HTTPS origin, routing `/api` to the
Node application. Use npm workspaces with one lockfile.

Target Node.js 24 LTS. Do not deploy on the available Node.js 25.9.0 runtime
because it is an unsupported odd-numbered release line.

## Consequences

- The frontend build is portable static output in `apps/web/dist`.
- SPA fallback must exclude `/api` and static assets.
- The API is independently deployable and owns all database access.
- Plesk must enable an actively supported Node LTS runtime before deployment.
- Runtime-dependent Next.js features are intentionally unavailable.
