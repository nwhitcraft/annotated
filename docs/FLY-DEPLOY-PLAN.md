# Fly.io Deployment Plan — Annotated

**Status:** Ready to execute (do NOT clone yet — wait for Codex to finish)

---

## Architecture

One Fly.io app that serves **both** the API (Hono on port 3080) and the static frontend (Vite build output). The API serves the built frontend files directly — no separate hosting needed.

### Why NOT clone the repo?

**You don't need to clone.** Fly.io deploys from the existing repo via GitHub Actions. Every push to `main` (or whichever branch you set) triggers an automatic redeploy. Changes are live in ~2 minutes.

### Database Security

✅ **SQLite file lives on a persistent Fly volume** mounted at `/data`. It is:
- **Not publicly accessible** — no HTTP route exposes it
- **Encrypted at rest** by Fly's volume infrastructure
- **Persistent across deploys** — survives restarts and new builds
- **Backed up** via `fly volumes snapshot`
- **WAL mode already enabled** in your `db.js` — good for concurrent reads

The only change needed: make `db.js` use `/data/annotated.db` in production instead of the relative `./data/` path.

### Auto-Deploy (Changes Go Live Automatically)

GitHub Actions workflow: every push to `main` → build Docker image → deploy to Fly. No manual steps after initial setup.

---

## Files to Create

### 1. `Dockerfile` (repo root)

```dockerfile
FROM node:20-alpine AS frontend

WORKDIR /build
COPY apps/web/package*.json ./apps/web/
RUN cd apps/web && npm ci

COPY apps/web/ ./apps/web/
RUN cd apps/web && npm run build

# --- Production image ---
FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY packages/api/package*.json ./
RUN npm ci --only=production && npm rebuild better-sqlite3

COPY packages/api/ ./

# Copy built frontend into API's public dir
COPY --from=frontend /build/apps/web/dist ./public

EXPOSE 8080
CMD ["node", "src/index.js"]
```

### 2. `fly.toml` (repo root)

```toml
app = "annotated-app"
primary_region = "sin"

[build]

[env]
  NODE_ENV = "production"
  PORT = "8080"
  DB_PATH = "/data/annotated.db"

[[mounts]]
  source = "data"
  destination = "/data"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
```

### 3. `.github/workflows/deploy.yml`

```yaml
name: Fly Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    name: Deploy to Fly.io
    runs-on: ubuntu-latest
    concurrency: deploy-group
    env:
      FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
```

### 4. Modify `packages/api/src/db.js`

Change the DATA_DIR logic:
```js
const DATA_DIR = process.env.DB_PATH
  ? dirname(process.env.DB_PATH)
  : join(__dirname, '..', 'data');

const dbFile = process.env.DB_PATH
  ? process.env.DB_PATH
  : join(DATA_DIR, 'annotated.db');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(dbFile);
```

### 5. Modify `packages/api/src/index.js`

Add static file serving for the frontend in production:
```js
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync } from 'fs';

// Serve static frontend (after all API routes)
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './public' }));
  // SPA fallback — serve index.html for client-side routes
  app.get('*', (c) => {
    const html = readFileSync('./public/index.html', 'utf-8');
    return c.html(html);
  });
}
```

### 6. `.dockerignore` (repo root)

```
node_modules
.git
apps/desktop
apps/extension
*.md
docs/
data/
```

---

## Setup Steps (One-Time, ~15 min)

```bash
# 1. Install flyctl
brew install flyctl

# 2. Login
fly auth login

# 3. Create the app (from repo root)
cd /path/to/annotated
fly launch --name annotated-app --region sin --no-deploy
# Choose Singapore (sin) — closest to Bangkok

# 4. Create persistent volume for SQLite
fly volumes create data --region sin --size 1

# 5. Set secrets (OAuth keys etc)
fly secrets set \
  GOOGLE_CLIENT_ID=your_google_client_id \
  GOOGLE_CLIENT_SECRET=your_google_client_secret \
  JWT_SECRET=your_jwt_secret

# 6. Add FLY_API_TOKEN to GitHub
fly tokens create deploy
# Copy token → GitHub repo → Settings → Secrets → FLY_API_TOKEN

# 7. Deploy
fly deploy

# 8. Open it
fly open
```

After this, every `git push origin main` auto-deploys. Done.

---

## Merge Strategy

Before deploying:
1. Ensure all Codex work is committed on `frontend-v2`
2. Merge `frontend-v2` → `main`: `git checkout main && git merge frontend-v2`
3. Push: `git push origin main`
4. GitHub Actions picks it up → deploys to Fly

---

## Cost

Fly.io free tier covers:
- 3 shared-cpu-1x VMs
- 3GB persistent volume storage
- 160GB outbound transfer/month

This project fits comfortably in free tier.

---

## Auto-Sleep Strategy

**For bounty submission:** auto-sleep is **OFF** (`auto_stop_machines = "off"`, `min_machines_running = 1`). The server stays on 24/7 so Jason never hits a cold start delay. Free tier hours cover this.

**After bounty:** To save money, change `fly.toml` to:
```toml
auto_stop_machines = "stop"
min_machines_running = 0
```
Then `fly deploy`. Server sleeps when idle, wakes in 2-4 seconds on any request (website visit, Chrome extension API call, desktop app API call).

---

## Desktop App (.dmg) Download Hosting

**The download page (`/download`) lives on Fly.io.** The actual `.dmg` file does NOT.

### Hosting: Cloudflare R2 (free tier)
- Bucket: `annotated-downloads`
- Public URL: `https://pub-8e1040a752d1451998c6bbdb3e4117d2.r2.dev/Annotated.dmg`
- Download button on `/download` page links directly to this URL
- User clicks button → browser auto-downloads the `.dmg` → they never see Cloudflare or GitHub
- Repo stays private — no impact on downloads
- Free tier: 10GB storage, 10M reads/month, $0
