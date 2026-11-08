FROM node:22-bookworm-slim AS api
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl tzdata \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY server/prisma ./server/prisma
RUN npm ci --workspace server --include=dev
COPY server/src ./server/src
COPY server/tsconfig.json ./server/
WORKDIR /app/server
RUN mkdir uploads && chown node:node uploads
ENV NODE_ENV=production
USER node
CMD ["node", "--import", "tsx", "src/index.ts"]

FROM node:22-bookworm-slim AS client-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci --workspace client --include=dev
COPY client ./client
RUN npm run build --workspace client

FROM caddy:2-alpine AS web
COPY --from=client-build /app/client/dist /srv
COPY docker/Caddyfile.local /etc/caddy/Caddyfile
COPY docker/Caddyfile.public docker/routes.caddy /etc/caddy/
