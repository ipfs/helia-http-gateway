# OpenSSL Build Stage
FROM --platform=$BUILDPLATFORM node:20-slim as openssl-builder

RUN apt-get update && \
    apt-get install -y build-essential wget && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

ENV OPEN_SSL_VERSION=1.1.1w

# Download OpenSSL
RUN wget -P /tmp https://www.openssl.org/source/old/1.1.1/openssl-${OPEN_SSL_VERSION}.tar.gz

# Extract OpenSSL and configure
RUN mkdir -p /opt/openssl && \
    tar -xzf /tmp/openssl-${OPEN_SSL_VERSION}.tar.gz -C /opt/openssl && \
    cd /opt/openssl/openssl-${OPEN_SSL_VERSION} && \
    ./config --prefix=/opt/openssl --openssldir=/opt/openssl/ssl

# Build and install OpenSSL
WORKDIR /opt/openssl/openssl-${OPEN_SSL_VERSION}

# Build OpenSSL
RUN make

# Test the build
RUN make test

# Install OpenSSL
RUN make install

# Cleanup unnecessary files to reduce image size
RUN cd /opt/openssl && \
    rm -rf /opt/openssl/openssl-${OPEN_SSL_VERSION} /tmp/openssl-${OPEN_SSL_VERSION}.tar.gz

# Application Build Stage
FROM --platform=$BUILDPLATFORM node:20-slim as builder

# Install dependencies required for building the app
RUN apt-get update && \
    apt-get install -y tini fd-find && \
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

# copy OpenSSL libraries from the openssl-builder stage
COPY --from=openssl-builder /usr/lib/**/libcrypto* /usr/lib/
COPY --from=openssl-builder /usr/lib/**/libssl* /usr/lib/
COPY --from=openssl-builder /opt/openssl/lib /opt/openssl/lib
ENV LD_LIBRARY_PATH /opt/openssl/lib

EXPOSE 8080

HEALTHCHECK --interval=12s --timeout=12s --start-period=10s CMD npm run healthcheck

# Use tini to handle signals properly, see https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md#handling-kernel-signals
ENTRYPOINT ["/usr/bin/tini", "-p", "SIGKILL", "--"]

CMD [ "node", "dist/src/index.js" ]

# for best practices, see:
# * https://snyk.io/blog/10-best-practices-to-containerize-nodejs-web-applications-with-docker/
# * https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md
# * https://nodejs.org/en/docs/guides/nodejs-docker-webapp
