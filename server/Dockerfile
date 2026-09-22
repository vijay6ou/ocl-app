# Production image for the OCL Maintenance API + admin page.
#
# Debian-based rather than Alpine so better-sqlite3 can use its prebuilt binary
# instead of compiling from source on the server (much faster deploys).
FROM node:20-slim

ENV NODE_ENV=production
WORKDIR /app

# Install dependencies first so Docker can cache this layer between deploys.
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .

# SQLite database and uploaded APKs live here; mounted as volumes in compose.
RUN mkdir -p /data /app/releases

ENV DATA_DIR=/data \
    PORT=3000 \
    HOST=0.0.0.0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
