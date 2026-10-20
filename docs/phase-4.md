# Phase 4 — Shelf Sentinel and corrective action

Shelf evidence is compressed/hashed, evaluated through the shared vision gateway and strict schema, and retained with its result and rule version. Poor photos request a retake; provider failure means human inspection is required. Low-confidence findings remain unverified until a supervisor confirms/dismisses with a reason. Confirmed types create grouped incidents with severity-based due times and ownership. Duplicate photos reuse their record and do not create duplicate tasks.

The incident inbox supports paginated review, original evidence, corrective action and new proof photos. Closure re-inspects the proof; an unavailable provider or persistent finding keeps the incident open. Sensor incidents additionally require recovered telemetry. Dismissals are retained in the review trail. A scheduled monitor raises missed-scan incidents.

Verification includes schema/people privacy checks, severity SLAs, duplicates, poor/unavailable analysis, missing proof, verified closure, role denial and missed-scan deduplication. Vision responses are mocked in integration tests; no shelf accuracy claim is established by them.

Pending: 40 staged photos, measured per-type precision/recall using `tools/eval/runShelfEval.js`, real Gemini and physical capture validation. `truth.json` is an array of `{filename,types:["MOULD"],photoQuality:"good",mimeType:"image/jpeg"}`. No dataset or performance result has been invented. Candidate lot matching from visual product names and per-zone scan frequency overrides remain prototype follow-ups; shelf findings never automatically reject a lot.
