# Build from the repo root: docker build -f apps/worker/Dockerfile .
FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production

# The whole workspace is copied (see .dockerignore) so `npm ci` sees every manifest the lockfile lists.
COPY . .
RUN npm ci --omit=dev --workspace @family-wishes/worker --include-workspace-root \
  && npm cache clean --force \
  && mkdir -p /data/backups \
  && chown -R node:node /data

USER node
CMD ["npx", "tsx", "apps/worker/src/main.ts"]
