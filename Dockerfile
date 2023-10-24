FROM node:20-slim as builder

RUN apt-get update
RUN apt-get install -y build-essential cmake git libssl-dev tini

WORKDIR /app

COPY package*.json ./

RUN npm ci --quiet

COPY . .

RUN npm run build

ENV NODE_ENV production
RUN npm prune --production

FROM node:20-slim as app
WORKDIR /app
# built src without dev dependencies
COPY --from=builder /app ./
# tini is used to handle signals properly, see https://github.com/krallin/tini#using-tini
COPY --from=builder /usr/bin/tini /usr/bin/tini

# copy shared libraries (without having artifacts from apt-get install that is needed to build our application)
COPY --from=builder /usr/lib/**/libcrypto*.so /usr/lib/
COPY --from=builder /usr/lib/**/libssl*.so /usr/lib/

HEALTHCHECK --interval=12s --timeout=12s --start-period=10s CMD npm run healthcheck

# Use tini to handle signals properly, see https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md#handling-kernel-signals
ENTRYPOINT ["/usr/bin/tini", "-p", "SIGKILL", "--"]

CMD [ "node", "dist/src/index.js" ]

# for best practices, see:
# * https://snyk.io/blog/10-best-practices-to-containerize-nodejs-web-applications-with-docker/
# * https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md
# * https://nodejs.org/en/docs/guides/nodejs-docker-webapp
