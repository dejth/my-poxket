# Calm Ledger — Visual and information hierarchy specification

Issue: [#22](https://github.com/dejth/my-poxket/issues/22) · Parent: [#21](https://github.com/dejth/my-poxket/issues/21)

Baseline: `325ef55` · Date: September 7, 2026

Status: **Owner accepted the specification on September 7, 2026. UI rollout has not started.**

## 1. Direction and scope

Use a light canvas, white cards, prominent amounts, and subtle dividers. Reserve dark green for visual emphasis and primary actions. Make amounts and the next action easy to identify across the existing Calm Ledger, Anuphan, and CSS foundation.

This document specifies structural wireframes for `/` and `/transactions`; these are not screenshots of an implemented refresh. Dimensions are implementation targets in CSS pixels, not the rendered width of Markdown code blocks. All sample data is fictional. Documentation is in English; quoted UI copy and wireframe labels remain in Thai to represent the application.

Follow the [refresh plan](../plans/ux-refresh.md) and current code. The original reference images were not reopened during this task, so this specification does not claim pixel-perfect fidelity. Do not introduce reference-only features, dependencies, API changes, schema changes, or financial rules.

## 2. Design tokens

Retain shared token names and use them across components. The palette was refined in #61 while preserving the established financial-state meanings.

| Token                    | Value                             | Use                                                        |
| ------------------------ | --------------------------------- | ---------------------------------------------------------- |
| `--color-canvas`         | `#F4F8F6`                         | Page background                                            |
| `--color-surface`        | `#FFFFFF`                         | Cards, forms, menus                                        |
| `--color-ink`            | `#15241F`                         | Headings, amounts, primary text                            |
| `--color-muted`          | `#5B6C65`                         | Dates, descriptions, secondary text                        |
| `--color-border`         | `#D9E5DF`                         | Decorative dividers/borders; not the sole control boundary |
| `--color-control-border` | `#71847B`                         | Visible input and secondary-button borders                 |
| `--color-accent`         | `#0F766E`                         | Primary actions, focus, income                             |
| `--color-accent-strong`  | `#115E59`                         | Primary-button hover/pressed state                         |
| `--color-accent-soft`    | `#E2F5EF`                         | Success and selected-navigation backgrounds                |
| `--color-warning`        | `#7A5200`                         | Unpaid obligations                                         |
| `--color-warning-soft`   | `#FFF3D1`                         | Unpaid-state background                                    |
| `--color-error`          | `#A53D35`                         | Overdue, validation, destructive actions                   |
| `--color-error-soft`     | `#FCECE9`                         | Error/overdue background                                   |
| `--color-neutral-soft`   | `#EDF3F0`                         | Cancelled, stopped, superseded states                      |
| `--radius-sm`            | `12px`                            | Buttons and inputs                                         |
| `--radius-lg`            | `20px`                            | Cards and dialogs                                          |
| `--radius-pill`          | `999px`                           | Filter chips and status badges                             |
| `--shadow-card`          | `0 4px 16px rgb(23 36 31 / 4%)`   | Primary cards; softer than the existing shadow             |
| `--shadow-overlay`       | `0 16px 48px rgb(23 36 31 / 16%)` | Dialogs and More menu                                      |

Spacing scale: `4 / 8 / 12 / 16 / 24 / 32 / 48px`, named `--space-1` through `--space-7` respectively. Use 8px between labels and inputs, 16px between fields, and 24px between sections on mobile / 32px on desktop.

Keep the self-hosted font stack `'Anuphan Variable', ui-sans-serif, system-ui, sans-serif`. Body/input: 16px/1.6, weight 400. Labels: 14px/1.5, weight 550. Page headings: 24px/1.35 mobile and 28px/1.35 desktop, weight 650. Section headings: 18px/1.5, weight 600. Prominent amounts: 28px/1.3 mobile and 36px/1.3 desktop, weight 650. Secondary text has a 14px minimum. Use tabular numerals; do not shrink long amounts to fit.

Use the existing `formatThbMinor`, for example `฿1,250.00` and `-฿250.00`. Do not add negative signs to expenses stored as positive values; identify direction with income/expense labels. Right-align amounts in rows and tables. Keep existing date formatters and Asia/Bangkok.

Use the bundled Bootstrap Icons font at 20px with `currentColor`, accompanied by labels: Overview = house, Transactions = list, Cards = card, More = ellipsis, Add = plus, Paid = check, Overdue = warning triangle. Decorative icons are aria-hidden; icon-only buttons have accessible names and targets of at least 44×44px. Keep the font self-hosted with the application assets.

## 3. Components and states

| Component/state              | Presentation and behavior                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Primary button               | Accent background, white text, 48px high; one primary action per section                                       |
| Secondary button             | White background, ink text, control-border, 44px high                                                          |
| Input/select                 | At least 48px high, 12px padding, persistent label above the control; placeholders do not replace labels       |
| Focus                        | 3px accent outline, 2px offset; on accent backgrounds, separate an inner white ring from the outer accent ring |
| Hover/pressed                | Change background/border without moving or resizing the element                                                |
| Disabled/loading             | Use native disabled and “กำลังบันทึก…”; retain readable text and form values, prevent duplicate submission     |
| Income                       | Accent + “รายรับ”; never rely on color or sign alone                                                           |
| Expense                      | Ink + “รายจ่าย”; ordinary expenses are not red warnings                                                        |
| Unpaid                       | Warning on warning-soft + “ยังไม่จ่าย”                                                                         |
| Overdue                      | Error on error-soft + warning icon + “เกินกำหนด”                                                               |
| Paid/completed               | Accent on accent-soft + check icon + the actual state label                                                    |
| Early settlement             | Accent-soft + “ปิดยอดก่อนกำหนด”; distinct from “ครบแล้ว”                                                       |
| Cancelled/stopped/superseded | Muted on neutral-soft + the exact state label; amounts/history remain readable                                 |
| Obligation source            | “รอบบัตร”, “ผ่อน 3/10”, “ประจำ”, separate from payment status; use actual typed sources                        |
| Loading                      | Section-level role=status/aria-busy text; do not substitute zero amounts                                       |
| Empty                        | “ยังไม่มีรายการในเดือนนี้” + Add; for filtered results, “ไม่พบรายการตามตัวกรอง” + adjust filters               |
| No upcoming payables         | “ไม่มียอดค้างหรือยอดที่กำลังจะถึงกำหนด”; do not encourage creating debt                                        |
| Error/retry                  | Safe message + “ลองอีกครั้ง” within the failed section; retain successful sections                             |
| Validation                   | Message below the field + aria-invalid/aria-describedby; focus the first invalid field after failed submission |
| Success                      | Polite status announcement; a failed save keeps the form open                                                  |
| Destructive                  | Confirm the impact on history/future occurrences before acting; at least 16px separation from primary actions  |

Do not infer one-time/installment/recurring labels for TransactionData from descriptions: the current contract has no such source field. An active transaction does not imply a paid obligation.

Limit transitions to colors/shadows at 150ms ease. Disable transitions/animations for reduced motion. No shimmer, amount count-up, or motion required to understand values.

## 4. Navigation and responsive geometry

| Viewport   | Shell and content                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| 320–860px  | 56px topbar, 16px gutters, single-column content, 64px bottom navigation + safe-area                 |
| 861–1199px | 208px sidebar, 24px content padding; single-column sections when space is insufficient               |
| ≥1200px    | 232px sidebar, 32px content padding, 1200px content max-width; two secondary columns with a 24px gap |

Retain the existing 860px shell breakpoint to reduce regressions. At 768px use the mobile shell; at 1024px use the sidebar. Use the transaction table at viewport widths ≥1024px and card rows below that.

Mobile has four equally sized destinations with icons and labels: **ภาพรวม `/` · รายการ `/transactions` · บัตร `/credit-cards` · เพิ่มเติม**. More opens a native dialog using the existing pattern, without creating a new route. It contains Installments `/installments`, Recurring `/recurring-expenses`, Categories `/categories`, owner-only Users `/users`, and an account section with username/sign-out; this does not introduce an account page.

On secondary routes, mark More selected with screen-reader context. Use aria-current=page on the current route inside the dialog. Opening focuses the heading/first item; Tab stays inside; Escape/Close restores focus to More. Preserve the existing sign-out flow.

The desktop sidebar exposes all existing routes in this order: Overview, Transactions, Cards, Installments, Recurring, Categories, followed by the account section. Users remains owner-only. Retain the skip link and an active indicator using a bar/background plus text.

Mobile quick-add is a 56px circular button, 16px from the right and 16px above bottom navigation: bottom = `64px + env(safe-area-inset-bottom) + 16px`. Reserve at least `64px + 16px + 56px + 16px + env(safe-area-inset-bottom)` after page content. It is not a fifth tab. Make the background inaccessible while a dialog is open so the FAB does not compete with Save. Desktop uses “เพิ่มรายการ” in the header.

Preserve `/transactions?action=new` and the origin URL including query/hash: Cancel/Escape/successful save return to the origin; direct URLs return to `/transactions`; failed saves retain the form. Refresh affected queries through the existing success flow.

## 5. Wireframe — Overview `/`

DOM and reading order: month/add → activity → payables → recent transactions → categories/cash flow → history. Do not use CSS reordering that makes keyboard order differ from visual order.

### Mobile 390px

Content width is 358px = 390 minus two 16px gutters. This is a scrolling page; sections do not all need to fit in one viewport.

```text
┌─────────────────────────────────────┐
│ P  My Poxket                        │ topbar 56
├─────────────────────────────────────┤
│ สรุปการเงิน                         │
│ เดือนที่สรุป [กันยายน 2569       ▾] │ input month 48
│                                     │
│ กิจกรรมตามวันที่ทำรายการ            │
│ ┌─────────────────────────────────┐ │
│ │ สุทธิกิจกรรม       ฿37,500.00   │ │
│ │ รายรับ             ฿40,000.00   │ │
│ │ รายจ่าย             ฿2,500.00   │ │
│ └─────────────────────────────────┘ │
│ ยอดที่ต้องจ่าย · ถึง [API date]   │
│ ┌─────────────────────────────────┐ │
│ │ บัตรตัวอย่าง        ฿1,000.00   │ │
│ │ รอบบัตร · ยังไม่จ่าย             │ │
│ │ วางแผน 30 ก.ย. · กำหนด 5 ต.ค. │ │
│ │ [บันทึกการจ่าย]                  │ │
│ └─────────────────────────────────┘ │
│ รายการล่าสุดในเดือนนี้   [ดูทั้งหมด] │ #29
│ อาหารตัวอย่าง · รายจ่าย  ฿1,500.00 │
│ สัดส่วนรายจ่าย                      │ #30
│ อาหาร       60%          ฿1,500.00 │
│ เดินทาง     40%          ฿1,000.00 │
│ กระแสเงินสด · ตามวันที่จ่าย          │
│ เงินเข้า                ฿40,000.00 │
│ เงินออก                  ฿1,500.00 │
│ สุทธิกระแสเงินสด        ฿38,500.00 │
│ ประวัติเดือนนี้                     │
│ ยังไม่มีประวัติการจ่ายหรือยกเลิก     │
│                  reserved space   [+] │ FAB 56
├─────────────────────────────────────┤
│ ภาพรวม   รายการ   บัตร   เพิ่มเติม  │ nav 64
└─────────────────────────────────────┘ safe-area
```

Activity example: income 40,000; cash expense 1,500 plus card purchase 1,000 = expenses 2,500. The card is unpaid, so cash outflow is 1,500 without counting the card purchase twice. These values explain the specification and must not be inserted into the application. Neither net value represents a bank-account balance.

### Desktop 1440px

Sidebar: 232px; remaining width: 1208px; two 32px paddings leave 1144px of content. Secondary columns are 560px each with a 24px gap.

```text
┌──────────────┬───────────────────────────────────────────────────────────┐
│ P My Poxket  │ สรุปการเงิน     [กันยายน 2569 ▾]          [＋ เพิ่มรายการ] │
│              │ กิจกรรมตามวันที่ทำรายการ                                │
│ ภาพรวม       │ [สุทธิ ฿37,500.00] [รายรับ ฿40,000.00] [รายจ่าย ฿2,500.00]│
│ รายการ       │                                                           │
│ บัตร         │ ยอดที่ต้องจ่าย · ถึง [API date]                         │
│ ผ่อน         │ บัตรตัวอย่าง | รอบบัตร | ฿1,000.00 | ยังไม่จ่าย | [จ่าย]  │
│ ประจำ        │ วางแผน 30 ก.ย. 2569 · ครบกำหนด 5 ต.ค. 2569             │
│ หมวดหมู่     │                                                           │
│              │ รายการล่าสุดในเดือนนี้                         [ดูทั้งหมด]│
│              │ วันที่       รายละเอียด       หมวดหมู่     ประเภท      ยอด│
│              │ 7 ก.ย. 2569  อาหารตัวอย่าง     อาหาร        รายจ่าย   1,500│
│              │                                                           │
│              │ ┌────────────────────────┐ ┌────────────────────────────┐│
│              │ │ สัดส่วนรายจ่าย          │ │ กระแสเงินสดตามวันที่จ่าย    ││
│              │ │ อาหาร   60% ฿1,500.00  │ │ เข้า ฿40,000 / ออก ฿1,500  ││
│              │ │ เดินทาง 40% ฿1,000.00  │ │ สุทธิ ฿38,500.00           ││
│              │ └────────────────────────┘ └────────────────────────────┘│
│ ผู้ใช้*      │ ประวัติเดือนนี้                                           │
│ บัญชี/ออก    │ ยังไม่มีประวัติการจ่ายหรือยกเลิก                           │
└──────────────┴───────────────────────────────────────────────────────────┘
```

`*` Owner-only. Some amounts are abbreviated in the diagram to illustrate columns; implementation always renders full THB amounts with two decimal places.

Payables use the API horizon/status from ADR 0008, not only the selected month. A planned payment date alone must not make a card overdue. Activity/history/recent transactions follow the selected month. When changing months, never display old data under the new month heading.

Recent transactions belong to #29: at most five active records, the actual selected-month range, and verified API ordering before implementation. Give this section its own loading/error/retry states. #27 must not insert mock records. Category work in #30 uses total expenses as the denominator and readable name/amount/percentage alongside the visual bar. Preserve existing income-category information in a separate section below expenses. Do not call this a budget. Zero expenses produce an empty state, not division by zero.

## 6. Wireframe — Transactions `/transactions`

### Mobile 390px

```text
┌─────────────────────────────────────┐
│ P  My Poxket                        │
│ รายรับและรายจ่าย                    │
│ ค้นหา [รายละเอียดรายการ          ]│
│ [ทั้งหมด] [รายรับ] [รายจ่าย]       │ chips 44 high
│ [ตัวกรองเพิ่มเติม · 2] [กรองรายการ]│
│ เงื่อนไขที่ใช้: ใช้งาน · ก.ย. 2569 │
│ ┌─────────────────────────────────┐ │
│ │ อาหารตัวอย่าง       ฿1,500.00   │ │
│ │ รายจ่าย · อาหาร · เงินสด         │ │
│ │ 7 ก.ย. 2569 · ใช้งาน            │ │
│ │ [แก้ไข]             [ยกเลิก]    │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ รายรับตัวอย่าง     ฿40,000.00   │ │
│ │ รายรับ · เงินเดือน · โอน         │ │
│ │ 1 ก.ย. 2569 · ใช้งาน            │ │
│ │ [แก้ไข]             [ยกเลิก]    │ │
│ └─────────────────────────────────┘ │
│ [ก่อนหน้า]       หน้า 1    [ถัดไป] │
│                  reserved space   [+] │
├─────────────────────────────────────┤
│ ภาพรวม   รายการ   บัตร   เพิ่มเติม  │
└─────────────────────────────────────┘
```

### Desktop 1440px

```text
┌──────────────┬───────────────────────────────────────────────────────────┐
│ P My Poxket  │ รายรับและรายจ่าย                         [＋ เพิ่มรายการ] │
│ ภาพรวม       │ ค้นหา [รายละเอียด...] [ทั้งหมด][รายรับ][รายจ่าย]          │
│ รายการ       │ [ตัวกรองเพิ่มเติม · 2] [กรองรายการ]                      │
│ บัตร         │ เงื่อนไขที่ใช้: ใช้งาน · กันยายน 2569                     │
│ ผ่อน         │ ┌───────────────────────────────────────────────────────┐ │
│ ประจำ        │ │ วันที่ | รายละเอียด/หมวด | วิธีชำระ | สถานะ | ยอด | ทำงาน│
│ หมวดหมู่     │ │ 7 ก.ย. | อาหารตัวอย่าง    | เงินสด   | ใช้งาน | ... | แก้ไข│
│              │ │        | รายจ่าย · อาหาร |          |        |     | ยกเลิก│
│              │ └───────────────────────────────────────────────────────┘ │
│              │ [ก่อนหน้า]                   หน้า 1               [ถัดไป]│
│ ผู้ใช้*      │                                                           │
│ บัญชี/ออก    │                                                           │
└──────────────┴───────────────────────────────────────────────────────────┘
```

Use a semantic table with a caption/column headers and action names identifying the record. Do not make the entire row a button. Wrap long descriptions within cells, show full amounts, and never hide actions behind hover. Preserve existing action restrictions for superseded/cancelled records.

Type chips are a three-value native radio group styled as capsules: Tab enters the group and arrow keys change the value. Provide a selected indicator in addition to color. Preserve draft filters and “กรองรายการ” to apply them together. Applying changed filters resets pagination as before.

“ตัวกรองเพิ่มเติม” expands an in-page section (`details/summary`) containing category, status, payment method, card, start date, and end date. Retain native select/date controls. Collapsing and reopening preserves draft values. Display applied conditions outside the collapsed section. Dates in the wireframe illustrate a user-selected filter, not a new default.

Use the existing Modal for transaction entry: at 320–860px, full width with internal scrolling and max-height 100dvh; on desktop, max-width 560px. Preserve amount/date/description/category/payment-method fields and conditional card selection. Footer actions must remain reachable by scrolling with the mobile keyboard open, without overlapping inputs.

## 7. Requirements at 320px and intermediate widths

At 320px, content width is 288px and card padding is 16px. Stack the three metrics vertically instead of using three columns. Wrap long names and move long amounts to a full-width next row; do not ellipsize amounts or shrink text. Filter/action buttons wrap while retaining a minimum 44px height.

Bottom navigation allocates 80px per destination at 320px, with room for a 20px icon, 14px label, and at least a 44px target. Reserve trailing space for quick-add using the formula above so it cannot obscure the final record or pagination. Do not truncate “เพิ่มเติม” with a fixed label width.

At 430px retain the mobile structure; at 768px use the mobile shell with single-column content. At 1024px, a 208px sidebar and 24px content padding leave 768px for the list/table. At 1440px use the dimensions above. During implementation, test long Thai names, `฿999,999,999.99`, 200% zoom, keyboard operation, and reduced motion. These wireframes do not establish that those checks passed.

## 8. Evidence and handoff

- `apps/web/src/styles/global.css`: existing primary colors, font, focus, and 860px shell breakpoint.
- `apps/web/src/app/AppShell.tsx`: six existing destinations, quick-add, and owner-only Users.
- `apps/web/src/pages/DashboardPage.tsx`: activity/cashFlow/payables/history and planned/official dates to preserve.
- `apps/web/src/pages/TransactionsPage.tsx`: draft filters, native controls, Modal, table/mobile rows, and correction flow.
- `apps/web/src/pages/finance-format.ts`: exact amounts and Thai date formatting.
- [ADR 0008](../architecture/decisions/0008-dashboard-and-statement-payments.md): separation of purchases and payments.

#23 takes the tokens; #24 takes components/states; #25–#26 take the shell; #27–#30 take Overview; #31–#33 take Transactions/forms; #34–#39 apply the same visual language to existing pages; #40 verifies the integrated experience. Serialize changes to global.css.

## 9. Owner review for #22

- [x] Review the palette, typography, radii, and shadows, and accept the Calm Ledger direction.
- [x] Review `/` and `/transactions` wireframes at 390px/1440px and the 320px requirements.
- [x] Accept Overview/Transactions/Cards/More navigation and quick-add as a separate action.
- [x] Confirm activity → payables → recent transactions → categories/cash flow → history ordering.
- [x] Accept status labels and the separation of activity/cash flow/obligations while preserving existing rules.

This review accepts the specification; it is not responsive/keyboard UAT of an implemented refresh. UI rollout in #23 onward starts after the owner accepts this direction, as required by #22. Acceptance then enables develop delivery under the repository workflow; production remains a separate checkpoint.
