# eat.pl relay on AWS Lightsail

This is a deployment recipe for a small authenticated relay whose outbound
requests to the BC Card eat.pl API originate from one Lightsail static IPv4
address. Direct public callers without the gpu01 proxy bearer token are rejected.

## Target architecture

```text
k-skill-proxy --HTTPS + Authorization: Bearer <token>--> Lightsail relay
                                                                |
                                                                +-- POST --> api.paybooc.ai
```

BC Card should whitelist the Lightsail static IPv4, not the home KT address and
not the relay's private `127.0.0.1` address.

## Cost guardrail

Use one Linux/Unix Lightsail instance with public IPv4 and attach one static
IP. The current AWS documentation lists the Nano 0.5 GB public IPv4 bundle at
$5/month. A static IP is free while attached to the instance.

The AWS Budget service is an alert, not an absolute spending circuit breaker.
Create:

- a monthly cost budget of **$10**
- alert thresholds at 50%, 80%, and 100%
- actual-cost alerts
- forecasted-cost alert at 80% or 100%
- email delivery to the account owner

Also create a CloudWatch billing alarm if the account and region support the
billing metric. Do not assume an alert can prevent every charge: stop/delete
the instance manually if an alert fires, and avoid snapshots, extra disks,
load balancers, reserved IPs detached from instances, and additional regions.

## Required live inputs

Live AWS setup cannot be performed from this repository without:

1. AWS console or CLI credentials with permission to create Lightsail,
   Budgets, and (optionally) CloudWatch billing alarms.
2. The AWS account and preferred region. Use a region close to the caller or
   the BC Card service; Seoul is a reasonable first choice if available.
3. A DNS name for the relay, or approval to use the instance IP temporarily.
4. A secure way to provision `EATPL_RELAY_TOKEN` and
   `BCCARD_EATPL_INST_NM`; do not put either value in Git.
5. Confirmation from BC Card that the Lightsail static IPv4 has been
   allowlisted for the dev API.

## Instance setup

On a fresh Ubuntu Lightsail instance:

```bash
sudo adduser --system --group --no-create-home eatpl-relay
sudo install -d -o eatpl-relay -g eatpl-relay /opt/eatpl-relay
sudo install -d -o root -g eatpl-relay -m 0750 /etc/eatpl-relay
sudo install -m 0600 -o root -g eatpl-relay /tmp/eatpl-relay.env /etc/eatpl-relay/eatpl-relay.env
sudo install -m 0644 infra/eatpl-relay/server.js /opt/eatpl-relay/server.js
sudo install -m 0644 infra/eatpl-relay/eatpl-relay.service /etc/systemd/system/eatpl-relay.service
sudo systemctl daemon-reload
sudo systemctl enable --now eatpl-relay
```

The environment file must contain real values only on the instance:

```dotenv
EATPL_RELAY_TOKEN=<random-token>
BCCARD_EATPL_INST_NM=kskill
BCCARD_EATPL_API_BASE_URL=https://api.paybooc.ai/api/mer
BCCARD_EATPL_API_TIMEOUT_MS=20000
EATPL_RELAY_RATE_LIMIT_MAX=30
EATPL_RELAY_RATE_LIMIT_WINDOW_MS=60000
EATPL_RELAY_PORT=8080
```

## HTTPS

Put Caddy or another TLS reverse proxy in front of localhost:8080. Do not
expose port 8080 publicly. The relay accepts only:

- `GET /health`
- `POST /v1/search`

The caller must send:

```http
Authorization: Bearer <EATPL_RELAY_TOKEN>
```

The relay never accepts `instNm` or `trnsTrceNo` from the caller. It injects
both values itself and fixes the upstream URL in code, preventing an open
proxy or SSRF endpoint.

Configure the existing k-skill-proxy on gpu01 with these values in its private
runtime environment. Do not commit them. The proxy is the only caller that may
hold this token; other clients hitting the relay without it are rejected.

```dotenv
BCCARD_EATPL_INST_NM=kskill
BCCARD_EATPL_API_BASE_URL=https://api.paybooc.ai/api/mer
BCCARD_EATPL_RELAY_URL=https://eatpl-relay.nomadamas.org/v1/search
BCCARD_EATPL_RELAY_TOKEN=<the same generated token>
```

## Verification

First verify the egress address from the instance:

```bash
curl -4 https://api.ipify.org
```

Give that IP to BC Card for dev allowlisting. After confirmation, test the
upstream directly from the instance and then test the relay through HTTPS.
Never include the real token or full authorization header in terminal logs,
screenshots, tickets, or commits.
