# Build context MUST be repo root.
# packages/k-skill-proxy/src/parking-lots.js does:
#   require("../../parking-lot-search/src/parse")
# so this image keeps both packages under /workspace/packages/ to preserve
# that relative require path. Do not flatten the layout.
FROM node:20-alpine AS deps
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --omit=dev --workspace k-skill-proxy --include-workspace-root=false --no-audit --no-fund \
 && npm cache clean --force

FROM node:20-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production \
    KSKILL_PROXY_HOST=0.0.0.0 \
    KSKILL_PROXY_PORT=8080
COPY --from=deps /workspace/node_modules ./node_modules
COPY packages/k-skill-proxy/package.json ./packages/k-skill-proxy/package.json
COPY packages/k-skill-proxy/src ./packages/k-skill-proxy/src
COPY packages/parking-lot-search/src ./packages/parking-lot-search/src
COPY packages/parking-lot-search/package.json ./packages/parking-lot-search/package.json
WORKDIR /workspace/packages/k-skill-proxy
EXPOSE 8080
USER node
# Container platforms commonly inject PORT; the server reads KSKILL_PROXY_PORT.
CMD ["sh", "-c", "KSKILL_PROXY_PORT=${PORT:-8080} node src/server.js"]
