# Legacy Unsupported Code

This directory preserves unsupported skills and helper code that are not part of the default k-skill install, plugin manifest, Manus bundles, npm workspaces, proxy route surface, or README feature list.

Archived items:

- `unsupported-skills/blue-ribbon-nearby/` - Blue Ribbon nearby skill. The upstream blocks automation/premium access in ways this repository cannot currently support.
- `unsupported-skills/naver-map-route/` - Naver Map route skill. NCP Maps operational prerequisites are not currently available for the hosted proxy.
- `unsupported-packages/blue-ribbon-nearby/` - Former npm workspace package retained for future revival.
- `unsupported-proxy/bluer.js` and `unsupported-proxy/naver-map.js` - Former proxy helper modules retained for future revival.

To revive one of these surfaces, move the code back into the normal repo layout, restore docs/tests/proxy routes or workspace metadata, and rerun `npm run ci` plus live/manual QA.
