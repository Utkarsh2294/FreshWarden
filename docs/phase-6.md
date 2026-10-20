# Phase 6 — Compliance and command center

Implemented evidence-backed daily checklist, explainable per-lot risk, coverage-aware store health, 15-minute health snapshots, network map and store/history tables, daily PDF with temperature traces/evidence thumbnails/rule references, and expiring revocable inspector access. The network seed adds four synthetic stores and assigns them to area/admin accounts; absent readings or historical records stay absent.

Groq can select only IDs of supplied factual sentences. It cannot insert a new number or legal claim into a rendered summary; missing provider access uses the deterministic source facts. Provider selection is optional and separate from safety decisions.

Verification: 169 API + 2 web tests passed before final layout refinements, including report byte hashes, snapshot counts, insufficient coverage, summary fact containment, Indian day boundaries, read-only token scope, expiry, revocation and cross-store access. A two-page sample was rendered and visually inspected with Poppler; the initial missing Latin glyphs and extra footer pages were fixed. The bundled OFL Noto font handles Devanagari text with Helvetica for Latin runs.

The JSON snapshot SHA-256 is printed inside the PDF. The SHA-256 of the complete PDF bytes is returned in `X-Report-SHA256` and stored in AuditReport; a file cannot directly contain its own full-byte hash without a self-reference problem. Inventory is explicitly the current register at generation time, not a reconstructed historical stock position. Daily activity counts use Indian day boundaries. Reports are bounded to the prototype limits (1,000 lots/incidents, 10,000 daily readings, 100 evidence metadata records; PDF register shows up to 100 lots and 50 incidents).

Pending: real evidence, real provider/latency evaluation, complete Hindi report prose, repeat-offender/trend charts beyond the recorded history table, and deployment access. No fake 7/30-day trend or health score is seeded. A link is a bearer capability: distribute it only to the intended inspector; all accesses are counted and token values are redacted from request logs.
