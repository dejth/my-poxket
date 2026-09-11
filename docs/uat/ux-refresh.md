# Issue #40 — Integrated Calm Ledger UX/UI UAT

Automated checks do not establish visual UAT. The owner performs this checklist
against the local application with fictional data and records the result below.
Production deployment and production data are outside this UAT.

## Setup

Use a separate local/test database. Follow the root README setup, initialize the
starter categories, and enter the fictional September 2026 dataset from
[`issue-7.md`](issue-7.md). Use the fictional owner/member accounts described in
[`users.md`](users.md). Never enter real credentials or financial information.

Before payment, September activity must show income `฿50,000.00`, expense
`฿3,600.00`, and net `฿46,400.00`. Cash outflow must show `฿2,400.00`; the card
purchase must not be counted again as a cash payment. Date-sensitive overdue
states use Asia/Bangkok.

## Responsive matrix

Review every route at **320, 390, 430, 768, 1024, and 1440 CSS pixels**. At each
width, confirm there is no page-level horizontal overflow, clipped amount,
overlapping action, obscured final row, or unreachable control. Mobile controls
must remain at least 44×44px. At 200% zoom, content and actions must remain usable.

| Route                         | Expected result                                                                                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login                         | Logo and hierarchy are clear; labels, invalid credentials, loading, connection error, retry, and visible focus remain readable.                                                                                  |
| `/`                           | Selected month controls activity, recent transactions, category summary, and payables; activity and cash movement remain separately labeled. Empty/error/retry, paid, due, and overdue states are clear.         |
| `/transactions`               | Mobile cards and desktop table preserve date, description, category, method, status, amount, and actions. Filters are initially compact. Long names and large amounts do not distort status labels or overflow.  |
| Transaction create/correction | One quick-add action opens the form. Income hides card payment. Invalid input is announced. Save, cancel, close, and Escape return correctly; failures preserve entered values.                                  |
| `/credit-cards`               | Add opens a content-sized Modal. Card rules, inactive cards, statements, official due date, planned payment date, payment state, and history remain readable.                                                    |
| `/installments`               | Add/payment/settlement dialogs fit. `N/N` progress, unpaid/paid history, long names, completion, cancellation, and early-settlement confirmation remain clear.                                                   |
| `/recurring-expenses`         | Add/edit/payment/stop dialogs fit. Current occurrence, generated history, future-only editing, stopped state, and retained history remain clear.                                                                 |
| `/categories`                 | Add opens a content-sized Modal. Income/expense groups, long names, status placement, activate/deactivate confirmation, and history-safe wording remain usable.                                                  |
| `/users`                      | Owner can add/edit users in a content-sized Modal. Long names, validation, blank-password edit, owner reauthentication, member restrictions, and cancel behavior remain correct. Members cannot access the page. |

## Interaction and system checks

- Navigate after scrolling near the bottom of a long page; the destination starts
  at the top.
- Use Tab and Shift+Tab through navigation, filters, lists, menus, and dialogs.
  Focus stays visible, dialog focus is contained, and closing returns focus to
  the opener.
- Use Enter/Space on links and buttons and Escape on dialogs. No action depends
  on hover alone.
- Enable reduced motion. Navigation, dialogs, notices, and state changes remain
  understandable without animation.
- On a safe-area device or emulator, the top bar, bottom navigation, quick-add,
  dialog actions, and last content row remain unobscured.
- Open mobile forms with the software keyboard. Focused fields and save/cancel
  actions remain reachable by scrolling.
- Confirm loading, empty, error/retry, inactive, cancelled/stopped, paid/history,
  long-name, and large-amount examples use text as well as color.

## Result

- Owner UAT: **Passed** (owner-reported; no automated visual-review claim)
- UAT date: 2026-09-11
- Findings: Small-screen activation buttons wrapped onto multiple lines; fixed
  with content-sized, non-wrapping shared actions and accepted on retest.
- Automated validation: Passed on 2026-09-11 — `npm run validate` (73 tests),
  `npm run secret:scan` (no leaks), `docker compose config --quiet`, and
  `git diff --check`
- Production deployment: Not part of this Issue

The owner reported acceptance after the small-screen action fix. Automated tests
did not perform the visual review.
