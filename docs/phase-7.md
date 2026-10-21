# Phase 7 — Hardening

P0: preserve evidence offline, keep server approval authoritative, test replay and authorization, fix mobile focus, verify CI. P1: metrics, provider recovery, replica-set deployment, generated evaluation. P2: hardware/phone/photo validation and hosted rollout require external access and evidence.

## Offline conflict policy

The shared capture database upgrades from version 1 without dropping drafts. Inward and shelf submissions first persist compressed photo bytes and fields in an account/store-scoped outbox (maximum 50 per scope). Authorization tokens stay in session storage. Online replay uses bounded exponential backoff; invalid/unauthorized requests stop retrying automatically and retain evidence for review or explicit removal. Successful replay invalidates queries and removes the queued copy. Keep the app open after reconnecting; closed-app background execution is not guaranteed.

Inward request UUIDs and shelf photo hashes deduplicate server records. Replayed evidence never accepts a lot. A receiver/supervisor reviews the server verdict separately. Packing always requires a fresh server transaction; dispatch drafts remain local and never grant offline approval. The server wins for lot status; the client retains unsynced evidence. Last-synced inventory is marked with its timestamp and is informational only. A 401/403 never falls back to a snapshot. Shared devices must use separate OS/browser profiles; queued evidence remains on the device until sync or explicit deletion.

Automated IndexedDB checks exercise deduplication, scoped replay, failure backoff, retained evidence, forbidden offline packing, and snapshot authorization boundaries. Real Android airplane-mode/Slow 3G checks remain pending.

## Final local delivery

Session metadata caches use a token digest as the key (never the token itself) so an already signed-in session can reopen saved account/store context offline. All offline inventory is informational. Authentication/authorization errors never return cached data. New captures clear stale fields; concurrent replays converge on a unique server record. Duplicate compressed evidence rows can remain from simultaneous requests; retention reconciliation is a production follow-up.

See ACCEPTANCE.md for the P0/P1/P2 checklist, route-access.md for the generated policy inventory, ui-hardening-audit.md for separate audit/fix evidence, eval.md for generated measurements, deployment.md for host activation and pilot/ for onboarding/privacy/ROI. All credentials and external acceptance gaps are explicitly separated from local/mock evidence.
