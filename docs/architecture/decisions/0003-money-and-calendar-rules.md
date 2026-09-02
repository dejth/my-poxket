# ADR 0003: Exact THB money and local calendar dates

- Status: Accepted
- Date: 2026-09-02

## Context

Financial amounts must remain exact, and installment/recurring dates must not
drift across short months or timezone boundaries.

## Decision

Use THB with two decimal places. Convert decimal input to integer minor units
without binary floating-point arithmetic and round half up. Amounts are
positive; direction is modeled separately.

Split installments using integer division and put an indivisible remainder in
the final installment. The first full local date is installment `1/N`; add
calendar months for each later occurrence and clamp unavailable days to the
last day of that month.

Use `DATE` for financial calendar dates and UTC timestamps for events. Interpret
calendar rules in `Asia/Bangkok`.

## Consequences

- JSON APIs must not serialize database `BIGINT` money as JavaScript numbers.
- The final installment can differ by a small number of minor units.
- A plan beginning on day 29–31 can use month-end dates in shorter months.
- Unit tests must cover leap years, short months, year boundaries, `1/N`, and
  `N/N` without generating `N+1/N`.
