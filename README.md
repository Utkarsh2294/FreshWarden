# FreshWarden

The guardian on every shelf. A JavaScript MERN prototype for food-safety operations in dark stores.

## Local setup

Node 20.19+ and npm 10+, Git, and MongoDB 7+ (local or Atlas).

```powershell
npm ci
Copy-Item apps/api/.env.example apps/api/.env
# Edit apps/api/.env: set MONGO_URI and a random JWT_SECRET of 32+ characters.
npm run dev
```

Web: http://localhost:5173. API: http://localhost:5000/health.

| Command                     | Purpose                      |
| --------------------------- | ---------------------------- |
| `npm run dev`               | Start API and Vite together  |
| `npm run lint`              | ESLint                       |
| `npm test`                  | API Jest and web Vitest      |
| `npm run build`             | Production PWA build         |
| `npm run format:check`      | Formatting check             |
| `docker compose up --build` | Mongo, API, web on port 8080 |

API environment variables are documented in `apps/api/.env.example`. `MONGO_URI` and `JWT_SECRET` are mandatory. Provider keys/model names are optional until their phase; unavailable integrations must never fabricate a successful safety check. Web `VITE_API_URL` is empty for same-origin proxying.

Structure: `apps/api` (Express/Mongoose), `apps/web` (React 18/Vite PWA), `tools` (simulator/evaluation), `firmware/esp32`, `docs` (source plan, progress, pilot instructions), `datasets` (private real-photo datasets, not committed).

The source plan and prompts live in `docs/reference`. Consult `docs/PROGRESS.md` for implemented phases and honest acceptance status. Regulatory values remain configurable and unverified until reviewed by a qualified mentor.
