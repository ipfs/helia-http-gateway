/**
 * @packageDocumentation
 *
 * A Dockerized application that implements the [HTTP IPFS-gateway API](https://docs.ipfs.tech/concepts/ipfs-gateway/#gateway-types) spec and responds to the incoming requests using [Helia](https://github.com/ipfs/helia) to fetch the content from IPFS.
 *
 * ## Run from the github container registry
 *
 * ```sh
 * $ docker run -it -p 8080:8080 ghcr.io/ipfs/helia-http-gateway:latest
 * ```
 *
 * See <https://github.com/ipfs/helia-http-gateway/pkgs/container/helia-http-gateway> for more information.
 *
 * ## Run Using Docker Compose
 *
 * ```sh
 * $ docker-compose up
 * ```
 *
 * ## Run Using Docker
 *
 * ### Build
 *
 * ```sh
 * $ docker build . --tag helia-http-gateway:local
 * ```
 *
 * Pass the explicit platform when building on a Mac.
 *
 * ```sh
 * $ docker build . --platform linux/arm64 --tag helia-http-gateway:local-arm64
 * ```
 *
 * ### Running
 *
 * ```sh
 * $ docker run -it -p 8080:8080 -e DEBUG="helia-http-gateway*" helia-http-gateway:local # or helia-http-gateway:local-arm64
 * ```
 *
 * ## Run without Docker
 *
 * ### Build
 *
 * ```sh
 * $ npm run build
 * ```
 *
 * ### Running
 *
 * ```sh
 * $ npm start
 * ```
 *
 * ## Supported Environment Variables
 *
 * | Variable                    | Description                                                                                                                                    | Default                                                                                                                 |
 * | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
 * | `DEBUG`                     | Debug level                                                                                                                                    | `''`                                                                                                                    |
 * | `FASTIFY_DEBUG`             | Debug level for fastify's logger                                                                                                               | `''`                                                                                                                    |
 * | `PORT`                      | Port to listen on                                                                                                                              | `8080`                                                                                                                  |
 * | `HOST`                      | Host to listen on                                                                                                                              | `0.0.0.0`                                                                                                               |
 * | `USE_SUBDOMAINS`            | Whether to use [origin isolation](https://docs.ipfs.tech/how-to/gateway-best-practices/#use-subdomain-gateway-resolution-for-origin-isolation) | `true`                                                                                                                  |
 * | `METRICS`                   | Whether to enable prometheus metrics. Any value other than 'true' will disable metrics.                                                        | `true`                                                                                                                  |
 * | `USE_BITSWAP`               | Use bitswap to fetch content from IPFS                                                                                                         | `true`                                                                                                                  |
 * | `USE_TRUSTLESS_GATEWAYS`    | Whether to fetch content from trustless-gateways or not                                                                                        | `true`                                                                                                                  |
 * | `TRUSTLESS_GATEWAYS`        | Comma separated list of trusted gateways to fetch content from                                                                                 | [Defined in Helia](https://github.com/ipfs/helia/blob/main/packages/helia/src/block-brokers/trustless-gateway/index.ts) |
 * | `USE_LIBP2P`                | Whether to use libp2p networking                                                                                                               | `true`                                                                                                                  |
 * | `ECHO_HEADERS`              | A debug flag to indicate whether you want to output request and response headers                                                               | `false`                                                                                                                 |
 * | `USE_DELEGATED_ROUTING`     | Whether to use the delegated routing v1 API                                                                                                    | `true`                                                                                                                  |
 * | `DELEGATED_ROUTING_V1_HOST` | Hostname to use for delegated routing v1                                                                                                       | `https://delegated-ipfs.dev`                                                                                            |
 *
 * <!--
 * TODO: currently broken when used in docker, but they work when running locally (you can cache datastore and blockstore locally to speed things up if you want)
 * | `FILE_DATASTORE_PATH` | Path to use with a datastore-level passed to Helia as the datastore | `null`; memory datastore is used by default. |
 * | `FILE_BLOCKSTORE_PATH` | Path to use with a blockstore-level passed to Helia as the blockstore | `null`; memory blockstore is used by default. |
 * -->
 *
 * See the source of truth for all `process.env.<name>` environment variables at [src/constants.ts](src/constants.ts).
 *
 * You can also see some recommended environment variable configurations at:
 *
 * - [./.env-all](./.env-all)
 * - [./.env-delegated-routing](./.env-delegated-routing)
 * - [./.env-gwc](./.env-gwc)
 * - [./.env-trustless-only](./.env-trustless-only)
 *
 * ### Running with custom configurations
 *
 * Note that any of the following calls to docker can be replaced with something like `MY_ENV_VAR="MY_VALUE" npm run start`
 *
 * #### Disable libp2p
 *
 * ```sh
 * $ docker run -it -p $PORT:8080 -e DEBUG="helia-http-gateway*" -e USE_LIBP2P="false" helia
 * ```
 *
 * #### Disable bitswap
 *
 * ```sh
 * $ docker run -it -p $PORT:8080 -e DEBUG="helia-http-gateway*" -e USE_BITSWAP="false" helia
 * ```
 *
 * #### Disable trustless gateways
 *
 * ```sh
 * $ docker run -it -p $PORT:8080 -e DEBUG="helia-http-gateway*" -e USE_TRUSTLESS_GATEWAYS="false" helia
 * ```
 *
 * #### Customize trustless gateways
 *
 * ```sh
 * $ docker run -it -p $PORT:8080 -e DEBUG="helia-http-gateway*" -e TRUSTLESS_GATEWAYS="https://ipfs.io,https://dweb.link" helia
 * ```
 *
 * <!--
 * #### With file datastore and blockstore
 *
 * **NOTE:** Not currently supported due to docker volume? issues.
 *
 * ```sh
 * $ docker run -it -p $PORT:8080 -e DEBUG="helia-http-gateway*" -e FILE_DATASTORE_PATH="./datastore" -e FILE_BLOCKSTORE_PATH="./blockstore" helia
 * # and if you want to re-use a volume from your host:
 * $ docker run -it -p $PORT:8080 -e DEBUG="helia-http-gateway*" -e FILE_DATASTORE_PATH="./datastore" -e FILE_BLOCKSTORE_PATH="./blockstore" -v ./datastore:/datastore -v ./blockstore:/blockstore helia
 * ```
 * -->
 *
 * ## E2E Testing
 *
 * We have some tests enabled that simulate running inside of [ProbeLab's Tiros](https://github.com/plprobelab/tiros), via playwright. These tests request the same paths from ipfs.io and ensure that the resulting text matches. This is not a direct replacement for [gateway conformance testing](https://github.com/ipfs/gateway-conformance), but helps us ensure the helia-http-gateway is working as expected.
 *
 * By default, these tests:
 *
 * 1. Run in serial
 * 2. Allow for up to 5 failures before failing the whole suite run.
 * 3. Have an individual test timeout of two minutes.
 *
 * ### Run e2e tests locally
 *
 * ```sh
 * $ npm run test:e2e # run all tests
 * $ npm run test:e2e -- ${PLAYWRIGHT_OPTIONS} # run tests with custom playwright options.
 *
 * ```
 *
 * ### Get clinicjs flamecharts and doctor reports from e2e tests
 *
 * ```sh
 * $ npm run test:e2e-doctor # Run the dev server with clinicjs doctor, execute e2e tests, and generate a report.
 * $ npm run test:e2e-flame # Run the dev server with clinicjs flame, execute e2e tests, and generate a report.
 * ```
 *
 * ## Metrics
 *
 * Running with `METRICS=true` will enable collecting Fastify/libp2p metrics and
 * will expose a prometheus collection endpoint at <http://localhost:8080/metrics>
 */

import compress from '@fastify/compress'
import cors from '@fastify/cors'
import Fastify from 'fastify'
import metricsPlugin from 'fastify-metrics'
import { HOST, PORT, METRICS, ECHO_HEADERS, FASTIFY_DEBUG } from './constants.js'
import { HeliaServer, type RouteEntry } from './helia-server.js'
import { logger } from './logger.js'

const log = logger.forComponent('index')

const heliaServer = new HeliaServer(logger)
await heliaServer.isReady

// Add the prometheus middleware
const app = Fastify({
  logger: {
    enabled: FASTIFY_DEBUG !== '',
    msgPrefix: 'helia-http-gateway:fastify ',
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
  }
})

if (METRICS === 'true') {
  await app.register(metricsPlugin.default, { endpoint: '/metrics' })
}

await app.register(cors, {
  /**
   * @see https://github.com/ipfs/gateway-conformance/issues/186
   * @see https://github.com/ipfs/gateway-conformance/blob/d855ec4fb9dac4a5aaecf3776037b005cc74c566/tests/path_gateway_cors_test.go#L16-L56
   */
  allowedHeaders: ['Content-Type', 'Range', 'User-Agent', 'X-Requested-With'],
  origin: '*',
  exposedHeaders: [
    'Content-Range',
    'Content-Length',
    'X-Ipfs-Path',
    'X-Ipfs-Roots',
    'X-Chunked-Output',
    'X-Stream-Output'
  ],
  methods: ['GET', 'HEAD', 'OPTIONS'],
  strictPreflight: false,
  preflightContinue: true
})
await app.register(compress, {
  global: true
})
heliaServer.routes.forEach(({ path, type, handler }: RouteEntry) => {
  app.route({
    method: type,
    url: path,
    handler
  })
})

if ([ECHO_HEADERS].includes(true)) {
  app.addHook('onRequest', async (request, reply) => {
    if (ECHO_HEADERS) {
      log('fastify hook onRequest: echoing headers:')
      Object.keys(request.headers).forEach((headerName) => {
        log('\t %s: %s', headerName, request.headers[headerName])
      })
    }
  })

  app.addHook('onSend', async (request, reply, payload) => {
    if (ECHO_HEADERS) {
      log('fastify hook onSend: echoing headers:')
      const responseHeaders = reply.getHeaders()
      Object.keys(responseHeaders).forEach((headerName) => {
        log('\t %s: %s', headerName, responseHeaders[headerName])
      })
    }
    return payload
  })
}

await app.listen({ port: PORT, host: HOST })

const stopWebServer = async (): Promise<void> => {
  try {
    await app.close()
  } catch (error) {
    log.error(error)
    process.exit(1)
  }
  log('Closed out remaining webServer connections.')
}

let shutdownRequested = false
async function closeGracefully (signal: number): Promise<void> {
  log(`Received signal to terminate: ${signal}`)
  if (shutdownRequested) {
    log('closeGracefully: shutdown already requested, exiting callback.')
    return
  }
  shutdownRequested = true

  await Promise.all([heliaServer.stop().then(() => {
    log('Stopped Helia.')
  }), stopWebServer()])

  process.kill(process.pid, signal)
}

['SIGHUP', 'SIGINT', 'SIGTERM', 'beforeExit'].forEach((signal: string) => {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.once(signal, closeGracefully)
})
