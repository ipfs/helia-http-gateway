import debug from 'debug'
import Fastify from 'fastify'
import metricsPlugin from 'fastify-metrics'
import { HOST, PORT } from './constants.js'
import { HeliaServer, type RouteEntry } from './heliaServer.js'

const logger = debug('helia-http-gateway')

const heliaServer = new HeliaServer(logger)
await heliaServer.isReady

// Add the prometheus middleware
const app = Fastify({ logger })
await app.register(metricsPlugin.default, { endpoint: '/metrics' })

heliaServer.routes.forEach(({ path, type, handler }: RouteEntry) => {
  app.route({
    method: type,
    url: path,
    handler
  })
})

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
