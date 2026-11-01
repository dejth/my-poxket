# Card-bill workflow UAT

Use fictional data and a disposable local database with the new migration.
No production migration or financial-data import is part of this change.

1. At `/credit-cards`, create a fictional card: cut-off 17, due day 1.
2. At `/transactions`, enter expenses dated September 17, September 18, and
   October 17. Verify the latter two appear in the bill ending October 17,
   due November 1. Give the September 17 purchase a September 18 bank posting
   date; it should also move to that October bill while remaining September
   activity. A posting date before purchase must be rejected.
3. Add a monthly card subscription and a finite card installment plan with
   October charge dates. Open `/credit-cards` directly. Verify their charges
   appear once with source labels, without entering duplicate transactions.
4. Open the bill and record payment on October 31. Verify its actual payment
   date and status. October cash flow must include the bill payment once;
   generated card charges must not also appear as separate cash obligations.
5. Reopen the paid bill and reverse it. Verify only its linked occurrences
   reopen. Independently paid older occurrences must retain their history.
6. Change the dashboard month. Monthly activity/history must change; its
   clearly labeled current outstanding view remains tied to today.
7. Check `/credit-cards`, `/installments`, and `/recurring-expenses` at 390px
   and desktop widths. Open/close the bill with keyboard and Escape; verify
   focus returns to its button, long names wrap, and actions remain reachable.

The private October mockup uses supplied statements and Numbers as labeled
sources. Its payment action is a simulation, not an import or a payment record.
