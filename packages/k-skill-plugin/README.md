# K-Skill

K-Skill packages 129 Korean everyday and work workflows for Claude. It helps with public information lookups, travel preparation, Korean documents, and supported user-authorized tasks. Each skill contains the instructions reviewed with this plugin release. Local references and helper scripts are bundled, rather than fetched as new behavioral instructions at runtime.

## Runtime and permissions

Node.js 18 or later is required for the local asset runner. Individual skills may additionally require Python, uv, a browser integration, or a documented third-party package. Review and approve installations before changing your environment. Skills that execute local programs need a Claude surface that supports local execution; do not assume that every workflow runs in web or mobile chat. Nothing runs automatically when this plugin is installed: it declares no hooks or MCP servers.

The local runner reads packaged references and executes packaged scripts without a shell. It has no remote instruction, update, telemetry, or credential-collection command. Helpers can access the network or create local files as documented by the selected skill. Bookings, messages, payments, submissions, and other external actions require the user's approval immediately before execution.

## Data and services

A selected skill may read task inputs such as names, addresses, locations, document contents, account records, or search terms, and may create files requested by the user. Some skills contact official/public services, user-authorized accounts, or the hosted k-skill-proxy. Use only the inputs needed for the requested task. Third-party services have their own privacy practices; review them before connecting or submitting personal information. The hosted proxy's published privacy policy is at https://k-skill-proxy.nomadamas.org/privacy and applies to that proxy, not to every third-party service. Local files remain under the user's control. No blanket retention claim is made for all upstream services.

## Support and examples

Report problems at https://github.com/NomaDamas/k-skill/issues with the skill name and a redacted error. Do not include credentials or personal records. Example requests: “이번 주 로또 당첨 번호 알려줘”, “서울 지하철 도착 예정 시간을 확인해줘”, and “이 한국어 문장의 글자 수를 세어줘”.

## Submission scope

This is a generated distribution copy, not a second source of truth. Maintainers edit the root skill sources and shared CLI templates, then run `node scripts/build-official-plugin.js`. Existing root CLI adapters and marketplace installation remain unchanged.

Excluded from this directory submission only:
- `heyyumi`: Requires behavioral rules fetched from the provider's guide endpoint at runtime; a static, provider-approved workflow is needed before directory submission.
- `korean-jangbu-for`: Installs an upstream skill workflow at runtime. Bundle and review the licensed upstream workflow before including it.
- `korean-privacy-terms`: Installs upstream behavioral interview/render/install instructions at runtime. Bundle and review the licensed upstream workflow before including it.

The setup skill verifies this installed plugin without installing or updating other skill distributions. Directory validation is not policy approval; reviewers still assess service integrations, dependencies, and data practices.

## License

MIT. Third-party service names identify compatibility and lookup targets, not endorsement or affiliation.
