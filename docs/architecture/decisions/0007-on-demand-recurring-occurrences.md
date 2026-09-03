# ADR 0007: On-demand recurring-expense occurrences

- Status: Accepted
- Date: 2026-09-03

## Context

Open-ended monthly expenses need retry-safe occurrences without adding a
background scheduler for a single-owner application.

## Decision

Store recurring rules separately from their occurrences. Materialize missing
periods when recurring expenses are read, from the first applicable month
through the end of the next calendar month in `Asia/Bangkok`. Enforce one
occurrence per rule and `YYYY-MM` period in MariaDB.

Edits update only unpaid occurrences in the current and future periods. Paid
and earlier occurrences preserve their original values. Stopping a rule never
deletes history and requires an explicit choice to cancel or retain generated
future unpaid occurrences.

## Consequences

- No scheduler, queue, or scheduled job is required.
- Concurrent reads and retries cannot duplicate a monthly occurrence.
- Issue #6 can extend the bounded horizon through the same materialization flow
  when its upcoming-payables window is finalized.
