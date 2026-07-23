# k-skill-proxy usage dashboard

Grafana dashboard for k-skill-proxy endpoint usage statistics
(`https://k-skill-proxy-dashboard.nomadamas.org`).

Stack: Promtail tails the proxy's JSON log, Loki stores it (90-day
retention), Grafana visualizes per-endpoint call counts. Only usage lines
(emitted by the proxy with `routeUsage: true`) carry a `route` label, so all
queries filter on `{job="k-skill-proxy", route!=""}`.

Licensed under AGPL-3.0-only (see `LICENSE`), like the proxy server itself.

## gpu01 (production, no docker, no root)

gpu01's docker daemon is not accessible to the deploy user, so the stack
runs as plain binaries under systemd **user** services, exactly like the
proxy and cloudflared tunnel.

```bash
# one-time / upgrade
bash /data/home/jeffrey/apps/k-skill-proxy-dashboard/setup-gpu01.sh
```

The script:

1. downloads Grafana/Loki/Promtail binaries into `bin/`;
2. creates `grafana.env` (mode 600) with a random admin password; the file is
   never overwritten and must never be committed to git;
3. rewrites provisioning paths into `data/provisioning`;
4. installs and starts `k-skill-proxy-{loki,promtail,grafana}.service`
   (Grafana on `127.0.0.1:3200`).

Public access goes through the existing cloudflared tunnel
(`~/.cloudflared/config.yml`, hostname
`k-skill-proxy-dashboard.nomadamas.org -> http://localhost:3200`, DNS route
added with `cloudflared tunnel route dns`). Grafana's own login is the
access control: anonymous auth is disabled, only the admin account exists.

Operations:

```bash
systemctl --user status k-skill-proxy-grafana.service
journalctl --user -u k-skill-proxy-loki.service -n 50 --no-pager
cat /data/home/jeffrey/apps/k-skill-proxy-dashboard/grafana.env   # admin credentials
```

## Local development (docker)

Where docker is available, `docker compose up -d` runs the same stack with
Grafana on `127.0.0.1:3200`. Copy `.env.example` to `.env` first (gitignored).
Point `KSKILL_PROXY_LOG_DIR` at a directory containing a `proxy.log` file.
