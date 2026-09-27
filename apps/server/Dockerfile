FROM node:24-bookworm-slim AS workspace

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@12.5.1 --activate

COPY . .

RUN pnpm install --filter @mocca/server... --frozen-lockfile

FROM workspace AS build

RUN pnpm --filter @mocca/server build
RUN pnpm --filter @mocca/server --prod deploy /production

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY --from=build --chown=node:node /production/ ./

USER node

EXPOSE 3000

CMD ["node", "dist/server.js"]
