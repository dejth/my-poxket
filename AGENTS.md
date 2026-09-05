# Repository Instructions — My Poxket

My Poxket is a private, single-owner personal-finance web application. Build it as a production-quality product while keeping the architecture, dependencies, and operations proportional to a small application.

The root agent is the Lead and Integrator and remains accountable for scope, correctness, validation, security, data integrity, and the final user-facing result. User instructions override this file. Follow the nearest `AGENTS.md` in the directory tree.

## Before changing code

1. Read `AGENTS.md`, `README.md`, `PROJECT.md`, `CONTRIBUTING.md`, the linked Issue when one exists, and relevant ADRs.
2. Inspect the current branch, working tree, recent history, package scripts, runtime configuration, database migrations, and deployment files.
3. Preserve unrelated and pre-existing changes. Never discard, overwrite, reformat, or include them in a task without approval.
4. Confirm the objective, in-scope and out-of-scope behavior, acceptance criteria, risks, dependencies, and validation plan.
5. Identify whether the task is planning, implementation, UAT support, Git delivery, database migration, or Plesk deployment. Owner UAT acceptance authorizes the develop delivery sequence defined below; production actions remain separately authorized.
6. If referenced project files do not exist, report that fact and create only what the approved task requires.

Do not guess missing financial rules, hosting capabilities, database coordinates, domains, GitHub identities, or production configuration. Ask when a missing choice would materially change the result.

## Product scope

### In scope

- Record, edit, view, filter, and safely correct income and expense transactions.
- Manage income and expense categories without breaking historical records.
- Mark an expense as a credit-card purchase and associate it with a configured card.
- Configure each credit card with a statement cut-off rule and payment due-date rule.
- Assign credit-card purchases to the correct statement period.
- Record installment purchases and loan payments with progress such as `1/10`.
- Stop installment generation automatically after the final installment.
- Define recurring expenses that continue monthly until the user deletes or stops the recurring rule.
- Show monthly activity, cash flow, category breakdowns, upcoming payments, overdue items, installments, recurring expenses, and clearly labeled outgoing/payable items.
- Provide a polished responsive experience with deliberate mobile and desktop interfaces.
- Deploy the CSR frontend and server-side API on the approved Plesk hosting environment.
- Use the MySQL database provided by the Plesk hosting environment.
- Support one owner, one primary currency, and one IANA timezone initially.

### Out of scope unless explicitly approved

- Bank scraping, card-provider synchronization, automatic imports, and open-banking integrations.
- Tax filing, invoicing, payroll, double-entry accounting, and enterprise approval workflows.
- Investment tracking, trading, foreign-exchange conversion, and automated financial advice.
- Multi-user households, public registration, multi-tenancy, and complex role-based access control.
- AI categorization, receipt OCR, attachment storage, notifications, background queues, and scheduled jobs without a confirmed need.
- Native mobile applications. The initial product is a responsive web application.
- Direct browser access to MySQL under any circumstances.

Prefer the smallest complete solution. Do not introduce infrastructure or abstractions for hypothetical scale.

## Frontend stack decision

My Poxket is a new project. Do not inherit framework, dependency, theme, package-manager, or deployment assumptions from another repository.

The frontend must be a client-side-rendered web application that produces deployable static assets. During bootstrap, propose and obtain approval for one of these options:

1. React + Vite as a focused SPA/static CSR application; or
2. Next.js configured for client-side rendering and static export only when it provides a concrete, evidenced benefit.

Prefer React + Vite for the initial release unless Next.js solves a confirmed requirement. Do not introduce SSR, React Server Components, Server Actions, or a required Next.js production server when the approved deployment target is static Plesk hosting.

The bootstrap decision must also record:

- TypeScript and strictness settings.
- Package manager and lockfile.
- Routing strategy and SPA fallback requirements.
- State-management and server-state approach.
- Form and validation approach.
- Approved component/design system.
- Test runner and browser-test tooling.
- Supported browser baseline.
- Production build directory and deployment artifact rules.

The static frontend decision does not solve database access. Select and document the server-side API runtime separately after confirming actual Plesk capabilities.

Do not initialize or change the stack without an approved bootstrap plan.

## Target Plesk architecture

Use a small two-layer application hosted within the approved Plesk subscription:

```text
Browser
  -> static React CSR application
  -> same-origin HTTPS API
  -> server-side application on Plesk
  -> MySQL database
```

### Frontend

- Produce static assets with the repository's approved production build command.
- Deploy the generated static directory to the Plesk document root or approved static application directory.
- Configure SPA history fallback so application routes return `index.html` without intercepting `/api/**` or static assets.
- Keep all database credentials, signing secrets, and privileged configuration out of the frontend bundle.
- Treat every value received from the browser as untrusted.

### Backend API

- A static CSR application must never connect directly to MySQL.
- Confirm the actual Plesk subscription capabilities before choosing the backend runtime.
- If Plesk Node.js Toolkit is available, prefer a small TypeScript Node.js API deployed as a Plesk Node.js application.
- If Node.js hosting is unavailable but PHP is supported, use a small PHP API rather than exposing MySQL or moving secrets to the browser.
- Keep the API and frontend on the same origin under `/api` when the hosting configuration supports it. If a separate API origin is unavoidable, document and narrowly configure CORS.
- Use one deployable API application. Do not create microservices.
- Expose only application-specific endpoints. Never expose arbitrary SQL or a generic database proxy.
- Record the chosen runtime, supported version, application root, document root, startup file, environment variables, and deployment procedure in `PROJECT.md`.

### MySQL

- Access MySQL only from the server-side application.
- Use a dedicated application database user with the minimum required privileges.
- Do not use the Plesk administrator, root, or database-owner credential at runtime.
- Prefer a database connection local to the Plesk host. Do not enable public remote MySQL access unless explicitly required and approved.
- If the database is remote, require encrypted transport and restrict access to the exact application host.
- Use versioned migrations stored in the repository.
- Keep local, test, staging, and production databases separate.

## Privacy, authentication, and security

- Financial data is sensitive. Do not log descriptions, amounts, card identifiers, session tokens, cookies, passwords, or personal identity details unnecessarily.
- Never store full card numbers, CVV, PIN, bank credentials, recovery codes, GitHub credentials, Plesk credentials, or database passwords in source control.
- A card record may contain a user-chosen name and optional masked suffix only.
- The application is private. Require authentication before exposing any transaction, summary, category, card, installment, or recurring-expense data.
- Implement one owner account initially. Do not add public sign-up or password recovery unless explicitly required.
- Hash passwords with an established password-hashing library and a modern algorithm supported by the chosen backend runtime. Never implement custom cryptography.
- Use server-managed sessions with `Secure`, `HttpOnly`, and appropriate `SameSite` cookies. Do not store long-lived authentication tokens in local storage.
- Protect state-changing requests against CSRF according to the selected session design.
- Rotate the session identifier after login and invalidate it on logout.
- Apply login rate limiting and safe generic authentication errors.
- Validate and normalize every server input. Use parameterized MySQL queries or a query builder/ORM that preserves parameter binding.
- Apply least privilege to filesystem paths, database users, and deployment credentials.
- Use HTTPS only in production and configure appropriate security headers, including a deliberate Content Security Policy when the UI is established.
- Do not expose stack traces, SQL, secrets, environment variables, or sensitive data in user-visible errors.
- Do not add analytics, error reporting, or third-party scripts that transmit financial or behavioral data without explicit approval.

## Core domain rules

Keep financial rules in domain or application modules, not in React components, HTTP handlers, or MySQL adapters.

### Money

- Store money as integer minor units or another exact representation supported end to end. Never use binary floating-point for persisted or calculated money.
- Amounts are positive. Direction comes from `income` or `expense`, not from switching the sign.
- Store currency explicitly and never silently combine currencies.
- Define and test one rounding rule wherever division or final-installment adjustment is required.
- Confirm the initial currency during bootstrap; do not infer it from locale.

### Dates and timezone

- Confirm and persist one IANA timezone during bootstrap. Do not rely on the browser, API host, or MySQL server default timezone.
- Treat transaction dates and due dates as local calendar dates.
- Store event timestamps in UTC and render them in the configured timezone.
- Use calendar-month arithmetic. Never represent a month as 30 days.
- If a requested day does not exist in a month, use the last calendar day unless the approved requirement defines another rule.
- Centralize and test statement, due-date, recurrence, month-boundary, and overdue calculations.

### Transactions and categories

- A transaction is either `income` or `expense` and has a positive amount, currency, transaction date, description, category, and payment method.
- Only an expense may use `credit_card` as its payment method.
- A generated transaction records its source, such as a recurring rule or installment plan.
- Deactivating a category or card prevents new use but preserves historical references.
- Prefer explicit correction, cancellation, or archival semantics over silent destructive edits.
- Never cascade-delete referenced financial history.

### Credit cards and statements

- A credit-card expense must reference an active configured card.
- Determine the statement period from the transaction date and the card's cut-off rule, including the exact cut-off-date boundary.
- Default boundary unless the user changes it: a transaction on the cut-off date belongs to the statement ending that day; a later transaction belongs to the next statement.
- Calculate the due date from the configured rule and apply the short-month rule consistently.
- Editing the transaction date or card may reassign the transaction to another statement. Perform the change atomically and show the effect to the user.
- Derive statement totals from linked transactions unless an approved design introduces a reconciled snapshot.

### Installments and loans

- An installment plan is finite.
- `totalInstallments` is a positive integer and each installment number is within `1..totalInstallments`.
- Enforce a unique `(installmentPlanId, installmentNumber)` constraint.
- Generation is idempotent: retrying must not create duplicates.
- Generate exactly the configured sequence. A ten-installment plan ends at `10/10`; never generate `11/10`.
- Completing the final installment marks the plan complete and stops future generation automatically.
- Cancelling a plan stops future ungenerated installments but preserves paid and historical items.
- When paid installments exist, preserve them. Regeneration of unpaid future items must be explicit, previewed when practical, and atomic.
- Interest, fees, principal allocation, balloon payments, and variable installments are unsupported until exact rules are approved.

### Recurring expenses

- A recurring expense is open-ended and is not an installment plan.
- Store a recurring rule separately from the transactions it generates.
- A monthly recurring rule contains at least: description, amount, currency, category, payment method, optional credit card, day of month, start date, active state, and timestamps.
- Generation is idempotent. Enforce one generated occurrence per recurring rule and recurrence period.
- For a rule such as a subscription costing 700 every month on day 14, create or surface one payable occurrence for each applicable month while the rule remains active.
- Apply the documented last-day rule when the selected day does not exist in a month.
- Deleting or stopping a recurring rule prevents future occurrences. It must not delete, rewrite, or hide transactions already generated or paid.
- If a future unpaid occurrence was already generated, the deletion flow must explicitly state whether it will be cancelled or retained. Default: cancel future unpaid generated occurrences and preserve historical/paid ones.
- Editing a recurring rule affects future occurrences only by default. Historical transactions remain unchanged.
- The UI must clearly distinguish **Recurring**, **Installment N/N**, and **One-time** expenses.

### Summaries and payables

- Keep **activity/spending** and **cash movement/payables** as separate concepts and separate labeled views.
- Activity summary groups income and expenses by transaction date and category.
- Cash/payable summary groups actual or upcoming cash obligations by due or payment date.
- Do not double-count a credit-card purchase and its later statement payment in the same metric.
- Upcoming payables include unpaid card statements, installment/loan items, and active recurring-expense occurrences.
- Show source, amount, currency, due date, status, and installment or recurring context where applicable.
- Define `today`, overdue, and upcoming windows from the configured timezone and test their boundaries.
- Cancelled items are excluded from active totals but remain available in history.

## Data model and consistency

The initial domain should support these concepts without forcing a specific ORM:

- `Owner` or authenticated user record.
- `Category`.
- `CreditCard`.
- `Transaction`.
- `CreditCardStatement` when persisted statements are required.
- `InstallmentPlan` and generated installment occurrences.
- `RecurringExpenseRule` and generated recurring occurrences.
- `AppSetting` for currency, timezone, and other owner-level settings.

Data rules:

- Use stable identifiers and explicit `createdAt` and `updatedAt` timestamps.
- Enforce required values, enums, positive amounts, foreign keys, and uniqueness at both application and MySQL layers where practical.
- Use database transactions for multi-record financial changes.
- Make retried commands idempotent with deterministic keys or unique constraints.
- Keep migrations deterministic and reviewable. Test them against representative data before production.
- Never edit an already-applied migration. Add a new forward migration.
- Establish and verify a backup before a destructive production migration.
- Seed and fixture data must be fictional, clearly non-production, and unable to overwrite production data.
- Use explicit indexes for common filters and relationships, but do not add speculative indexes without query evidence.

## Responsive UX and visual quality

My Poxket must feel designed for each screen size, not like a desktop page merely scaled down.

### Mobile

- Design mobile-first for narrow screens beginning around 320–390 CSS pixels.
- Use a modern app shell with clear hierarchy, safe-area support, and thumb-reachable primary actions.
- Prefer bottom navigation for three to five primary destinations when information architecture supports it.
- Provide a prominent, fast “add transaction” action without obscuring content.
- Use full-screen or bottom-sheet forms where they improve focus and keyboard behavior.
- Keep tap targets at least 44 by 44 CSS pixels and maintain adequate spacing between destructive and primary actions.
- Avoid dense desktop tables. Use structured cards or list rows with scannable amount, date, category, status, and source.
- Handle mobile keyboards, input modes, date controls, loading, offline/retry, and safe-area insets deliberately.

### Desktop and tablet

- Use the additional width for useful hierarchy, comparison, filters, summaries, and detail panels rather than stretching mobile cards edge to edge.
- Prefer a stable sidebar or top navigation appropriate to the final information architecture.
- Use constrained content widths, consistent alignment, and readable density.
- Use semantic tables for transaction-heavy views when comparison across columns matters.
- Support keyboard navigation, visible focus, hover-independent actions, and efficient filtering.
- Preserve the same information and actions as mobile while adapting layout, grouping, and interaction patterns.

### Shared design expectations

- Establish reusable design tokens for color, typography, spacing, radius, elevation, and motion.
- Use the approved design system consistently. Prefer theme-level decisions and reusable components over one-off styling.
- Create a calm, trustworthy personal-finance visual language. Avoid noisy gradients, decorative clutter, and dashboard overload.
- Clearly distinguish income, one-time expense, recurring expense, installment, card statement, due, overdue, paid, and cancelled states.
- Do not rely on color alone. Pair color with text, icons, shape, or position.
- Show currency consistently and avoid misleading precision.
- Design empty, loading, validation, error, success, and no-upcoming-payment states.
- Require confirmation for destructive actions and explain whether history or future occurrences are affected.
- Meet semantic HTML, screen-reader labeling, contrast, reduced-motion, and focus-management expectations.
- Do not claim responsive or visual UAT passed from code inspection alone.

## Agent delivery

Use the smallest effective agent topology for each task.

### Model routing

- **Terra — Default Lead and Implementer:** routine features, bug fixes, refactors, tests, documentation, and normal repository work.
- **Luna — Scout and Verifier:** repository discovery, reference lookup, documentation checks, log inspection, repetitive consistency checks, and inexpensive read-only verification.
- **Sol — Architect and Senior Reviewer:** architecture, authentication, security, financial calculations, MySQL migrations with production risk, difficult debugging, cross-cutting changes, ambiguous requirements, or final review of high-risk work.

These names describe preferred responsibilities, not permission boundaries. If a preferred model is unavailable, preserve the role and assign an available model explicitly.

Local Ollama models are not part of the delivery workflow unless the user explicitly reauthorizes them.

### When to use multiple agents

Do not create subagents by default. Use multiple agents only when at least one condition is true:

1. Two or more independent workstreams can run concurrently without overlapping file ownership.
2. Read-only discovery can proceed independently from an already-defined implementation.
3. The task affects authentication, security, data integrity, money/date calculations, recurrence, or migrations and benefits from independent review.
4. Independent verification materially increases confidence.
5. Parallel execution is expected to reduce meaningful wall-clock time.

Keep small, localized, and tightly coupled work in one agent. Never create a subagent merely to satisfy a pattern.

### Orchestration rules

1. The Lead reads repository instructions, project context, and the linked Issue first.
2. Prefer one agent for routine work.
3. Delegate only bounded tasks with objective, allowed files, forbidden actions, expected evidence, and a stopping condition.
4. Agents share the working tree. Assign only one writer to a file or tightly coupled file set at a time.
5. Never allow overlapping edits concurrently.
6. Prefer Luna for read-only discovery and verification, Terra for implementation, and Sol for high-risk judgment or review.
7. Reuse an existing agent for follow-up work in the same workstream.
8. Keep no more than two subagents active concurrently by default.
9. Stop an agent when its evidence or stopping condition is reached.
10. The Lead inspects and integrates every delegated result.
11. Run required checks against the final integrated revision.

Multi-agent use does not expand authorization. Agents must not commit, push, create a remote, create or mark a PR Ready, merge, close an Issue, delete branches, publish, deploy, change DNS, alter Plesk configuration, create databases/users, write secrets, apply remote migrations, or change infrastructure without the user's authorization. Owner UAT acceptance supplies authorization for the develop delivery sequence below; the Lead remains responsible for executing or explicitly delegating it.

### Quota-aware execution and UAT

- Use one agent by default and add a subagent only when the expected benefit justifies the additional usage.
- During implementation, run targeted checks for changed behavior. Run the complete validation suite once on the integrated revision before review or Draft PR.
- Do not use browser skills or computer use for routine implementation or UAT. Use them only when genuinely necessary to complete the task or explicitly requested by the user; prefer code, tests, APIs, and CLI checks. Give the user a manual UAT checklist after implementation.
- Give the user a concise UAT checklist with routes, fixtures, breakpoints, and expected outcomes.
- Treat user UAT feedback as the next focused work item. Do not repeat unrelated discovery or broad validation prematurely.
- Never claim UAT passed until the user confirms it.

## Git and GitHub workflow

- Do not record a personal GitHub username, email address, account ID, token, organization, or repository URL in this file.
- Before any GitHub operation, verify the active GitHub CLI identity and repository access. If the user has not named the intended account, stop before creating a remote or publishing.
- Configure repository-local Git author identity only after the user supplies or confirms it. Do not change global Git identity unless explicitly requested.
- Never print, copy, or commit credentials. Use the system credential store and GitHub CLI authentication mechanisms.
- Preserve the existing default branch until the user approves a branch-policy change.
- Use the long-lived hierarchy `main` → `release` → `develop`. Create focused `tasks/<issue>-<slug>` branches from `develop`, merge them back into `develop` through CI-gated pull requests, then use separately approved promotions from `develop` to `release` and from `release` to `main`.
- Treat `main` as the production release line once deployment automation is configured.
- Use one GitHub Issue per feature or defect when GitHub governance is enabled.
- Never force-push, rewrite shared history, or bypass protection without explicit approval. Owner UAT acceptance authorizes cleanup of verified merged task branches only; preserve unrelated branches and uncommitted work.
- If conflicts occur, report them and wait. Do not invent an alternate release path.

## Delivery checkpoints

Keep these stages explicit and report evidence at each stage:

1. **Plan approved** — objective, scope, acceptance criteria, risks, stack/runtime impact, and validation agreed.
2. **Implementation complete** — focused code and targeted tests completed; no publish action implied.
3. **Local validation complete** — full required checks run against the integrated revision.
4. **UAT** — after implementation and local validation, give the user a concise manual UAT checklist. Acceptance such as “pass”, “ผ่าน”, “ปิดงานได้”, or equivalent authorizes the complete develop delivery sequence in steps 5–7 without asking again.
5. **Commit/push/PR** — after accepted UAT, commit the approved scope, push the task branch, and create or update its PR into `develop`.
6. **CI-gated merge** — wait for all required CI checks and review requirements to pass for the current PR head, mark Ready if needed, and merge into `develop`. Fix failures within scope and rerun checks; do not bypass protections.
7. **Cleanup and Issue synchronization** — verify the merged revision and develop CI, synchronize local `develop`, delete only verified merged task branches, and update/close the related Issues and roadmap so their status matches delivery. Preserve unrelated work and stop on conflicts.
8. **Production promotion** — separate approved release flow.
9. **Plesk deployment and production migration** — explicit approval after build, migration review, backup verification, and deployment plan.
10. **Post-deploy verification** — verify deployed revision, authentication, database schema, smoke tests, logs, and local synchronization.

“ปิด task” or “ปิดงานได้” after UAT authorizes the develop delivery sequence above. It does not authorize archiving the Codex conversation, production promotion, deployment, or production migration.

## Plesk deployment rules

- Inspect actual Plesk capabilities before finalizing the deployment design: operating system, Node.js Toolkit availability, supported Node/PHP versions, document root, application root, startup file, Git integration, SSH access, MySQL host, and database access policy.
- Do not place Plesk credentials, database credentials, domains, IP addresses, personal identity values, or repository URLs in `AGENTS.md`.
- Creating a database or user, changing DNS, changing document roots, enabling Node.js, writing secrets, modifying remote-access rules, applying production migrations, and deploying each require explicit authorization.
- Keep secrets in Plesk environment configuration or an approved server-side secret file outside the public document root.
- Never upload source `.env` files, development fixtures, database dumps, tests, source maps containing sensitive paths, or unnecessary source files to the public document root.
- Build the frontend in a clean environment and deploy only the expected static build artifacts.
- Deploy the API outside the public static directory except for its controlled entry point as required by the chosen Plesk runtime.
- Run a production build and deployment dry run or artifact inspection before requesting deployment approval.
- Review the exact migration list and establish a verified database backup before production migration.
- Prefer backward-compatible expand/migrate/contract database changes once production data exists.
- After deployment, verify HTTPS, authentication, SPA route fallback, API routing, one read flow, one safe write flow, database schema, logs without sensitive data, and rollback instructions.
- Never claim deployment succeeded from upload or command exit alone; verify the live application.

## Testing strategy

- **Unit tests:** money representation, rounding, calendar arithmetic, cut-off boundaries, due-date rules, leap years, short months, installment numbering, recurrence, idempotency, deletion/stop behavior, and summary classification.
- **Integration tests:** API validation, authentication/session handling, MySQL schema constraints, migrations, transactions, statement reassignment, installment generation, recurring occurrence generation, cancellation, and summary queries.
- **End-to-end tests:** sign in, create income and expense, configure a card, create a card expense, inspect a statement, create and finish an installment plan, create/edit/delete a recurring expense, and verify activity/payable summaries.
- **Security tests:** unauthenticated access is blocked, CSRF protection works, login is rate-limited, sensitive errors are sanitized, and frontend bundles contain no secrets.
- **Responsive tests:** representative narrow mobile, large mobile, tablet, and desktop viewports; keyboard navigation; touch targets; content overflow; forms with mobile keyboard; and reduced motion.

Required edge cases include:

- Day before/on/after card cut-off.
- February in leap and non-leap years and selected dates 29–31.
- Year boundaries and configured-timezone midnight.
- `1/1`, `1/10`, `9/10`, `10/10`, and no `11/10`.
- Retried installment and recurring generation without duplicates.
- Deleting a recurring rule before and after occurrences exist.
- Editing a recurring rule without rewriting history.
- Statement reassignment and inactive referenced records.
- Prevention of credit-card purchase/payment double counting.
- Empty data, large values, invalid input, concurrent requests, and retry behavior.

## Required checks before review

During bootstrap, establish non-interactive scripts for formatting checks, linting, strict type checking, unit/integration tests, and the production static build. Use the selected package manager consistently and commit exactly one lockfile.

The repository must expose one complete validation gate. For example, after npm is approved:

```bash
npm run validate
npm run build
git diff --check
```

If pnpm is approved instead, provide equivalent `pnpm validate` and `pnpm build` scripts. Do not mix package managers.

For backend or MySQL changes, also run the backend test suite, validate migrations against a disposable local/test database, and inspect the unapplied production migration list without applying it.

Until the scripts exist, report exactly which checks are unavailable rather than claiming validation passed. Never claim a check passed unless it ran against the final integrated revision.

## Coding conventions

- Use TypeScript strict mode where supported and avoid untyped escape hatches unless isolated and justified.
- Keep domain logic pure, centralized, and independent of React, HTTP, and MySQL adapters.
- Use explicit names such as `amountMinor`, `transactionDate`, `cutoffDate`, `dueDate`, `paidAt`, `recurrenceDay`, and `installmentNumber`.
- Validate at boundaries and return structured, user-safe errors.
- Keep modules focused and extract abstractions only after repeated stable behavior exists.
- Follow the established formatter, linter, framework, design system, and package manager. Do not add competing tools.
- Add or update tests with every behavior change and regression fix.
- Comments explain business reasons or non-obvious constraints, not syntax.
- Keep dependencies minimal, locked, maintained, and compatible with the approved Plesk runtime.
- Record significant architecture, authentication, financial-rule, and migration decisions in `docs/architecture/decisions`.
- Use fictional examples and fixtures only.

## Definition of done

A task is complete only when:

- Confirmed acceptance criteria are satisfied without unrelated scope.
- Relevant tests cover success, failure, and boundary behavior.
- Required validation passes against the final integrated revision.
- Financial, recurrence, date, authentication, privacy, MySQL, migration, and double-counting risks were reviewed as applicable.
- Mobile and desktop behavior is ready for user UAT.
- Documentation and ADRs reflect material decisions.
- Delegated work was independently inspected and integrated by the Lead.
- Deployment or publication occurred only at an approved checkpoint and was verified live.
- Known limitations, assumptions, and unrun checks are stated honestly.

Implementation, UAT, merge, production promotion, deployment, and task closure are separate outcomes. Report each one explicitly.
