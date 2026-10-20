# Phase 1 — platform and rules

Implemented MongoDB models/indexes, JWT sign-in with fresh account lookup, role/store access checks, streaming bounded CSV import with row errors, zone configuration, versioned shelf-life rules, deterministic FEFO, Indian label-date parsing, and thermal heuristics. Seeds are synthetic and idempotent: 1 store, 3 zones, 5 role accounts, 150 products, 12 lots.

Local verification: 86 API tests and 2 web tests passed; pure rules coverage: 100% statements and lines, 97.47% branches. MongoDB integration tests use an actual temporary MongoDB process, not a database mock. Tests cover sign-in, bad passwords, expired JWTs, NoSQL input, role denials, cross-store access, CSV rows, and catalog lookup.

The UI provides a real login, assigned store selector, inventory watchlist, and navigation. Later module pages are explicitly unavailable until their phase is implemented. Hindi currently covers navigation and shared state labels; operational forms will gain translated strings alongside each module.

Run `npm run demo` for a local persisted MongoDB process and synthetic seed. Generated credentials live in `.local/demo-credentials.json`, outside Git. A normal deployment uses configured MongoDB, `JWT_SECRET`, and an explicit `SEED_PASSWORD` for initial accounts.

Acceptance to check: sign in with manager account; inspect seeded catalog lookup `8900000000000`; verify picker gets HTTP 403 on `/api/rules`. A physical Android phone and hosted deployment are still pending.
