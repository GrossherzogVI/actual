# Finance OS — Deployment Guide

**Generated:** 2026-02-26
**Target:** VPS (212.69.84.228), Docker Compose, self-hosted

---

## Infrastructure Overview

```
GitHub (master branch)
  └─► GitHub Actions CI
        ├── Build Docker image (web + worker)
        ├── Push to GHCR (ghcr.io/grossherzogvi/actual-budget)
        └── SSH deploy to VPS
              └─► docker compose pull + up
                    ├── surrealdb (SurrealDB 3.0)
                    ├── web (Nginx serving React SPA)
                    └── worker (Node.js process)
```

---

## CI/CD Pipeline (`.github/workflows/deploy.yml`)

**Triggers:** Push to `master` branch

**Steps:**
1. Checkout code (pinned SHA for security)
2. Set up Docker Buildx
3. Login to GHCR (`docker/login-action` pinned SHA)
4. Build and push image (`docker/build-push-action` pinned SHA)
5. SSH to VPS:
   - `docker compose pull`
   - `docker compose up -d --remove-orphans`
   - Health check via HTTP endpoint
6. Notify on success/failure

**Security notes:**
- All GitHub Actions pinned to SHA (not floating tags)
- VPS IP sourced from GitHub secret (no hardcoded IPs)
- GHCR credentials via `GITHUB_TOKEN`

---

## Production Docker Compose (`infra/docker-compose.prod.yml`)

```yaml
services:
  surrealdb:
    image: surrealdb/surrealdb:v3.0.0
    command: start --log info --user ${SURREALDB_USER} --pass ${SURREALDB_PASS}
             --bind 0.0.0.0:8000 surrealkv://data/finance.db
    volumes:
      - surrealdb-data:/data
    healthcheck:
      test: ['CMD', 'surreal', 'isready', '--conn', 'http://localhost:8000']
      start_period: 15s

  web:
    image: ghcr.io/grossherzogvi/actual-budget:latest
    # Nginx serving built React SPA

  worker:
    image: ghcr.io/grossherzogvi/actual-budget:latest
    environment:
      - SURREALDB_URL=ws://surrealdb:8000
      - SURREALDB_USER=${SURREALDB_USER}
      - SURREALDB_PASS=${SURREALDB_PASS}
      - OLLAMA_URL=${ACTUAL_OLLAMA_URL}
      - OLLAMA_MODEL=${ACTUAL_OLLAMA_MODEL:-mistral-small}
```

---

## Required Secrets (GitHub)

| Secret | Description |
|--------|-------------|
| `VPS_HOST` | VPS hostname/IP |
| `VPS_USER` | SSH user |
| `VPS_KEY` | SSH private key |
| `SURREALDB_USER` | SurrealDB root username |
| `SURREALDB_PASS` | SurrealDB root password |
| `ACTUAL_OLLAMA_URL` | Ollama endpoint URL |

---

## Local Development vs. Production

| Setting | Local | Production |
|---------|-------|-----------|
| SurrealDB URL | `ws://localhost:8000` | `ws://surrealdb:8000` (Docker network) |
| Auth | Root credentials (.env) | GitHub Secrets → docker-compose env |
| Web served by | Vite dev server (HMR) | Nginx (built static files) |
| Worker | `tsx watch` (auto-restart) | Node.js production (`tsx src/main.ts`) |
| Ollama | `http://localhost:11434` | VPS Ollama or `ACTUAL_OLLAMA_URL` |

---

## First-Time VPS Setup

```bash
# 1. SSH to VPS
ssh user@212.69.84.228

# 2. Create deployment directory
mkdir -p /opt/finance-os && cd /opt/finance-os

# 3. Copy infra/docker-compose.prod.yml from repo
# 4. Create .env file with all secrets:
cat > .env << 'EOF'
SURREALDB_USER=your-root-user
SURREALDB_PASS=strong-password-here
ACTUAL_OLLAMA_URL=http://localhost:11434
ACTUAL_OLLAMA_MODEL=mistral-small
EOF

# 5. Pull and start
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# 6. Apply schema (one time)
docker exec -it finance-os-surrealdb-1 surreal import \
  --conn http://localhost:8000 \
  --user $SURREALDB_USER --pass $SURREALDB_PASS \
  --ns finance --db main \
  /schema/001-financial-core.surql
# ... repeat for each schema file in order
```

---

## Database Backup

`scripts/backup-surrealdb.sh` — automated backup script with retention policy.

```bash
# Manual backup
./scripts/backup-surrealdb.sh

# Scheduled via cron (example):
# 0 3 * * * /opt/finance-os/backup-surrealdb.sh
```

Backup location: `/data/backups/` with timestamp. Retention: 7 days by default.

---

## Health Checks

| Check | URL | Expected |
|-------|-----|---------|
| SurrealDB | `http://vps:8000/health` | 200 OK |
| Web (Nginx) | `http://vps:80/` | 200 with HTML |

CI pipeline verifies both after deploy before marking deployment successful.

---

## Rollback

```bash
# SSH to VPS
docker compose -f docker-compose.prod.yml pull --no-parallel \
  --tag ghcr.io/grossherzogvi/actual-budget:previous-sha
docker compose -f docker-compose.prod.yml up -d
```

Or via GitHub Actions: re-run a previous workflow to redeploy that commit's image.
