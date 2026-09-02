# ADR 0004: Auditable transaction corrections and category lifecycle

- Status: Accepted
- Date: 2026-09-02

## Context

Financial history must remain explainable after a transaction is corrected or
cancelled. Categories must also be removable from future use without breaking
transactions that already reference them.

## Decision

Store every transaction as an immutable financial-history record. Correcting an
active transaction atomically marks the original as `superseded` and creates one
replacement linked to that original. A superseded or cancelled transaction
cannot be corrected again. Cancelling a transaction changes its lifecycle status
without deleting it.

Categories are typed as `income` or `expense` and can be activated or
deactivated. A new transaction requires an active category with the same type as
the transaction. Historical transactions retain references to inactive
categories. A correction may keep its original inactive category, but cannot
switch to another inactive category.

The initial non-card payment methods are `cash`, `bank_transfer`, `debit_card`,
and `other`. Credit-card transactions remain deferred until card and statement
assignment are implemented. Transaction amounts are positive THB minor units and
cannot exceed `999,999,999.99` THB.

## Consequences

- Correction history can be inspected without reconstructing overwritten data.
- Unique correction linkage and row locking make retries safe from duplicate
  replacements.
- Category deactivation never requires cascading or rewriting financial history.
- Active views exclude cancelled and superseded rows by default, while explicit
  status filters keep those records available.
- Editing an existing transaction is presented as correction rather than an
  in-place update.
