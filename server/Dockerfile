# Production image for the OCL Maintenance API + admin page.
#
# Uses the FULL node image, not -slim. Reason: better-sqlite3 is a native addon,
# and on ARM64 (Oracle Ampere / Apple silicon) there is no prebuilt binary, so it
# must compile. The full image already ships python3/make/g++ which node-gyp
# needs; -slim does not, and the build fails on ARM.
FROM node:22

ENV NODE_ENV=production
WORKDIR /app

# Install dependencies first so Docker can cache this layer between deploys.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .

# SQLite database and uploaded APKs live here; mounted as volumes in compose.
RUN mkdir -p /data /app/releases

ENV DATA_DIR=/data \
    PORT=3000 \
    HOST=0.0.0.0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
