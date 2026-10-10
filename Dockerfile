FROM oven/bun:1.3

WORKDIR /app

COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
WORKDIR /app/backend
RUN bun install --production --ignore-scripts

WORKDIR /app
COPY shared shared
COPY backend backend

ENV NODE_ENV=production
ENV DB_PATH=/data/lazycat.db
EXPOSE 8787

CMD ["bun", "backend/src/index.ts"]
