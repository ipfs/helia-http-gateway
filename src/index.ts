import cors from '@fastify/cors'
import debug from 'debug'
import Fastify from 'fastify'
import metricsPlugin from 'fastify-metrics'
import { FASTIFY_DEBUG, HOST, PORT, METRICS, ECHO_HEADERS } from './constants.js'
import { HeliaServer, type RouteEntry } from './heliaServer.js'

const logger = debug('helia-http-gateway')

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
      logger('fastify hook onRequest: echoing headers:')
      Object.keys(request.headers).forEach((headerName) => {
        logger('\t %s: %s', headerName, request.headers[headerName])
      })
    }
  })

  app.addHook('onSend', async (request, reply, payload) => {
    if (ECHO_HEADERS) {
      logger('fastify hook onSend: echoing headers:')
      const responseHeaders = reply.getHeaders()
      Object.keys(responseHeaders).forEach((headerName) => {
        logger('\t %s: %s', headerName, responseHeaders[headerName])
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
    // eslint-disable-next-line no-console
    console.error(error)
    process.exit(1)
  }
  // eslint-disable-next-line no-console
  console.log('Closed out remaining webServer connections.')
}

let shutdownRequested = false
async function closeGracefully (signal: number): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`Received signal to terminate: ${signal}`)
  if (shutdownRequested) {
    // eslint-disable-next-line no-console
    console.log('closeGracefully: shutdown already requested, exiting callback.')
    return
  }
  shutdownRequested = true

  await Promise.all([heliaServer.stop().then(() => {
    // eslint-disable-next-line no-console
    console.log('Stopped Helia.')
  }), stopWebServer()])

  process.kill(process.pid, signal)
}

['SIGHUP', 'SIGINT', 'SIGTERM', 'beforeExit'].forEach((signal: string) => {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.once(signal, closeGracefully)
})
