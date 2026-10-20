# Phase 2 — Inward Gate

Implemented label photo capture, browser barcode decoding, crop controls and OCR, manual fallback, server-side validation, SHA-256 evidence retained in MongoDB, two-signal checks, configurable shelf-life rules, supervisor correction and disposition, store-scoped evidence retrieval, idempotent scan requests and confirmations, and persisted IndexedDB capture drafts.

Local checks: 108 API tests + 2 web tests pass. The gateway is tested with mocked provider responses for caching, malformed output and provider unavailability. MongoDB and Express are exercised in integration tests. These tests do not establish live Gemini correctness or OCR accuracy.

Evidence buffers are compressed JPEGs at a maximum 1280px dimension and kept in the Evidence collection for the bounded prototype. Move them to GridFS/object storage with explicit retention before a large pilot. Temperature and shelf/dispatch integrations are subsequent phases.

Pending acceptance: 30 real pack photos, actual phone camera and OCR capture, configured live Gemini model and its measured latency, and zero false accepts measured on the labelled photo set. `tools/eval/runInwardEval.js` refuses to claim photo acceptance without the real inputs. No metrics have been invented. Month/year labels normalize to the month end in the rule engine; the current manual form uses an exact date picker.

Known prototype ceilings: native file capture rather than a continuous camera stream; keyboard-accessible crop sliders rather than a draggable crop rectangle; grayscale/contrast preprocessing rather than adaptive thresholding; no automatic cross-scan batch merging. These do not remove evidence or the supervisor review path.
