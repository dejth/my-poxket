# ADR 0010: Pay card charges once through their statement

- Status: Accepted
- Date: 2026-10-31
- Supersedes: planned payment dates in ADR 0005 and ADR 0008; separate card-occurrence payments in ADR 0006 and ADR 0007.

## Decision

Show the statement period, official due date, itemized charges, payment status,
and actual payment date. Do not invent an end-of-month planned payment date.
Paying before the due date is an ordinary recorded payment.

A manually entered card purchase may include an optional bank posting date.
Use that date to assign the statement when present; otherwise use the purchase
date. Activity remains grouped by purchase date. Posting dates must not precede
purchase dates and are accepted only for card expenses.

Card recurring and installment occurrences contribute directly to their card
statement without duplicate transaction entry. Their occurrence date is the
date charged to the card, rather than a separate cash payment deadline. Their
cash movement is recorded once, by paying the statement. Linked occurrences
are managed through the bill rather than paid or reversed individually.
Payment submits the displayed bill total as a precondition. Under the card
lock, the API rejects payment if charges have changed since the bill was opened;
the owner refreshes the bill before recording the actual amount. Cancellation
and payment share that card lock.

Existing independently paid occurrences retain their original payment history
and stay outside statement totals. Statement-linked occurrences retain their
association when paid. Reverting a bill reopens only occurrences linked to that
bill; it never rewrites independent legacy payments.

Monthly activity and cash flow follow the selected calendar month. The
dashboard's outstanding and upcoming obligations are explicitly labeled as a
current view through the end of next month, independent of that selector.

## Consequences

- No scheduler, extra payment-planning settings, or duplicate financial entry.
- A forward migration adds posting dates and occurrence payment links.
- Actual statement payment amount is authoritative for cash flow. An occurrence
  marked through a bill displays its charge amount as included in the bill,
  rather than claiming a separate cash payment of that amount.
- User-supplied statements and private mockups stay outside tracked source.
