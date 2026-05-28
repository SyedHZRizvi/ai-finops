# Production Deployment

Three documented paths. **No code change is required for any of them** — you only edit one config file (or none).

> **Reality check**: a third party — including me — cannot deploy this on your behalf. Hosting requires your account + payment method. What follows is the minimum number of clicks/commands you need.

---

## Option A — Render (recommended for first deploy)

Render's free tier supports Docker, a 1 GB persistent disk, and TLS by default. SQLite works unchanged. Estimated time: **5 minutes**.

### Steps

1. Push this repo to GitHub. See "Push to GitHub" below.
2. Visit <https://dashboard.render.com/blueprints> and click **"New Blueprint Instance"**.
3. Connect your GitHub account, pick the `ai-finops` repo.
4. Render reads [`render.yaml`](render.yaml) and proposes the service. Click **Apply**.
5. Wait ~3 minutes for the first build. Your URL appears at the top: `https://ai-finops-XXXX.onrender.com`.

Render auto-generates `FINOPS_ENCRYPTION_KEY` and `FINOPS_INGEST_TOKEN` for you (see `generateValue: true` in render.yaml). The persistent disk at `/data` survives redeploys.

**Notes:**
- Free tier sleeps after 15 min of inactivity (~30s cold start). For always-on, upgrade to Starter ($7/mo).
- To wire a custom domain: Dashboard → Service → Custom Domains.

---

## Option B — Fly.io

Similar shape, requires CLI. Free tier covers small apps. Estimated time: **5 minutes** after `fly auth login`.

```bash
# One-time
brew install flyctl                 # or curl -L https://fly.io/install.sh | sh
fly auth login                       # opens browser

# Deploy this repo
cd ai-finops
fly launch --copy-config --no-deploy
fly volumes create ai_finops_data --region iad --size 1
fly secrets set \
  FINOPS_ENCRYPTION_KEY=$(openssl rand -hex 32) \
  FINOPS_INGEST_TOKEN=$(openssl rand -hex 32)
fly deploy
```

Your URL: `https://ai-finops.fly.dev` (or whatever app name you chose in `fly launch`).

---

## Option C — Vercel (requires Postgres swap)

Vercel is the canonical Next.js host but is serverless — SQLite cannot persist. You need an external Postgres database. The free path uses **Neon** (free tier: 0.5 GB).

### Steps

1. **Switch to Postgres**: edit [`prisma/schema.prisma`](prisma/schema.prisma), change `provider = "sqlite"` to `provider = "postgresql"`.
2. **Get a Postgres URL**:
   - Easy: sign up at <https://neon.tech>, create a project, copy the connection string.
   - Or use Vercel Postgres from the Storage tab on your project.
3. **Install Vercel CLI and deploy**:
   ```bash
   npm install -g vercel
   vercel login
   cd ai-finops
   vercel link              # creates project
   vercel env add DATABASE_URL                 # paste Postgres URL
   vercel env add FINOPS_ENCRYPTION_KEY        # openssl rand -hex 32
   vercel env add FINOPS_INGEST_TOKEN          # openssl rand -hex 32
   vercel --prod
   ```
4. Vercel runs the build using [`vercel.json`](vercel.json). Your URL: `https://ai-finops.vercel.app`.

After the first deploy, every `git push` to main auto-redeploys.

---

## Option D — Any VM (DigitalOcean / Linode / Hetzner / AWS EC2)

For full control. A $4-6/mo droplet is enough.

```bash
# On a fresh Ubuntu 22.04+ VM, as root:
apt update && apt install -y nodejs npm git curl
git clone https://github.com/SyedHZRizvi/ai-finops.git
cd ai-finops
cp .env.production.example .env
# edit .env — set FINOPS_ENCRYPTION_KEY and FINOPS_INGEST_TOKEN
mkdir -p /data
DATABASE_URL=file:/data/ai-finops.db npm install
DATABASE_URL=file:/data/ai-finops.db npx prisma db push
DATABASE_URL=file:/data/ai-finops.db npm run build
# Run with systemd or pm2:
npm install -g pm2
DATABASE_URL=file:/data/ai-finops.db pm2 start npm --name ai-finops -- start
pm2 save && pm2 startup
```

Add a Caddy or nginx reverse proxy in front for TLS.

---

## Push to GitHub (prerequisite for Options A and C)

```bash
gh auth login                                    # if not already
gh repo create SyedHZRizvi/ai-finops --public --source=. --push
```

That's it — `gh repo create` with `--source=. --push` initializes the remote and pushes the current `main` branch in one shot.

If you prefer the longer form:

```bash
git remote add origin https://github.com/SyedHZRizvi/ai-finops.git
git branch -M main
git push -u origin main
```

---

## After deploy — first-run checklist

1. Visit `https://<your-deployed-url>/setup`.
2. Paste your Anthropic admin key + OpenAI org key.
3. Click "Run import" — pulls 30 days of historical usage.
4. Open `/insights`. See the ranked dollar-impact recommendations.
5. For per-prompt data going forward: roll the SDK ([sdk/](sdk/)) into your top 3 apps by AI spend.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Render build fails on `prisma generate` | Make sure Render's Docker runtime is selected (not Node). The `render.yaml` sets this. |
| Vercel build fails on Prisma | Confirm `DATABASE_URL` env var is set in the Vercel project settings and `prisma/schema.prisma` provider is `postgresql`. |
| /api/credentials returns 503 | `FINOPS_ENCRYPTION_KEY` env var missing on the host. Generate one and set it. |
| Cold start delay on Render free tier | Expected. Upgrade to Starter to keep always-warm. |
| Custom domain shows TLS error | DNS propagation can take up to 60 min. Most hosts issue Let's Encrypt automatically after CNAME is verified. |
