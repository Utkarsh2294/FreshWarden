# Phase 5 — Dispatch Guard

Implemented exact-lot pick checks at delivery ETA + configured buffer, accepted-state/stock checks, effective expiry, current temperature and fresh sensor coverage, deterministic FEFO suggestion and veto, repeated-block quarantine, bilingual reasons, and persisted order/check records. No model provider runs in this path.

Packing re-checks the database and uses a MongoDB transaction to decrement every item and mark the order packed together. Duplicate lot rows aggregate before checking. A checked revision cannot pack after an order edit, repeat packing is idempotent, and concurrent pickers cannot consume the same last unit. Mixed food/non-food orders require different bag IDs. A supervisor may record a FEFO exception with an incident; expiry, quarantine, stock and temperature blocks cannot be overridden.

Local API checks: 153 tests passed, including 50 HTTP checks (10 bad orders blocked, no false blocks in the controlled test store), transaction concurrency, separate bags, stale revisions and provider-import exclusion. The test store uses a temporary one-member MongoDB replica set. This is not a 50-rps load test or production latency measurement.

`node tools/eval/simulateOrders.js --demo` measures 50 sequential HTTP calls against the running development API and writes `docs/evaluation/dispatch-results.json`. Ensure all relevant zones have fresh normal telemetry first; missing coverage correctly blocks even an otherwise healthy lot. The demo launcher now starts a persistent single-member replica set; restart an older running standalone demo before packing. Atlas already supports transactions; a standalone MongoDB server does not.

Offline picks are saved as drafts, never approved for dispatch. Reconnect and re-check on the server before packing. Automatic replay of a physical dispatch is deliberately disallowed. The bounded prototype queries store lots in memory; replace with product-scoped indexed projections before a large inventory pilot. Native file/barcode lookup is available; continuous scanner mode and sound feedback remain optional follow-ups.
