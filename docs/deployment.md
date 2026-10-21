# Deployment preparation

No hosting resources have been created. Select only a free plan explicitly available in your account; do not accept a paid upgrade to follow these instructions. Verify current provider terms/model availability in their consoles.

## Local containers

1. Start Docker Desktop. Copy the API env example, generate a strong JWT secret, and configure a temporary seed password locally. Compose overrides database URI and client origin.
2. Run `docker compose up --build -d`. Mongo initializes a single-member replica set; transactions are mandatory for packing.
3. Run `docker compose exec api node apps/api/src/seed.js` only for an isolated prototype database.
4. Open `http://localhost:8080`, inspect `/health`, sign in and test a real pack transaction. Compose Mongo has no authentication and binds its host port to loopback: it is a local environment.

Both Docker images build in CI. Docker Desktop's local daemon was unavailable during hardening; Compose runtime and browser OCR under the Nginx CSP remain pending. The CSP permits current OCR CDN/worker and map origins; verify live integrations before a pilot.

## Render API + Vercel web

1. Create/reuse an Atlas replica-set database with a dedicated database user and approved application network access.
2. Connect this repository in Render as a Docker web service, repository root, Dockerfile `apps/api/Dockerfile`, health path `/health`. Configure the environment below. The container binds `HOST=0.0.0.0` and the host-provided `PORT`.
3. Connect this monorepo in Vercel: repository root, install `npm ci`, build `npm run build`, output `apps/web/dist`. Add the SPA rewrite `/(.*)` → `/index.html`, preserving existing static assets. Set `VITE_API_URL` to the actual HTTPS API origin before building. API requests and Socket.IO use that origin.
4. Set API `CLIENT_ORIGIN` to the exact HTTPS web origin. Set `TRUST_PROXY=1` only for a single trusted ingress. Verify CORS and websocket connectivity. Give PR previews their own API/database and exact allowed origin; never relax CORS to `*`.
5. Seed only an isolated prototype instance via controlled shell with temporary `SEED_PASSWORD`. Demo accounts are prototype-only. Individually managed accounts, onboarding/recovery and retention procedures are prerequisites for real operations.
6. Smoke login, cross-store denial, upload, model-down manual review, sensors, expiry veto, concurrent packing, PDF download, inspector expiry/revocation and offline replay over HTTPS. Verify each host's completed deployment and logs.

| Variable                                 | Where            | Meaning                                                             |
| ---------------------------------------- | ---------------- | ------------------------------------------------------------------- |
| `MONGO_URI`                              | API secret       | Authenticated replica-set/Atlas URI                                 |
| `JWT_SECRET`                             | API secret       | Random 32+ characters; rotation revokes sessions                    |
| `CLIENT_ORIGIN`                          | API              | Exact web origin                                                    |
| `PORT`, `HOST`                           | API host         | Host port; 0.0.0.0 in container                                     |
| `NODE_ENV`                               | API              | production disables simulator                                       |
| `TRUST_PROXY`                            | API              | 0 direct; 1 for one trusted ingress                                 |
| `GEMINI_API_KEY`, `GEMINI_VISION_MODEL`  | API              | Optional image-provider secret/config; missing means human review   |
| `GROQ_API_KEY`, `GROQ_TEXT_MODEL`        | API              | Optional text-provider secret/config; deterministic fallback        |
| `LLM_MAX_RPM_GEMINI`, `LLM_MAX_RPM_GROQ` | API              | Account-specific rate ceilings; 12/25 examples are not quota claims |
| `SEED_PASSWORD`                          | Temporary secret | Explicit seeding only; remove afterward                             |
| `GROQ_WHISPER_MODEL`                     | API              | Reserved, unused until gated Phase 8                                |
| `DEVICE_SHARED_SECRET`                   | API              | Legacy unused example; actual devices use unique hashed keys        |
| `VITE_API_URL`                           | Web build        | Public HTTPS API origin; never a provider key                       |

## CI activation and operations

CI checks formatting, lint, tests, build, high-severity production dependency audit, gitleaks history scan, and Docker images. Main deployment stays skipped until repository variable `ENABLE_DEPLOY=true` and secrets `RENDER_DEPLOY_HOOK_URL` / `WEB_DEPLOY_HOOK_URL` are configured. Disable independent host main auto-deploys if CI should be the gate. Hook acceptance requests a deployment; inspect the host's final status and actual URLs afterward.

Vercel Git integration can provide PR previews after account connection; no preview URL is claimed here. Optional nightly smoke requires `ENABLE_MODEL_SMOKE=true`, provider-key secrets and model-name variables. It sends one tiny synthetic image and one text request through the gateway, with SDK/gateway retries disabled. It is disabled by default and does not establish photo accuracy.

Use host-native health/error alerts until an explicit alert destination is configured. No Telegram/Discord messages were sent. Rotate JWT secrets via host settings and force re-login; overlapping signing keys remain production work. Rotate sensor keys via manager UI and reprovision devices. Back up Mongo and test restoration. Roll back an application image/commit without deleting data volumes.

Official references checked: [Render web services](https://render.com/docs/web-services), [deploy hooks](https://render.com/docs/deploy-hooks), [Vercel monorepos](https://vercel.com/docs/monorepos), [rewrites](https://vercel.com/docs/routing/rewrites).
