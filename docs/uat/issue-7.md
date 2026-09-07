# Issue #7 — Owner UAT and portfolio dataset

Implementation and code checks do not establish visual UAT. The owner performs
the following checks using the local Vite application. The owner deferred
Portfolio screenshots until after production deployment to conserve quota.
Screenshots are not an Issue #7 completion gate; no capture is planned now.

## Starter categories

After migrations, run from the repository root:

```bash
npm run categories:init --workspace @my-poxket/api
```

This command uses the API's configured database, just like `db:migrate`. It adds
5 income categories and 16 expense categories to an empty database. Existing
matching names within the same direction are retained, including inactive rows.
Stable starter IDs also preserve renamed starter rows. Repeating the command
does not overwrite names, activation state, timestamps, or financial history.
This is additive setup data, not a migration or a source of sample transactions.
It is not run automatically on login or application startup.

Income: เงินเดือน, โบนัส, รายได้เสริม, ของขวัญและเงินสนับสนุน, รายรับอื่น ๆ.

Expenses: อาหารและเครื่องดื่ม, ของใช้ประจำวัน, เดินทางและน้ำมัน, ที่อยู่อาศัย,
ค่าน้ำและค่าไฟ, โทรศัพท์และอินเทอร์เน็ต, สุขภาพและการรักษา, ประกัน, การศึกษา,
ช้อปปิ้ง, บันเทิงและท่องเที่ยว, สมาชิกและบริการรายเดือน,
ครอบครัวและสัตว์เลี้ยง, ของขวัญและบริจาค, ค่าธรรมเนียม, รายจ่ายอื่น ๆ.

Check `/categories` after running the command twice: no duplicate starter
categories; previously disabled categories remain disabled. Check the income
and expense category choices in `/transactions?action=new`.

## Future fictional portfolio dataset (deferred until after production)

Use a separate empty local database and an owner called `portfolio-owner`.
Use local-only credentials and the normal migration/bootstrap commands. Do not
load these examples into an existing personal ledger. Enter these rows through
the existing UI; no import feature or background generator is required.
All names, amounts, and identifiers below are fictional. Select September 2026
on the dashboard and transaction/statement filters.

First initialize starter categories and create a card named `บัตรสมมติ`, suffix
`1234`, cut-off day 17, due day 1.

| Transaction date | Direction | Description             | Amount THB | Category            | Method        |
| ---------------- | --------- | ----------------------- | ---------- | ------------------- | ------------- |
| 2026-09-01       | Income    | เงินเดือนตัวอย่าง       | 50000.00   | เงินเดือน           | Bank transfer |
| 2026-09-02       | Expense   | มื้ออาหารสมมติ          | 1500.00    | อาหารและเครื่องดื่ม | Cash          |
| 2026-09-03       | Expense   | ของใช้ตัวอย่าง          | 900.00     | ของใช้ประจำวัน      | Bank transfer |
| 2026-09-04       | Expense   | ซื้อสินค้าสมมติด้วยบัตร | 1200.00    | ช้อปปิ้ง            | บัตรสมมติ     |

Create an installment named `อุปกรณ์สมมติ`, category ช้อปปิ้ง, bank transfer,
first payment 2026-09-05, 10 installments of THB 1000.00, optional reference
total THB 10000.00. Leave it unpaid initially.

Create a recurring rule named `สมาชิกรายเดือนสมมติ`, category
สมาชิกและบริการรายเดือน, bank transfer, THB 700.00, starting 2026-09-10 on
day 10. Leave it unpaid initially.

Before recording payments: September activity income is THB 50000.00, expense
THB 3600.00, and net THB 46400.00; cash outflow is THB 2400.00. The card purchase
belongs to the statement ending September 17, official due October 1, planned
payment September 30. Overdue labels depend on the actual date in Asia/Bangkok.

## Manual checklist

Test widths **320, 390, 430, 768, 1024, and 1440 CSS pixels**. Also test 200%
zoom, a mobile keyboard, keyboard-only navigation, and reduced motion.

| Route / area               | Check and expected outcome                                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login                      | Labels, invalid credentials, visible focus, loading state, retry after connection failure                                                                                  |
| All authenticated pages    | Skip link reaches content; active navigation is clear; no page-level horizontal overflow; all actions remain reachable; safe areas and quick-add do not hide the final row |
| `/`                        | Activity and cash flow stay separately labeled; period control is usable; empty/loading/error/retry, overdue and paid states remain readable                               |
| `/transactions`            | Desktop table and mobile cards show the same information; filters and pagination fit; long descriptions and large amounts wrap without losing actions                      |
| Transaction add/correction | Tab and Shift+Tab stay within the modal; Escape closes; focus returns to opener; invalid fields announce their message; income never offers credit-card payment            |
| `/credit-cards`            | Card form, cut-off/due controls, statements, official/planned dates fit narrow screens; inactive cards preserve history; failed loads offer retry                          |
| `/installments`            | Create and payment dialogs behave with keyboard; progress, history, early settlement confirmation and long plan names remain readable                                      |
| `/recurring-expenses`      | Create/edit/payment/stop dialogs behave with keyboard; stop explains retain/cancel future unpaid items and preserve history                                                |
| `/categories`              | Both starter groups are usable; long names fit; activation controls and success notice close button are at least 44px; cancellation of confirmation changes nothing        |
| All forms                  | Empty/invalid fields have associated errors; radio focus is visible; touch targets are at least 44 by 44px; a network error preserves entered values                       |

Use the fictional dataset for desktop dashboard/transactions and mobile
dashboard/transactions/installment screenshots only after approval. Review
each image for fictional data, no credentials, no private account names, and
no production information before adding it to the public repository.

## Checkpoint

- Implementation and automated validation: report from the current work session.
- Owner UAT accepted on 2026-09-06 after the quick-add return-flow fix.
  Acceptance is owner-reported; no agent-operated visual UAT is claimed.
- Screenshot capture/publication: deferred until after production; outside Issue #7 closeout.
- Owner acceptance authorizes commit/push/PR, CI-gated merge into develop,
  verified cleanup, and Issue/roadmap synchronization. Production remains separate.

## Quick-add return flow

From any page, use the mobile quick-add button. Cancel, close, Escape, and a
successful save must return to the originating URL, including its query and
fragment. After saving, dashboard and statement totals must refresh. A direct
visit to `/transactions?action=new` without an originating page closes the form
and stays on Transactions. A failed save keeps the form open for correction.
