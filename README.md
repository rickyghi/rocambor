# Tresillo Patch (Server + Client infra fixes)

This bundle fixes your build and deployment layout **without touching your engine/bot logic**.

## What’s included
- Root `tsconfig.json` compiling all `*.ts` at the repo root to `dist/`.
- Safer `server.ts` with error handling and graceful shutdown.
- Optional `db.ts` and `redis.ts` that *degrade gracefully* if env vars are missing.
- `package.json` scripts that no longer point to a non-existent `src/` folder.
- A production-ready `canvas-client.html` with reconnect/backoff and proper WS URL.
- `netlify.toml` so Netlify serves the canvas client as the SPA entry.

## Run locally
```bash
npm ci
npm run clean
npm run build
npm start
# open client (serve canvas-client.html with any static server)
```

## Environment variables
- `PORT` (default 8080)
- `NODE_ENV` (production in Railway)
- `DATABASE_URL` (optional; if missing, server runs without DB)
- `REDIS_URL` (optional; if missing, features fall back or no-op)
