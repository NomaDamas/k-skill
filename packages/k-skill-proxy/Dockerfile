# Build with repo root as the Docker context:
#   docker build -f packages/k-skill-proxy/Dockerfile .
#
# Do not use packages/k-skill-proxy as the build context. This image copies
# root-level files such as scripts/ktx_booking.py, and Docker cannot COPY files
# outside the selected build context.
# packages/k-skill-proxy/src/parking-lots.js does:
#   require("../../parking-lot-search/src/parse")
# so this image keeps both packages under /workspace/packages/ to preserve
# that relative require path. Do not flatten the layout.
FROM node:20-alpine AS deps
WORKDIR /app
COPY packages/k-skill-proxy/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force

FROM node:20-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production \
    KSKILL_PROXY_HOST=0.0.0.0 \
    KSKILL_PROXY_PORT=8080
USER root
RUN apk add --no-cache python3 py3-pip \
 && python3 -m venv /opt/ktx-venv \
 && /opt/ktx-venv/bin/pip install --no-cache-dir korail2-ncard pycryptodome
ENV PATH="/opt/ktx-venv/bin:${PATH}"
COPY --from=deps /app/node_modules ./packages/k-skill-proxy/node_modules
COPY --from=deps /app/package.json ./packages/k-skill-proxy/package.json
COPY packages/k-skill-proxy/src ./packages/k-skill-proxy/src
COPY scripts/ktx_booking.py ./scripts/ktx_booking.py
COPY packages/parking-lot-search/src ./packages/parking-lot-search/src
COPY packages/parking-lot-search/package.json ./packages/parking-lot-search/package.json
RUN chmod +x ./scripts/ktx_booking.py \
 && chown -R node:node /workspace
WORKDIR /workspace/packages/k-skill-proxy
EXPOSE 8080
USER node
# Cloud Run injects PORT; the server reads KSKILL_PROXY_PORT. Forward it.
CMD ["sh", "-c", "KSKILL_PROXY_PORT=${PORT:-8080} node src/server.js"]
