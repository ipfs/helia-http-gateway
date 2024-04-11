# Application Build Stage
FROM --platform=$BUILDPLATFORM node:20-slim as builder

# Install dependencies required for building the app
RUN apt-get update && \
    apt-get install -y build-essential wget tini && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --quiet

COPY . .
RUN npm run build
RUN npm prune --omit=dev

# Final Stage
FROM --platform=$BUILDPLATFORM node:20-slim as app

ENV NODE_ENV production
WORKDIR /app

# copy built application from the builder stage
COPY --from=builder /app ./

# copy tini from the builder stage
COPY --from=builder /usr/bin/tini /usr/bin/tini

# port for RPC API
EXPOSE 5001

# port for HTTP Gateway
EXPOSE 8080

HEALTHCHECK --interval=12s --timeout=12s --start-period=10s CMD node dist/src/healthcheck.js

# use level datastore by default
ENV FILE_DATASTORE_PATH=/data/ipfs/datastore

# use filesystem blockstore by default
ENV FILE_BLOCKSTORE_PATH=/data/ipfs/blockstore

# enable metrics by default
ENV METRICS=true

# redirect ipfs/ipns paths to subdomains to prevent cookie theft by websites
# loaded via the gateway
ENV SUB_DOMAINS=true

# Use tini to handle signals properly, see https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md#handling-kernel-signals
ENTRYPOINT ["/usr/bin/tini", "-p", "SIGKILL", "--"]

CMD [ "node", "dist/src/index.js" ]

# for best practices, see:
# * https://snyk.io/blog/10-best-practices-to-containerize-nodejs-web-applications-with-docker/
# * https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md
# * https://nodejs.org/en/docs/guides/nodejs-docker-webapp
