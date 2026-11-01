# Overview: calm glass and progressive disclosure

Date: November 1, 2026

This implementation updates the existing application. It uses the owner's
reference for rounded, lightly translucent surfaces and a quiet violet backdrop.
No third-party image, script, font, or financial-data service is introduced.

## Information order

1. Selected month's recorded cash inflow, cash outflow, and their difference.
   This is a monthly flow, not an account balance or spendable-money estimate.
2. Four labeled shortcuts: transactions, card bills, installments, recurring.
3. Current outstanding and upcoming obligations, independent of the selected
   activity month. Show the first four and an explicit expand/collapse action.
   Keep payment actions and overdue labels visible.
4. Five recent transactions in the selected month.
5. Native disclosure sections for purchase-date activity, category breakdowns,
   detailed cash-flow explanation, and paid/cancelled history.

Purchases and later card payments retain their existing separate financial
meanings. No financial query, payment rule, source amount, or database schema
changes are part of this visual refresh. Reserved cash is not inferred as a
new balance or expense.

## Appearance

- Default follows the system's light/dark preference live through CSS.
- A single icon button cycles system, light, and dark on mobile and desktop.
  Its accessible name announces the current and next mode.
- Store only this appearance preference in browser storage; handle blocked
  storage gracefully. Initialize before React renders without inline scripts
  or changes to the Content Security Policy.
- Share semantic tokens across cards, controls, dialogs, navigation, and login.
  Use opaque fallbacks when backdrop blur is unavailable or transparency is
  reduced. Test both palettes' text and status contrast.
- Use a five-column mobile dock with a reserved central slot for the add action;
  avoid covering content with a separate floating button.

## Research used

- [Nielsen Norman Group: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
  — prioritize frequent tasks and reveal secondary information on request.
- [W3C: Contrast Minimum](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum/)
  — ensure readable adjacent foreground/background colors, including glass.
- [MDN: prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-color-scheme)
  and [Chrome: dark mode](https://developer.chrome.com/docs/modern-web-guidance/guides/visual-design/dark-mode)
  — follow system changes, allow a manual override, and theme native controls.
- [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)
  — semantic controls, visible focus, safe areas, reduced motion, and long-content handling.

## Owner UAT

At `/`, check 320px and 390px mobile, tablet, and desktop widths. Cycle through all three
appearance choices and reload; system mode should track OS changes. Verify
long descriptions wrap and the add action stays in the mobile dock. Expand all
obligations and both detail sections; compare totals with the existing cards,
transactions, and history views. Open a payment dialog and cancel it without
recording a payment. Check keyboard focus and Escape. Visual inspection by the
agent does not replace owner acceptance.
