# Deploying Zac

Zac is deployed as two parts:

```
Browser ──► Netlify (static app)
              └─ /api/*  ──proxy──►  VPS: Caddy (HTTPS) ──► Zac API (Node, 127.0.0.1:8787)
                                                              └─ /var/lib/zac/claims.json
```

The browser only ever talks to the Netlify site. Netlify proxies `/api/*` to the VPS, so the
Content-Security-Policy keeps `connect-src 'self'` and no cross-origin requests are needed.

You need:

- a VPS running **Ubuntu 22.04 or 24.04** with SSH access as a sudo user;
- a **hostname for the API** that points at the VPS (for example `api.yourdomain.com`). No domain?
  Use the free `sslip.io` name for your IP: for `203.0.113.7` it is `203-0-113-7.sslip.io`.
  It resolves to your IP automatically and works with HTTPS;
- a **Netlify** account connected to GitHub.

Replace `api.example.com` below with your API hostname and `YOUR_VPS_IP` with the server's IP.

---

## Part 1 — the API on the VPS

### 1. Point the hostname at the VPS

If you use your own domain, add a DNS **A record**: `api` → `YOUR_VPS_IP`. (Skip this for sslip.io.)

Check it from your computer: `ping api.example.com` should show `YOUR_VPS_IP`.

### 2. Log in and open the firewall

```bash
ssh youruser@YOUR_VPS_IP

sudo apt update && sudo apt -y upgrade
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

Port 8787 stays closed to the internet: the API only listens on `127.0.0.1`.

### 3. Install Node.js 24 and git

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs git
node -v    # v24.x
```

### 4. Get the code

```bash
sudo useradd --system --home /opt/zac --shell /usr/sbin/nologin zac
sudo git clone https://github.com/mhizer-fatai/zac.git /opt/zac
cd /opt/zac
sudo npm ci
sudo npm test
sudo chown -R zac:zac /opt/zac
```

`npm ci` installs the dev dependencies too; the API runs through `tsx`, which is one of them.

### 5. Run it as a service

```bash
sudo cp /opt/zac/deploy/zac-api.service /etc/systemd/system/zac-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now zac-api
sudo systemctl status zac-api --no-pager     # should say "active (running)"
curl http://127.0.0.1:8787/api/health        # {"ok":true,...}
```

The service runs as the unprivileged `zac` user, listens on localhost only, restarts on failure and
can write nothing except `/var/lib/zac`, where the signed name records are stored.

### 6. Put HTTPS in front with Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

sudo cp /opt/zac/deploy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/api.example.com/YOUR_API_HOSTNAME/' /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy obtains the HTTPS certificate on its own within a minute. Test from your computer:

```bash
curl https://YOUR_API_HOSTNAME/api/health       # {"ok":true,...}
curl https://YOUR_API_HOSTNAME/api/directory    # {"version":1,...,"claims":[...]}
```

Caddy writes no access log (there is no `log` directive), and the API logs one startup line only.

---

## Part 2 — the app on Netlify

1. Netlify → **Add new site → Import an existing project → GitHub** → choose `mhizer-fatai/zac`.
2. Build settings are read from `netlify.toml`; leave them as they are.
3. **Site configuration → Environment variables**, add:
   - `ZAC_API_ORIGIN` = `https://YOUR_API_HOSTNAME` (no trailing slash)
   - `VITE_SOURCE_URL` = `https://github.com/mhizer-fatai/zac` (optional; shows the GitHub link)
4. **Deploy**. The build fails on purpose if `ZAC_API_ORIGIN` is missing or not `https://`.
5. Open the site, then `https://YOUR_SITE.netlify.app/api/health` — it should return the VPS's
   `{"ok":true,...}`. If it does, the proxy works.

---

## Alternative — the API on Render (free) with a Neon database

The live deployment uses this instead of a VPS. Render's free plan has no persistent disk, so
claims are stored in a free Neon Postgres database (set `DATABASE_URL`; the API creates its two
tables on first start).

1. Neon: create a project and copy its connection string (`postgresql://…?sslmode=require`).
2. Render: **New → Web Service** → this repo, then:
   - Build command: `npm ci` · Start command: `npm start` · Instance type: Free
   - Environment: `NODE_VERSION=24`, `DATABASE_URL=<the Neon connection string>`
3. The log should show `… · postgres storage`. Point Netlify's `ZAC_API_ORIGIN` at the service URL.

Free Render services sleep after 15 minutes idle; the first request then takes about a minute.
A free uptime monitor that requests `/api/health` every 10 minutes keeps it awake.

---

## Updating

On the VPS:

```bash
cd /opt/zac
sudo -u zac git pull
sudo -u zac npm ci
sudo systemctl restart zac-api
```

Netlify redeploys by itself on every push to `main`.

## Backups

All server state is one file: `/var/lib/zac/claims.json` (public, signed name records). Copy it
somewhere safe from time to time:

```bash
scp youruser@YOUR_VPS_IP:/var/lib/zac/claims.json ./claims-backup.json
```

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `curl 127.0.0.1:8787/api/health` fails | `sudo journalctl -u zac-api -n 50` |
| HTTPS test fails | DNS points at the VPS; ports 80/443 open; `sudo journalctl -u caddy -n 50` |
| Netlify site loads but names never appear | `ZAC_API_ORIGIN` is correct; `/api/health` on the Netlify site; redeploy after changing it |
| Claiming a name fails with 429 | The per-IP limit (40 claims/hour) was hit; wait or restart the service |
