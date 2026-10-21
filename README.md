# FreshWarden

The guardian on every shelf. A plain-JavaScript MERN prototype with inward verification, cold-chain monitoring, shelf inspection/CAPA, dispatch vetoes, audit PDFs, and expiring inspector access.

## Run locally

Node 20.19+ and npm are required. From the repository root:

```powershell
npm ci
npm run demo
```

Open [the workspace](http://localhost:5177). Manager phone: `9000000001`. The generated password is in `.local/demo-credentials.json`, ignored by Git. Receiver/picker/area/admin phones end in 2/3/4/5. The demo starts a persistent local Mongo replica set, seeds 150 synthetic products and five stores, and starts API/web. First launch downloads MongoDB from its official distribution. Ports 5000 and 5177 must be free. Stop with Ctrl+C. Provider accounts are optional for manual-review flows.

For your own database, copy `apps/api/.env.example` to `apps/api/.env`, set a replica-set/Atlas `MONGO_URI` and random 32+ character `JWT_SECRET`, set a temporary `SEED_PASSWORD`, then run `npm run seed` and `npm run dev`. Web uses 5173 in this mode. Never put provider keys in public `VITE_*` variables.

| Command                                 | Purpose                                                  |
| --------------------------------------- | -------------------------------------------------------- |
| `npm run demo`                          | Complete synthetic workspace on 5177                     |
| `npm run dev`                           | API/Vite with your configured database                   |
| `npm run lint` / `npm run format:check` | Source checks                                            |
| `npm test`                              | API Jest + web Vitest                                    |
| `npm run build`                         | Production PWA                                           |
| `node tools/route-table.js`             | Generate authorization inventory                         |
| `node tools/eval/runLocalBench.js`      | Isolated HTTP/replica-set benchmark                      |
| `node tools/eval/report.js`             | Generate measured evaluation                             |
| `docker compose up --build`             | Local replica-set/API/web on 8080; API env file required |

In PowerShell, set `$env:NODE_ENV='test'` before the isolated benchmark to silence request logs. Its evidence contains synthetic IDs only. Real photo datasets stay outside Git.

## Three acceptance checks

1. Manually verify a photographed pack in Inward Gate. It must require review; an unavailable model must never invent a date.
2. Run the clearly labelled development compressor-failure trace. Inspect excursion, quarantine, incident and estimated debit. A trace is not hardware validation.
3. Check rejected/quarantined stock in Dispatch Guard. The server must block packing; a healthy order still requires fresh sensor coverage, delivery-time expiry, FEFO and separate bag confirmations.

Offline scans retain evidence locally. Keep the app open after reconnecting, watch sync status, and review the server result. Offline evidence never accepts or packs stock. Saved inventory is informational; server status wins.

## Delivery evidence

- [Progress and phase gates](docs/PROGRESS.md), [acceptance checklist](docs/ACCEPTANCE.md)
- [Measured evaluation](docs/eval.md), [route access](docs/route-access.md), [UI audit](docs/ui-hardening-audit.md)
- [Deployment steps and environment](docs/deployment.md)
- [English/Hindi onboarding](docs/pilot/onboarding.md), [privacy](docs/pilot/privacy.md), [ROI and limits](docs/pilot/roi-and-limits.md)

Status page: `/status`. API health: `/health`. Prometheus: `/metrics`, admin JWT required. API/evidence responses are private/no-store. App assets are precached; inventory snapshots are scoped to account/store.

Phases 0–6 are implemented. Phase 7's local implementation and verification are documented; hosted deployment, live providers, 200 real inward photos, 40 shelf photos, calibrated ESP32/fridge tests and real Android usability remain external acceptance work. Phase 8 is gated until those pass. Configured regulatory thresholds and thermal/risk estimates are not legal or laboratory certification.

Structure: `apps/api` Express/Mongoose, `apps/web` React18/Vite PWA, `tools` evaluation/simulators, `firmware/esp32`, `docs/reference` original plan/prompts. No TypeScript source or hardcoded provider model names.
