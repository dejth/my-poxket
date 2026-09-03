# ADR 0005: Derived credit-card statements and payment dates

- Status: Accepted
- Date: 2026-09-03

## Context

Card purchases must be assigned to monthly statements while keeping provider
due dates distinct from the owner's planned payment dates. Historical results
must not change because a card rule was edited later.

## Decision

Store each card's name, optional four-digit masked suffix, cut-off day, due day,
and active state. Date rules are immutable in this phase; a changed rule uses a
new card configuration. Deactivation blocks new purchases and preserves linked
history.

A purchase on the effective cut-off date belongs to the statement ending that
day; a later purchase belongs to the next statement. Days unavailable in a
month clamp to its final day. The official due date is the first configured due
day after statement end.

Statements are derived from active linked transactions and exact minor-unit
totals. The planned payment date is the final day before the official due month,
unless that would precede statement end, in which case it is the official due
date. Correcting a transaction uses the existing atomic replacement flow, so
only its active replacement contributes to a statement.

## Consequences

- Provider and owner payment dates remain visibly separate.
- No statement snapshot, scheduler, or date dependency is required.
- Current totals reflect corrections and cancellations without double counting.
- Paid/unpaid statement state and payment records remain deferred to Issue #6.
