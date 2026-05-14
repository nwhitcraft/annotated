FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package-lock.json ./apps/web/
COPY packages/api/package.json packages/api/package-lock.json ./packages/api/
COPY packages/clip-engine/package.json packages/clip-engine/package-lock.json ./packages/clip-engine/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci

COPY . .
RUN npm run build:web \
  && mkdir -p packages/api/public \
  && cp -R apps/web/dist/. packages/api/public/ \
  && npm run build:api \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg yt-dlp ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/api ./packages/api
COPY --from=build /app/packages/clip-engine ./packages/clip-engine
COPY --from=build /app/packages/shared ./packages/shared

EXPOSE 8080
CMD ["node", "packages/api/src/index.js"]
