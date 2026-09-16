FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

RUN apk add --no-cache su-exec

WORKDIR /app
COPY package.json server.js docker-entrypoint.sh ./
COPY lib ./lib
COPY public ./public
COPY venues ./venues
COPY tools ./tools

RUN chmod +x /app/docker-entrypoint.sh && mkdir -p /data && chown -R node:node /data

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
