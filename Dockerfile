FROM --platform=$BUILDPLATFORM node:20-slim as builder

RUN apt-get update
RUN apt-get install -y build-essential cmake git libssl-dev tini

WORKDIR /app

COPY package*.json ./

RUN npm ci --quiet

COPY . .

RUN npm run build

RUN npm prune --omit=dev

FROM --platform=$BUILDPLATFORM node:20-slim as app
ENV NODE_ENV production
WORKDIR /app
# built src without dev dependencies
COPY --from=builder /app ./
# tini is used to handle signals properly, see https://github.com/krallin/tini#using-tini
COPY --from=builder /usr/bin/tini /usr/bin/tini

# copy shared libraries (without having artifacts from apt-get install that is needed to build our application)
COPY --from=builder /usr/lib/**/libcrypto* /usr/lib/
COPY --from=builder /usr/lib/**/libssl* /usr/lib/

EXPOSE 8080

HEALTHCHECK --interval=12s --timeout=12s --start-period=10s CMD npm run healthcheck

# Use tini to handle signals properly, see https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md#handling-kernel-signals
ENTRYPOINT ["/usr/bin/tini", "-p", "SIGKILL", "--"]

CMD [ "node", "dist/src/index.js" ]

# for best practices, see:
# * https://snyk.io/blog/10-best-practices-to-containerize-nodejs-web-applications-with-docker/
# * https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md
# * https://nodejs.org/en/docs/guides/nodejs-docker-webapp
