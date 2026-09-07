# ADR 0006: Materialized finite installment occurrences

- Status: Accepted
- Date: 2026-09-03

## Context

Installment and loan-payment plans need exact `N/N` progress, due dates, paid
state, retry safety, and cancellation without losing payment history. They are
finite obligations and must remain separate from open-ended recurring rules.

## Decision

Create one installment plan and all `N` occurrences atomically. The plan records
an optional reference total and a required planned payment amount per
installment. These values are independent because financing costs can make the
scheduled payments differ from the original loan or purchase amount. Derive
each due date from the full first-payment date with clamped calendar-month
arithmetic.

Require a client-generated idempotency key for plan creation and enforce unique
`(installmentPlanId, installmentNumber)` values in MariaDB. An occurrence is
`unpaid`, `paid`, or `cancelled`; a paid occurrence records its exact amount in
minor units and its local payment date. Paying `N/N` completes the plan.
Reverting a paid occurrence clears both values and reopens it.
Cancelling an active plan cancels only unpaid occurrences and preserves paid
history.

A payment may explicitly close the entire plan early. The selected occurrence
records the actual settlement amount and payment date with a close-plan flag,
the plan becomes `settled`, and all other unpaid occurrences become cancelled
atomically. Reverting that settlement restores those cancelled occurrences to
unpaid and reopens the plan; prior paid history remains unchanged.

Installment occurrences are payable state, not transaction records. Issue #6
will combine them with other upcoming obligations without recording the same
economic activity twice.

## Consequences

- There is no scheduler or partial-generation workflow for finite plans.
- Retried and concurrent creation cannot duplicate a plan or its occurrences.
- Every occurrence begins with the entered planned installment amount; its
  actual paid amount may differ.
- Early settlement remains distinct from completing every scheduled
  installment.
- `N+1/N` is impossible because occurrences are generated only within `1..N`.
- Editing plan terms after creation is deferred; cancellation preserves the
  original schedule and paid history.
