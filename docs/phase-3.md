# Phase 3 — Cold-Chain Pulse

Implemented per-device hashed credentials and key rotation; constant-time credential comparison; bounded batches; clock-drift handling; 30-day telemetry TTL; replay protection; 30-second monitoring; sustained excursions, quarantine holds, estimated thermal debit; silent-sensor incidents; authenticated store-scoped Socket.IO updates; charts and affected lots; explicit development simulation; real-time CLI simulator; uncompiled HTTPS ESP32 firmware.

Local verification: 120 API tests pass. Cold-chain integration cases cover invalid sensor codes, bad credentials/zone, replay, clock drift, short door spike, sustained excursion, recovery, one-time debit, silent-sensor deduplication, credential rotation, and development-only simulator routing.

Plan reconciliation: the default 10-minute sustained threshold means detection within a processing interval after 10 minutes, not within one minute of the first threshold crossing. The device CLI preserves actual time; accelerated historical scenarios live in a development-only manager route. Never enable that route in production.

Prototype tradeoffs: use a normal MongoDB collection with TTL + unique replay index, because time-series collections do not provide the same unique-index behavior. Move to a time-series collection plus a separate replay receipt ledger if telemetry volume warrants it. The current per-zone serialization is process-local; run one API instance until a distributed lock/queue is added. Debit is an estimated Q10 heuristic, not a laboratory shelf-life prediction. A recovered lot stays quarantined rather than automatically returning to stock.

Pending acceptance: physical sensor calibration; firmware compilation and TLS certificate provisioning; real fridge/door and disconnect tests; sustained ingestion load. Firmware optional humidity/door inputs, watchdog and reconnect backoff are documented as pending.
