# UX/UI refresh plan — Calm Ledger

Date: 2026-09-07. Baseline: develop `c17c461`.

## เป้าหมาย

ปรับ UX/UI My Poxket ให้สงบ อ่านจำนวนเงินและสถานะง่าย และทำรายการได้เร็ว โดยต่อยอด Calm Ledger ตามตัวอย่างที่เจ้าของส่งเมื่อ 2026-09-07

## ขอบเขต

ปรับ presentation และ navigation ของ frontend เดิม; คง React/Vite, Anuphan, CSS tokens, API, THB, Asia/Bangkok และกฎการเงินเดิม ภาพ/ข้อความ Homie เป็น reference ไม่ใช่ feature requirements และไม่เผยแพร่ภาพหรือข้อมูลของบุคคลอื่น

## ไม่รวม

Shared expense settlement, budget engine, shopping, pets, mood/calendar, rewards, PWA/offline, LINE notifications, public signup/recovery, database migrations และ production deployment

## หลักการแตกงาน

หนึ่ง Issue ต่อผลลัพธ์ที่ review และ UAT ได้แยกกัน รวม tests ที่เกี่ยวข้องกับงานนั้น ไม่แตกเป็นงาน CSS ทีละค่า ทุก Issue ใช้ tasks/<issue>-<slug> จาก develop และ CI-gated PR กลับ develop; งานที่ใช้ global.css หรือไฟล์หน้าเดียวกันต้องทำตามลำดับ ห้ามเขียนซ้อนกัน

## ตรวจรับร่วม

ทดสอบพฤติกรรมที่เปลี่ยนด้วยชุดทดสอบเดิม; npm run validate ก่อน review, secret scan/compose/diff ตาม repository gate และส่ง manual UAT ให้เจ้าของที่ 320/390/430/768/1024/1440px ตามหน้าที่แก้ ไม่อ้าง visual UAT จาก code tests; implementation และ owner UAT ยังไม่เริ่มในงานวางแผนนี้

## งานย่อยตามลำดับ

- [ ] [#22](https://github.com/dejth/my-poxket/issues/22) — ล็อกสเปกภาพและลำดับข้อมูล Calm Ledger
- [ ] [#23](https://github.com/dejth/my-poxket/issues/23) — ปรับสี typography และ spacing tokens
- [ ] [#24](https://github.com/dejth/my-poxket/issues/24) — ปรับการ์ด ปุ่ม ช่องกรอก และป้ายสถานะ
- [ ] [#25](https://github.com/dejth/my-poxket/issues/25) — ลดเมนูล่างเหลือ 4 จุดและจัดเมนูเพิ่มเติม
- [ ] [#26](https://github.com/dejth/my-poxket/issues/26) — ปรับ sidebar และความกว้างเนื้อหาบน tablet/desktop
- [ ] [#27](https://github.com/dejth/my-poxket/issues/27) — จัดลำดับภาพรวมและสรุปรายเดือน
- [ ] [#28](https://github.com/dejth/my-poxket/issues/28) — ปรับแถวรายการรอชำระและประวัติ
- [ ] [#29](https://github.com/dejth/my-poxket/issues/29) — เพิ่มรายการล่าสุดในเดือนที่เลือกบนหน้าแรก
- [ ] [#30](https://github.com/dejth/my-poxket/issues/30) — ปรับสรุปหมวดหมู่ให้อ่านสัดส่วนง่าย
- [ ] [#31](https://github.com/dejth/my-poxket/issues/31) — จัดตัวกรองรายการแบบแคปซูลและตัวกรองเพิ่มเติม
- [ ] [#32](https://github.com/dejth/my-poxket/issues/32) — ปรับรายการมือถือและตาราง desktop
- [ ] [#33](https://github.com/dejth/my-poxket/issues/33) — จัดฟอร์มบันทึกและรักษา quick-add return flow
- [ ] [#34](https://github.com/dejth/my-poxket/issues/34) — ปรับการ์ดบัตรและรอบชำระ
- [ ] [#35](https://github.com/dejth/my-poxket/issues/35) — ปรับแผนผ่อนและแถวค่างวด
- [ ] [#36](https://github.com/dejth/my-poxket/issues/36) — ปรับรายการประจำและรายละเอียดรายเดือน
- [ ] [#37](https://github.com/dejth/my-poxket/issues/37) — ปรับหน้าหมวดหมู่ให้เข้าชุด
- [ ] [#38](https://github.com/dejth/my-poxket/issues/38) — ปรับหน้าผู้ใช้ให้เข้าชุด
- [ ] [#39](https://github.com/dejth/my-poxket/issues/39) — ปรับหน้าเข้าสู่ระบบให้เข้าชุด
- [ ] [#40](https://github.com/dejth/my-poxket/issues/40) — ตรวจรับ UX/UI รวมทุกหน้าด้วยข้อมูลสมมติ

## Tracking

[แผนหลัก #21](https://github.com/dejth/my-poxket/issues/21) และ [Roadmap #9](https://github.com/dejth/my-poxket/issues/9) ติดตามงานชุดนี้บน develop. Parent นี้ปิดเมื่อทุกงานย่อยเสร็จและ owner UAT ผ่าน ไม่ปิดเมื่อเอกสาร merge.

## Evidence and implementation boundaries

- `AppShell.tsx` currently renders six mobile destinations; retain routes while moving secondary destinations to More.
- `global.css` already defines Calm Ledger colors, Anuphan, radii and focus states; extend existing rules.
- `DashboardPage.tsx` already separates activity, category totals, cash flow, payables and history; reorder presentation without changing ADR 0008.
- `getTransactions` already accepts month date filters and pageSize. Verify server ordering before the recent-list task; do not infer transaction source from descriptions.
- Issue #7 is completed; this is a new visual iteration, not a reopened delivery. Existing quick-add URL restoration, query invalidation and accessibility are regression constraints.
- No current-browser visual audit was performed for this planning task. Owner-provided references support design intent only.

## Execution order and ownership

Spec → tokens → shared surfaces → shell/page tasks → integrated UAT. Page tasks may be scheduled independently after shared surfaces, but serialize edits to global.css, DashboardPage.tsx and TransactionsPage.tsx. Each child contains exact dependencies and acceptance criteria. Keep all children open until their own implementation, validation and owner UAT/delivery complete.

## Risks and checks

Preserve official versus planned card dates, exact THB formatting, cancelled/paid history, finite installments, recurring stop semantics, authentication and owner-only navigation. Test source labels from real typed fields only. Use fictional fixtures from existing UAT documents; never upload the reference JPGs or their personal data. Shared CSS changes require manual regression across all pages. A backend contract gap is a new explicitly scoped Issue, not implicit authorization to change financial behavior.
