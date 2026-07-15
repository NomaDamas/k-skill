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

## Automatic deployment

The `gpu01` user crontab runs the deployment script every five minutes under
`flock`. The script fetches `origin/main`, exits when the recorded SHA already
matches, and otherwise:

1. checks out the target SHA in the source checkout;
2. runs `npm ci`, proxy lint, and all proxy tests;
3. creates a timestamped backup of the current app;
4. syncs the proxy and its local workspace dependency;
5. installs production dependencies and restarts the systemd user service;
6. checks local and public `/health`;
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
cat /data/home/jeffrey/apps/k-skill-proxy/deployed-sha
```

Logs and service state:

```bash
tail -f /data/home/jeffrey/apps/k-skill-proxy/deploy.log
tail -f /data/home/jeffrey/apps/k-skill-proxy/proxy.log
systemctl --user status k-skill-proxy.service
systemctl --user status k-skill-proxy-tunnel.service
```

The `.env` file stays on `gpu01` and must not be copied into the repository.
