# UI stress audit — before fixes

Development fixture: `/__stress?data=Worst%20case`. Demo / Worst case / Empty / One / 1,000 rows and 200% scale. The fixture passes ordinary Overview props and performs no API writes. Production builds remove the route.

## Surface

| Field                                    | Source                          | Limit / optionality                                         |
| ---------------------------------------- | ------------------------------- | ----------------------------------------------------------- |
| Store and zone names                     | Store model                     | Unbounded model strings; required store, optional zone name |
| Zone type / limits                       | Store zones                     | Three types; numeric configurable values                    |
| Product / batch                          | populated Lot                   | Product may be missing; batch may be absent                 |
| Qty / product count / lot totals         | API numbers and computed totals | Numeric; no display bound                                   |
| Expiry                                   | Lot effectiveExpDate            | May be absent; India timezone                               |
| Status                                   | Lot enum plus shelf-life rule   | Accepted/quarantine/rejected/dispatched/discarded           |
| Collection length                        | Overview lots                   | API bounded; fixture deliberately supplies 1,000            |
| Gate labels, panel headings, status copy | UI strings                      | Fixed English; Hindi product/zone fixture                   |
| Avatar initials                          | Account name in App             | Unicode, optional while loading                             |

No product imagery is rendered in Overview. Evidence photos in operational screens have authenticated loading/error fallback. Dark mode and RTL are not advertised product modes.

## What broke

| #   | Severity | Field / value                         | Evidence                                                                                        | Proposed fix location                                                                       |
| --- | -------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Broken   | Accepted lot with missing/past expiry | Source: green accepted pill with “Near threshold” even if expiry is unknown or already past     | Overview.jsx:198: display actual expiry warning and keep recorded disposition separate      |
| 2   | Broken   | Mobile navigation closed/open         | Source: transformed closed aside retains tab stops; open drawer has no Escape/focus containment | App.jsx:125 and style.css:1062: hide closed drawer, contain/restore focus, inert background |
| 3   | Ugly     | Catalog count 1234567 at 320px        | Browser measurement: strong scrollWidth112 vs clientWidth98; visibly dense two-column metrics   | Overview.jsx:147 and style.css:451: localized numbers and single column at narrow width     |
| 4   | Fragile  | 1,000 flagged lots                    | Source: every row rendered with no paging                                                       | Overview.jsx:176: paginate 25 rows, show exact range and total                              |
| 5   | Fragile  | Emoji-first account name              | Source: `n[0]` splits surrogate/grapheme sequences                                              | App.jsx:185: Intl.Segmenter initials                                                        |
| 6   | Fragile  | Photo draft across zone switches      | Source: old file saved under new effect key                                                     | usePhotoDraft.js: effect scoping; fixed independently in offline commit 107152b             |

Decisions: wrap identifying product/batch/zone strings rather than truncate; paginate instead of adding virtualization; preserve complete numeric counts. These are routine implementation choices covered by the user's explicit request to stress-test and fix.

## What held up

Before fixes, the real browser rendered long product names, Hindi, emoji, unknown products, absent dates and zero quantity. The watchlist scroll container contained the wide table at 320px; no document-level horizontal overflow was observed. Empty state and gate layout exist. Focus and 1,000-row findings are source-confirmed; final browser verification is recorded after implementation.

## Motion audit

See plans/001-remove-repeated-press-motion.md for the separate read-only opportunity and improvement pass. No new motion is justified for frequent safety decisions. Implementation follows the already-authorized hardening pass; no new motion library.

## Separate implementation and final review

| Before                                                 | After                                                                                                 | Why                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Expired accepted lot looked like “Near threshold”      | Explicit red expiry block; unknown expiry needs review                                                | Recorded disposition is not current dispatch eligibility    |
| Mobile offscreen links remained tabbable               | Closed drawer hidden; open drawer contains focus, supports Escape and returns focus; background inert | Keyboard and screen-reader navigation remains predictable   |
| Raw counts overflowed at 320px                         | Locale-formatted counts and responsive grid                                                           | Complete values remain readable                             |
| Every watchlist row rendered                           | 25-row paging with exact range                                                                        | 1,000-row fixture renders 25 rows and advances 1–25 → 26–50 |
| Naive UTF-16 initials                                  | Grapheme segmentation with fallback                                                                   | Emoji/diacritics stay intact                                |
| Press transform inherited by frequent/keyboard actions | Immediate background/border feedback; no authored transition                                          | No delay or motion on repeated safety tasks                 |

Browser checks: long Latin/Hindi/unbroken labels, missing product/expiry, zero quantity, empty state, one-item grammar and 1,000-row paging. Responsive worst-case measurements at 320×740, 768×1024, 844×390 and 1440×1000 showed document width ≤ viewport and no overflowing metric numbers. The explicit 200% scale fixture also passed after the responsive-grid correction. 375×812 verified actual manager sign-in, mobile dialog focus, Escape and return to trigger. Dark mode/RTL are outside supported modes. Real phone behavior remains pending.

Final motion verdict: **Approve** for the authored CSS surface. No new animation warranted; no layout/property frame loops, permanent GPU promotion or blur animation. Reduced-motion and keyboard interactions have the same immediate feedback. Charts remain nonanimated. No slow-motion replay applies once authored motion is removed; real-device feel remains an external check.
