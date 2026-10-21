# Remove repeated press motion

- Status: TODO
- Commit: 107152b
- Severity: HIGH
- Category: Purpose and frequency
- Scope: apps/web/src/style.css only

## Audit

React dashboard, plain CSS, no motion dependency. Only authored animation: `.button, .gate { transition: transform 120ms var(--ease) }` and `:active { transform: scale(.98) }` at style.css:998–1006, gated by reduced motion. Core gates, scan buttons and keyboard actions repeat many times per shift. Navigation, verdict changes, charts and lists are already immediate. Recharts explicitly disables entrance animation. No layout animation, CSS variable frame loop, blur animation, rAF loop, or `will-change` promotion exists.

| Severity | Location                   | Finding                                                              | Fix                                                                               |
| -------- | -------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| HIGH     | apps/web/src/style.css:998 | Keyboard activation and frequent scan actions inherit press movement | Remove transform/transition block; preserve immediate color/border/focus feedback |

## Opportunity filter

| Candidate               | Frequency             | Purpose             | Budget  | Functional decision                    |
| ----------------------- | --------------------- | ------------------- | ------- | -------------------------------------- |
| Safety verdict entrance | Hundreds/shift        | State indication    | Instant | Reject: read the decision immediately  |
| Chart entrance          | Frequent live updates | None                | Instant | Reject: data readability               |
| Navigation drawer       | Frequent/keyboard     | Spatial consistency | Instant | Reject: predictable focus matters more |
| Queue status change     | Occasional            | State indication    | Instant | Text/status announcement suffices      |

No additive motion is justified. This is the complete quick audit of the small motion surface, with no delegation required.

## Execution

After the read-only audit, use the user's already-authorized hardening/fix pass. Delete only the reduced-motion press-transform block. Do not introduce a library or other animation. Keep existing hover capability queries and visible focus. Add immediate `:active` color/border feedback if needed.

## Verification

Run lint and production build. Activate core buttons with mouse and keyboard; no movement or delay. Inspect authored CSS for animation/transition/transform declarations; only static drawer positioning may remain. Reduced-motion has identical immediate behavior. No slow-motion replay is applicable once movement is removed. Real-device feel remains a pilot check.
