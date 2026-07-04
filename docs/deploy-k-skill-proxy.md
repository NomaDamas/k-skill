# k-skill-proxy 운영 문서 정책

`k-skill-proxy`의 public 문서는 client-facing contract와 개발 지침만 다룬다.
Production serving topology, host identity, tunnel/reverse-proxy details, server-local
paths, deployment triggers, rollback steps, and secret placement are intentionally not
tracked in this repository.

Maintainers must keep the operational runbook in a private, non-repository location.
Do not copy private serving details into GitHub PRs, issues, review comments, public
docs, examples, or test fixtures.

Public verification may mention only the hosted base URL contract:

```bash
curl -fsS https://k-skill-proxy.nomadamas.org/health
```

If production serving is unavailable, use the private runbook to recover it and record
only the public symptom and resolution summary in public channels.
