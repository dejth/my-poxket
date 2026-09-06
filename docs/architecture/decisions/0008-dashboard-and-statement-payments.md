# ADR 0008: Derived dashboard and card-statement payment records

- Status: Accepted
- Date: 2026-09-03

## Context

Monthly activity and cash obligations must remain distinct. Credit-card
purchases are economic activity on their transaction dates, while paying the
card statement is a later cash movement. Counting both in one cash-flow metric
would double-count the same purchase.

## Decision

Derive monthly activity from active transactions and keep category totals on
their transaction dates. Cash outflow includes non-card transaction expenses
and actual payments recorded for card statements, installments, and recurring
occurrences. Credit-card purchases remain in activity but are excluded from
cash outflow until their statement is paid.

Continue deriving statement totals from active linked purchases. Store only the
statement payment state, exact amount paid, and local payment date, keyed by
card and statement end date. Do not snapshot statement totals.

Show all overdue obligations plus unpaid obligations through the end of the
next calendar month. Reuse the existing on-demand recurring materialization
horizon. Paid history uses actual paid amounts; unpaid obligations use planned
amounts. Cancelled occurrences remain visible in history but not in active
payables.

For card statements, the owner's planned payment date controls when the item is
surfaced, while only passing the provider's official due date makes it overdue.

## Consequences

- Corrected or cancelled card purchases immediately update statement totals.
- A recorded card payment remains separate from transaction activity.
- No summary table, scheduler, queue, or additional date library is required.
- The dashboard may query complete single-owner payable history; revisit query
  pagination only when measured history size requires it.
