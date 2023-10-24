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

# FROM node:20-slim as app
# COPY --from=builder node_modules .

HEALTHCHECK --interval=12s --timeout=12s --start-period=10s CMD npm run healthcheck

# Use tini to handle signals properly, see https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md#handling-kernel-signals
ENTRYPOINT ["/usr/bin/tini", "-p", "SIGKILL", "-vvv", "--"]

CMD [ "node", "dist/src/index.js" ]

# for best practices, see:
# * https://snyk.io/blog/10-best-practices-to-containerize-nodejs-web-applications-with-docker/
# * https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md
# * https://nodejs.org/en/docs/guides/nodejs-docker-webapp
