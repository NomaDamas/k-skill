# k-skill-proxy deployment (Google Cloud Run)

`k-skill-proxy` production runs on Google Cloud Run (project `k-skill`, region
`asia-northeast1`, service `k-skill-proxy`). The public domain
`k-skill-proxy.nomadamas.org` is a Cloud Run domain mapping: a DNS-only
Cloudflare `CNAME` to `ghs.googlehosted.com`. Cloud Run domain mappings are not
available in `asia-northeast3`, which is why the service lives in Tokyo.

## Production layout

| Item | Value |
| --- | --- |
| Platform | Cloud Run (min instances 0, max 5, 1 vCPU, 512Mi; cold starts are accepted) |
| GCP project | `k-skill` (number `416293459081`) |
| Service / region | `k-skill-proxy` / `asia-northeast1` |
| Public URL | `https://k-skill-proxy.nomadamas.org` |
| Image | `asia-northeast3-docker.pkg.dev/k-skill/k-skill/k-skill-proxy:<git sha>` |
| Secrets | Secret Manager `kskill-<env-name>` (e.g. `kskill-data-go-kr-api-key`), bound as env vars |
| Non-secret env | `KSKILL_PROXY_*` and `BCCARD_EATPL_INST_NM` on the service |
| Deploy workflow | `.github/workflows/deploy-k-skill-proxy.yml` |
| Deploy identity | `k-skill-deployer@k-skill.iam.gserviceaccount.com` via Workload Identity Federation |
| Runtime identity | default Compute service account (`secretmanager.secretAccessor`) |
| Egress | Direct VPC egress `kskill-egress` / `kskill-egress-an1` → Cloud NAT `kskill-egress-nat` → static IP `kskill-eatpl-egress-ip` (`34.84.103.178`), `--vpc-egress all-traffic` |

## Automatic deployment

Every push to `main` that touches `packages/k-skill-proxy/**`,
`packages/parking-lot-search/**`, the root `package*.json`, `.dockerignore`, or
the workflow itself runs `.github/workflows/deploy-k-skill-proxy.yml`:

1. `npm ci`, proxy lint, and all proxy tests;
2. authenticate to GCP with Workload Identity Federation (no stored keys; the
   provider only accepts `NomaDamas/k-skill` on `refs/heads/main`);
3. build the Dockerfile on the runner and push `:<sha>` to Artifact Registry;
4. `gcloud run deploy --no-traffic --tag sha-<12>` so the new revision gets no
   traffic yet;
5. smoke-test the tagged revision URL (`/health`, `/privacy`);
6. move 100% of traffic to the new revision;
7. smoke-test the public domain; on failure traffic is moved back to the
   previous revision and the job fails.

The workflow replaces only the image. Env vars and secret bindings stay as
configured on the service, so adding a new secret is a one-time operator step
(see below) done before the code that needs it is merged.

Deploys are serialized with a `concurrency` group and never cancelled midway.

## Manual operation

```bash
gcloud config configurations activate kskill   # account vkehfdl1@gmail.com, project k-skill
gcloud run services describe k-skill-proxy --region asia-northeast1
gcloud run revisions list --service k-skill-proxy --region asia-northeast1
gcloud beta run domain-mappings describe --domain k-skill-proxy.nomadamas.org --region asia-northeast1
curl -fsS https://k-skill-proxy.nomadamas.org/health
curl -fsS https://k-skill-proxy.nomadamas.org/privacy
```

Logs (pino JSON, one `route usage` line per request):

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="k-skill-proxy"' \
  --limit 50 --freshness=1h --format='value(textPayload,jsonPayload.route,jsonPayload.statusCode)'
```

Rollback (instant, no rebuild):

```bash
gcloud run services update-traffic k-skill-proxy --region asia-northeast1 \
  --to-revisions <previous-revision>=100
```

Manual build and deploy, when the workflow cannot run:

```bash
docker build -f packages/k-skill-proxy/Dockerfile -t asia-northeast3-docker.pkg.dev/k-skill/k-skill/k-skill-proxy:manual .
docker push asia-northeast3-docker.pkg.dev/k-skill/k-skill/k-skill-proxy:manual
gcloud run deploy k-skill-proxy --region asia-northeast1 \
  --image asia-northeast3-docker.pkg.dev/k-skill/k-skill/k-skill-proxy:manual
```

### Domain and certificate

The `k-skill-proxy` record in Cloudflare must stay **DNS only** (grey cloud)
and point to `ghs.googlehosted.com`. A proxied (orange) record blocks Google
certificate issuance. After a new mapping, the certificate usually becomes
`Ready` within about an hour and the Google front end can need a few more
minutes before TLS handshakes succeed; expect transient TLS errors until then.

## Client IP and rate limiting

Cloud Run puts one Google front end in front of the container, so production
sets `KSKILL_PROXY_TRUST_PROXY_HOPS=1` and Fastify takes `request.ip` from the
`X-Forwarded-For` entry that front end appends. The rate limiter keys on
`request.ip` only. It deliberately does **not** read `CF-Connecting-IP`: the
traffic no longer passes through Cloudflare, so any client could set that
header and get a fresh rate-limit bucket per request.

Do not raise the hop count without re-verifying: with a tagged no-traffic
revision, send requests with forged `X-Forwarded-For` / `CF-Connecting-IP`
values and confirm they still hit `429` once `KSKILL_PROXY_RATE_LIMIT_MAX` is
exceeded.

## Static egress IP (BC Card eat.pl allowlist)

BC Card requires a single allowlisted source IP. Cloud Run's default egress
addresses are not stable, so the service uses Direct VPC egress with all
outbound traffic routed through a Cloud NAT gateway that owns one reserved
regional address:

| Resource | Name |
| --- | --- |
| VPC (custom mode) | `kskill-egress` |
| Subnet | `kskill-egress-an1` (`10.8.0.0/24`, `asia-northeast1`) |
| Reserved address | `kskill-eatpl-egress-ip` = `34.84.103.178` |
| Router / NAT | `kskill-egress-router` / `kskill-egress-nat` (manual IP pool, all subnet ranges) |

Register `34.84.103.178` with BC Card. The Lightsail relay stays configured as
the fallback until BC Card confirms the allowlist and a search returns
`upstream.provider: "bccard-eatpl"`.

The network settings live on the service template, so the image-only workflow
deploy keeps them. Every other upstream the proxy calls (data.go.kr, KOSIS,
Naver, and so on) now also leaves from this address. Recreate or inspect with:

```bash
gcloud compute networks create kskill-egress --subnet-mode=custom
gcloud compute networks subnets create kskill-egress-an1 --region asia-northeast1 \
  --network kskill-egress --range 10.8.0.0/24
gcloud compute addresses create kskill-eatpl-egress-ip --region asia-northeast1
gcloud compute routers create kskill-egress-router --region asia-northeast1 --network kskill-egress
gcloud compute routers nats create kskill-egress-nat --region asia-northeast1 \
  --router kskill-egress-router --nat-all-subnet-ip-ranges \
  --nat-external-ip-pool=kskill-eatpl-egress-ip
gcloud run services update k-skill-proxy --region asia-northeast1 \
  --network kskill-egress --subnet kskill-egress-an1 --vpc-egress all-traffic
```

Verify the address a revision really uses with a throwaway Cloud Run job that
has the same `--network`, `--subnet`, and `--vpc-egress all-traffic` flags and
prints `fetch("https://api.ipify.org")`; delete the job afterwards.


## Upstream connectivity triage

`/v1/*` routes that call `apis.data.go.kr`, `kosis.kr`, or another public
upstream can answer `5xx` because the upstream is unreachable rather than
because the proxy is broken. Since issue #700 the proxy separates those cases
instead of returning an opaque `500 proxy_error` / `"fetch failed"` pair:

| Response | Meaning |
| --- | --- |
| `503 upstream_unreachable` | DNS or connect failure (`ENOTFOUND`, `ECONNREFUSED`, `ECONNRESET`, …) |
| `504 upstream_timeout` | connect/response timeout (`UND_ERR_CONNECT_TIMEOUT`, `AbortSignal.timeout`, …) |
| `502 upstream_error` / `upstream_fetch_failed` | upstream reachable and returned an error payload |

`upstream.cause` names the underlying socket code and `upstream.route` the
requested path, so a single curl identifies the failing hop.

Triage order when a representative route fails:

```bash
# 1. Does the upstream family answer at all? KMA/AirKorea/MOLIT/KOSIS all
#    resolve into the 27.101.0.0/16 netblock.
for h in apis.data.go.kr kosis.kr; do
  getent hosts "$h"
  timeout 12 curl -sS -o /dev/null -w "$h %{http_code} connect=%{time_connect} total=%{time_total}\n" "https://$h/" \
    || echo "unreachable: $h"
done

# 2. Compare with an upstream on a different network (api.odcloud.kr/NTS works).
timeout 12 curl -sS -o /dev/null -w "odcloud %{http_code}\n" "https://api.odcloud.kr/"

# 3. Confirm the proxy itself is up and the upstream flags are on.
curl -fsS https://k-skill-proxy.nomadamas.org/health
curl -fsS https://k-skill-proxy-416293459081.asia-northeast1.run.app/health   # bypasses DNS

# 4. Re-run the failing routes and read upstream.cause.
curl -sS --get "https://k-skill-proxy.nomadamas.org/v1/korea-weather/forecast" \
  --data-urlencode 'nx=60' --data-urlencode 'ny=127'
curl -sS --get "https://k-skill-proxy.nomadamas.org/v1/kosis/search" \
  --data-urlencode 'query=인구'
```

Interpretation:

- If the `27.101.0.0/16` hosts time out from the Mac and from a Cloud Run job
  (`gcloud run jobs execute` with a `fetch` probe) while a
  different-network upstream answers, the fault is on the path to that netblock
  (ISP routing or the upstream edge), not in the proxy. Report it and wait for
  the upstream; the proxy will keep answering `503 upstream_unreachable` /
  `504 upstream_timeout` with a populated `upstream.cause`.
- If only one route fails while its siblings answer, inspect that route's
  upstream module (`packages/k-skill-proxy/src/*.js`) and its service-key flag
  in `/health`.
- After the upstream recovers, re-run the commands above plus the `/health` and
  `/privacy` smoke tests.


## Required runtime env (Cloud Run)

Secrets are stored in Secret Manager as `kskill-<env-name-lowercased-with-dashes>`
and bound with `--set-secrets` / `--update-secrets`. Never put them in the
repository, query strings, shell arguments, issues, or logs. Add or rotate one:

```bash
printf '%s' "$VALUE" | gcloud secrets versions add kskill-<name> --data-file=-   # existing
printf '%s' "$VALUE" | gcloud secrets create kskill-<name> --data-file=- --replication-policy=automatic   # new
gcloud run services update k-skill-proxy --region asia-northeast1 \
  --update-secrets ENV_NAME=kskill-<name>:latest
```

Plain (non-secret) env on the service:

```dotenv
KSKILL_PROXY_TRUST_PROXY_HOPS=1
KSKILL_PROXY_RATE_LIMIT_WINDOW_MS=60000
KSKILL_PROXY_RATE_LIMIT_MAX=180
KSKILL_PROXY_CACHE_TTL_MS=300000
KSKILL_PROXY_NAME=k-skill-proxy
BCCARD_EATPL_INST_NM=<partner-institution-code>
HRFCO_RELAY_URL=https://hrfco-relay.nomadamas.org
```

`KSKILL_PROXY_TRUST_PROXY_HOPS=1` is required in production (see above). Leave
it unset (default `0`) only for a locally bound process that is not behind a
reverse proxy.

Secret-backed keys currently bound: `AIR_KOREA_OPEN_API_KEY`,
`BLUE_RIBBON_SESSION_ID`, `DATA4LIBRARY_AUTH_KEY`, `DATA_GO_KR_API_KEY`,
`FOODSAFETYKOREA_API_KEY`, `HRFCO_OPEN_API_KEY`, `KAKAO_REST_API_KEY`,
`KEDU_INFO_KEY`, `KMA_OPEN_API_KEY`, `KOSIS_API_KEY`, `KRX_API_KEY`, `LAW_OC`,
`NAVER_SEARCH_CLIENT_ID`, `NAVER_SEARCH_CLIENT_SECRET`, `OPINET_API_KEY`,
`SEOUL_OPEN_API_KEY`, `ASSEMBLY_API_KEY`, `KOPIS_API_KEY`, `KAMIS_API_KEY`,
`KOMSA_MTIS_API_KEY`, `ASK_SEOUL_SKILL_API_BASE_URL`, `ASK_SEOUL_KSKILL_API_KEY`,
`COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY`, `BCCARD_EATPL_API_BASE_URL`,
`BCCARD_EATPL_RELAY_URL`, `BCCARD_EATPL_RELAY_TOKEN`, `HRFCO_RELAY_TOKEN`.
Verify activation through `/health` → `upstreams.*Configured`.

The Coupang keys enable `GET /v1/coupang/products/search`;
`KOMSA_MTIS_API_KEY` enables `GET /v1/komsa/ferry/:dataset`.

BC Card eat.pl uses the direct Cloud Run request path first. Keep the optional
Lightsail fixed-egress relay configured as a fallback while BC Card has not yet
allowlisted the Cloud Run egress IP, and remove the two relay bindings only
after the direct path is stable. Store the same random token on Lightsail as
`EATPL_RELAY_TOKEN`:

```dotenv
BCCARD_EATPL_INST_NM=<partner-institution-code>
BCCARD_EATPL_API_BASE_URL=https://api.paybooc.ai/api/mer
BCCARD_EATPL_RELAY_URL=https://eatpl-relay.nomadamas.org/v1/search
BCCARD_EATPL_RELAY_TOKEN=<same-token-as-lightsail>
```

A successful search reports `upstream.provider: "bccard-eatpl"` for the direct
path or `"bccard-eatpl-relay"` when fallback was used. With no base URL, the
relay remains usable as the only configured upstream.

## HRFCO relay (Han River water level)

`api.hrfco.go.kr` does not answer from Google Cloud egress (0/8 connects from
both `asia-northeast1` and `asia-northeast3`), while it answers from gpu01.
`GET /v1/han-river/water-level` therefore goes through a small authenticated
relay that still runs on gpu01:

```text
Cloud Run --HTTPS + Bearer HRFCO_RELAY_TOKEN--> hrfco-relay.nomadamas.org
  (Cloudflare Tunnel `k-skill-proxy`, ingress -> http://localhost:8090)
  --> gpu01 k-skill-hrfco-relay.service --> https://api.hrfco.go.kr
```

| Item | Value |
| --- | --- |
| Source | `infra/hrfco-relay/server.js` (only `GET /<key>/waterlevel/info.json` and `/<key>/waterlevel/list/10M/<code>.json`) |
| Unit | `infra/hrfco-relay/k-skill-hrfco-relay.service` (`systemctl --user status k-skill-hrfco-relay.service`) |
| App directory | `/data/home/jeffrey/apps/k-skill-hrfco-relay` (`server.js`, `.env` mode 600 with `HRFCO_RELAY_TOKEN`, `HRFCO_RELAY_PORT=8090`) |
| Tunnel | `k-skill-proxy-tunnel.service`, ingress `hrfco-relay.nomadamas.org -> http://localhost:8090` |
| Token | Secret Manager `kskill-hrfco-relay-token`, bound as `HRFCO_RELAY_TOKEN` |

Update the relay after changing `infra/hrfco-relay/server.js`:

```bash
scp infra/hrfco-relay/server.js gpu01:/data/home/jeffrey/apps/k-skill-hrfco-relay/server.js
ssh gpu01 'systemctl --user restart k-skill-hrfco-relay.service'
curl -fsS https://hrfco-relay.nomadamas.org/health
```

Rotate the token: write a new value to both gpu01 `.env` and
`kskill-hrfco-relay-token` (new secret version), restart the relay, then
redeploy or `gcloud run services update` the proxy so it reads `:latest`.

The proxy is not the only thing still on gpu01: the Cloudflare Tunnel, the
relay, and the Loki/Promtail/Grafana dashboard keep running there. The old
proxy process, the deploy script, and its cron were retired.


## ASK Seoul weather-risk route handoff

Before deploying the `seoul-weather-risk` proxy route, ASK Seoul must issue a **dedicated, revocable service key**. Do not use a maintainer's or contributor's personal Marketplace key. The Marketplace registers this key as the following fixed service principal and scope:

| Field | Fixed value |
| --- | --- |
| service principal | `k-skill-proxy:seoul-weather-risk` |
| scope | `skill:seoul-weather-risk:read` |
| permitted Marketplace APIs | `GET /skill/v1/bundles/seoul-weather-risk`, `GET /skill/v1/products/weather_place_risk_window`, `GET /skill/v1/products/weather_place_risk_window/data` |
| excluded APIs | every `/api/v1/*` API and every other `/skill/v1/*` product |

Store only these two values as Secret Manager secrets bound to the Cloud Run service (`ASK_SEOUL_SKILL_API_BASE_URL`, `ASK_SEOUL_KSKILL_API_KEY`):

```dotenv
ASK_SEOUL_SKILL_API_BASE_URL=https://<ask-seoul-skill-origin>
ASK_SEOUL_KSKILL_API_KEY=<dedicated-service-key>
```

The key is not a user credential: it is sent only from the proxy process to the fixed ASK Seoul `/skill/v1` paths. Do not deploy this route until the Marketplace has applied the service-key scope migration and registered this principal.

Rotate the key by registering a replacement with the same scope, adding a new Secret Manager version, redeploying/smoke-testing the proxy, and then revoking the old key. If the proxy is disabled or suspected compromised, revoke its key immediately; the Marketplace must deny it before any daily-quota accounting. Never paste a key into an issue, PR, shell argument, URL, or log.

## Usage stats dashboard

> **Currently not fed.** Promtail tails `/data/home/jeffrey/apps/k-skill-proxy/proxy.log`
> on gpu01, which only the retired gpu01 proxy process wrote. The proxy now runs
> on Cloud Run and logs `routeUsage` lines to Cloud Logging, so the Grafana
> panels below stop updating until Promtail is pointed at a Cloud Logging
> export. Until then query Cloud Logging directly, e.g.
> `gcloud logging read 'resource.type="cloud_run_revision" AND jsonPayload.msg="route usage"' --format='value(jsonPayload.route,jsonPayload.statusCode)'`.

Endpoint call statistics (`routeUsage` log lines) were collected into Loki by
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
