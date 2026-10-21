# Acceptance evidence

## P0 — Local safety boundaries

- Tested: date rules/two-signal inward/manual fallback, role/store access, bounded magic-checked uploads, device rotation, excursion quarantine/debit deduplication, proof closure, fresh dispatch checks and atomic packing.
- Outbox uses actual IndexedDB logic tested with fake-indexeddb: photo-byte replay, account/store scope, UUID dedupe, backoff and retained authorization failures. Packing is prohibited offline. This is not phone airplane-mode acceptance.
- 134 generated authentication/role-denial cases derive from Express middleware. Module suites cover allowed business journeys and cross-store checks; the generated matrix alone is not a complete privilege proof.
- Request-bearing routes validate fields/params using Zod or ingestion schemas. No-input health/metrics/me/stores/network-health need no body schema. Unknown GET query fields are ignored; uniform rejection is deferred. Upload parsing is separately bounded.

## P1 — Reliability and delivery

- Gateway: validated cache, separate provider queues, 15-second per-attempt SDK timeout, maximum two transient retries with jitter/backoff, breaker after five failed logical requests, one probe after 60 seconds, renewed cooldown on failed probe. Total queued latency can exceed 15 seconds.
- Health exposes image-breaker state; `/status` reports connectivity; admin `/metrics` covers request duration, provider/cache outcomes and persisted excursion/dispatch-block counts. Host alert destination still needs configuration; no messages were sent.
- CI verifies format/lint/tests/build/dependencies/history secrets and both Docker images. Hosting hooks and live model smoke are opt-in; actual hosting/previews remain pending.
- Mongo explain shows IXSCAN on store/status/effective-expiry using 12 seeded lots, not a scaling proof. Generated evaluation includes sequential dispatch and rate-limited burst results.
- POSIX SIGTERM integration runs in Linux CI. Windows skips it because termination semantics differ. Local Docker daemon was unavailable; CI image builds do not establish Compose runtime acceptance.

## P2 — Gate before Phase 8

1. Label 200 real pack photos and 40 staged shelf photos; run live-provider evaluators, then `node tools/eval/report.js`. Unit tests do not establish accuracy or a measured zero false-accept rate.
2. Compile/provision ESP32 firmware, calibrate and run physical fridge door/spike/failure/silence tests.
3. Test the installed PWA on a low-end Android under Slow 3G/airplane mode and inspect replay; time three nontechnical users.
4. Configure HTTPS hosting, isolated database, provider terms/keys, backup/restore, retention, production accounts and alert ownership. Smoke actual deployment and previews.
5. Have a food-safety mentor verify current regulatory interpretation/category/temperature limits, and review real-pilot privacy obligations.

Phase 7 external acceptance is **not complete**. Phase 8 remains gated. No fabricated dataset or hosted URL substitutes for these checks.
