# gongsijiga-search

## 0.1.1

### Patch Changes

- 2ff51db: feat: extract realtyprice.kr lookup from k-skill-proxy into a standalone `gongsijiga-search` workspace package

  The previous `/v1/realtyprice` proxy route called a fully public endpoint (realtyprice.kr) that needs no API key, so per the new k-skill-proxy inclusion rule (proxy is for keyed upstreams only) the helper now ships as its own package and is invoked directly from the user's machine.
