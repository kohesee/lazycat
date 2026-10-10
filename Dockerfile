FROM oven/bun:1.3

WORKDIR /app

COPY package.json bun.lock ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY web/package.json web/package.json
COPY extension/package.json extension/package.json
COPY cli/package.json cli/package.json
RUN bun install --frozen-lockfile

COPY shared shared
COPY backend backend

ENV NODE_ENV=production
ENV DB_PATH=/data/lazycat.db
EXPOSE 8787

CMD ["bun", "backend/src/index.ts"]
