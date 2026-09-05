# k-skill-proxy deployment (gpu01 + systemd)

`k-skill-proxy` production runs on `gpu01`, not Google Cloud Run. The public
domain is served by a Cloudflare Tunnel that forwards to the Fastify process on
`127.0.0.1:8080`.

## Production layout

| Item | Value |
| --- | --- |
| Host | `gpu01` (`gpu01.nomadamas.org`) |
| Public URL | `https://k-skill-proxy.nomadamas.org` |
| App directory | `/data/home/jeffrey/apps/k-skill-proxy` |
| Source checkout | `/data/home/jeffrey/apps/k-skill-proxy-repo` |
| Service | `systemctl --user status k-skill-proxy.service` |
| Tunnel | `systemctl --user status k-skill-proxy-tunnel.service` |
| Runtime env | `/data/home/jeffrey/apps/k-skill-proxy/.env` |
| Deployed revision | `/data/home/jeffrey/apps/k-skill-proxy/deployed-sha` |
| Deploy script | `scripts/deploy-k-skill-proxy-gpu01.sh` |

The production listener is bound to `127.0.0.1` and receives public traffic through exactly one local Cloudflare Tunnel hop. Only when the gpu01 deployment script is running with `KSKILL_PROXY_DEPLOY_ENVIRONMENT=production` and `KSKILL_PROXY_DEPLOY_HOST=gpu01` does it ensure the runtime env contains `KSKILL_PROXY_TRUST_PROXY_HOPS=1` before restarting the service. Those values are the script defaults on the production host. Non-production or non-gpu01 executions leave the application default at `0`. An explicit operator value is preserved, and `KSKILL_PROXY_ENV_FILE` may point the script at a non-default runtime env path.

Do not use this setting for a directly exposed listener. Trusting one hop is safe here because the Fastify port is loopback-only; making that port externally reachable would allow clients to supply a forged `X-Forwarded-For` value.

## Automatic deployment

The `gpu01` user crontab runs the deployment script every five minutes under
`flock`. The script fetches `origin/main`, exits when the recorded SHA already
matches, and otherwise:

1. checks out the target SHA in the source checkout;
2. runs `npm ci`, proxy lint, and all proxy tests;
3. creates a timestamped backup of the current app;
4. syncs the proxy and its local workspace dependency;
5. installs production dependencies and restarts the systemd user service;
6. checks local and public `/health` and `/privacy`;
7. records `deployed-sha` only after all checks pass.

Any failure after the backup performs an automatic rollback by restoring the
previous files and restarting the old service. A `main` merge is therefore deployed within the cron interval when the
new proxy tests and smoke checks pass.

Install or repair the cron entry:

```cron
*/5 * * * * flock -n /tmp/k-skill-proxy-deploy.lock /data/home/jeffrey/apps/k-skill-proxy/deploy-k-skill-proxy-gpu01.sh >> /data/home/jeffrey/apps/k-skill-proxy/deploy.log 2>&1
```

## Manual operation

```bash
mosh gpu01
/data/home/jeffrey/apps/k-skill-proxy/deploy-k-skill-proxy-gpu01.sh
curl -fsS http://127.0.0.1:8080/health
curl -fsS https://k-skill-proxy.nomadamas.org/health
curl -fsS http://127.0.0.1:8080/privacy
curl -fsS https://k-skill-proxy.nomadamas.org/privacy
cat /data/home/jeffrey/apps/k-skill-proxy/deployed-sha
```

Logs and service state:

```bash
tail -f /data/home/jeffrey/apps/k-skill-proxy/deploy.log
tail -f /data/home/jeffrey/apps/k-skill-proxy/proxy.log
systemctl --user status k-skill-proxy.service
systemctl --user status k-skill-proxy-tunnel.service
```

Verify the trust-proxy setting without printing the rest of the secret-bearing env file:

```bash
grep '^KSKILL_PROXY_TRUST_PROXY_HOPS=' /data/home/jeffrey/apps/k-skill-proxy/.env
```

The expected production value is `KSKILL_PROXY_TRUST_PROXY_HOPS=1`. If the key is missing, the next gpu01 production deployment adds it and restarts the service. Staging, local, and other-host executions do not add it. If the topology changes, update the explicit value only after recounting the trusted reverse-proxy hops.

The `.env` file stays on `gpu01` and must not be copied into the repository.

## Required runtime env (gpu01)

Cloudflare Tunnel forwards to `127.0.0.1:8080`. Fastify must trust that one hop
or every external client shares a single rate-limit bucket (`request.ip` becomes
`127.0.0.1`). Keep these keys in `/data/home/jeffrey/apps/k-skill-proxy/.env`:

```dotenv
KSKILL_PROXY_TRUST_PROXY_HOPS=1
KSKILL_PROXY_RATE_LIMIT_WINDOW_MS=60000
KSKILL_PROXY_RATE_LIMIT_MAX=60
COUPANG_ACCESS_KEY=<coupang-partners-access-key>
COUPANG_SECRET_KEY=<coupang-partners-secret-key>
KOMSA_MTIS_API_KEY=<komsa-mtis-service-key>
```

`KSKILL_PROXY_TRUST_PROXY_HOPS=1` is required in production. Leave it unset
(default `0`) only for a locally bound process that is not behind a reverse
proxy. When hops are trusted, the rate limiter prefers `CF-Connecting-IP` over
`X-Forwarded-For` so clients cannot spoof extra XFF entries.

The Coupang keys enable `GET /v1/coupang/products/search`. Store them only in
the gpu01 runtime `.env`; never pass them in query strings, shell arguments,
issues, or logs. Verify activation through
`/health` → `upstreams.coupangConfigured=true`.

`KOMSA_MTIS_API_KEY` enables `GET /v1/komsa/ferry/:dataset`. Store the value
only in the gpu01 runtime `.env`; never pass it in query strings, shell
arguments, issues, or logs. Verify activation through
`/health` → `upstreams.komsaConfigured=true`, then exercise a read-only ferry lookup.

## ASK Seoul weather-risk route handoff

Before deploying the `seoul-weather-risk` proxy route, ASK Seoul must issue a **dedicated, revocable service key**. Do not use a maintainer's or contributor's personal Marketplace key. The Marketplace registers this key as the following fixed service principal and scope:

| Field | Fixed value |
| --- | --- |
| service principal | `k-skill-proxy:seoul-weather-risk` |
| scope | `skill:seoul-weather-risk:read` |
| permitted Marketplace APIs | `GET /skill/v1/bundles/seoul-weather-risk`, `GET /skill/v1/products/weather_place_risk_window`, `GET /skill/v1/products/weather_place_risk_window/data` |
| excluded APIs | every `/api/v1/*` API and every other `/skill/v1/*` product |

Store only these two values in the existing gpu01 runtime `.env`:

```dotenv
ASK_SEOUL_SKILL_API_BASE_URL=https://<ask-seoul-skill-origin>
ASK_SEOUL_KSKILL_API_KEY=<dedicated-service-key>
```

The key is not a user credential: it is sent only from the proxy process to the fixed ASK Seoul `/skill/v1` paths. Do not deploy this route until the Marketplace has applied the service-key scope migration and registered this principal.

Rotate the key by registering a replacement with the same scope, replacing only the gpu01 runtime secret, restarting/smoke-testing the proxy, and then revoking the old key. If the proxy is disabled or suspected compromised, revoke its key immediately; the Marketplace must deny it before any daily-quota accounting. Never paste a key into an issue, PR, shell argument, URL, or log.

## Usage stats dashboard

Endpoint call statistics (`routeUsage` log lines) are collected into Loki by
Promtail and visualized in Grafana at
`https://k-skill-proxy-dashboard.nomadamas.org` (Grafana login required,
admin credentials live in
`/data/home/jeffrey/apps/k-skill-proxy-dashboard/grafana.env`, mode 600 —
never commit it).

The stack runs as systemd user services
(`k-skill-proxy-{loki,promtail,grafana}.service`) installed by
`infra/k-skill-proxy-dashboard/setup-gpu01.sh`; see
[`infra/k-skill-proxy-dashboard/README.md`](../infra/k-skill-proxy-dashboard/README.md)
for the full layout. Grafana is exposed through the same cloudflared tunnel
(`k-skill-proxy-dashboard.nomadamas.org -> http://localhost:3200`).

Note: `route` labels (and therefore per-endpoint panels) only appear once
the proxy build that emits `routeUsage` log lines is deployed to `main`.
