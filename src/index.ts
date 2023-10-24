import debug from 'debug'
import express from 'express'
import promBundle from 'express-prom-bundle'
import session from 'express-session'
import { HOST, PORT } from './constants.js'
import { HeliaServer, type IRouteEntry } from './heliaServer.js'

const logger = debug('helia-http-gateway')
const promMetricsMiddleware = promBundle({ includeMethod: true })

const heliaServer = new HeliaServer(logger)
await heliaServer.isReady

// Add the prometheus middleware
const app = express()
app.use(promMetricsMiddleware)
app.use(session({
  genid: heliaServer.sessionId,
  secret: 'very secret value'
}))

// Add the routes
app.get('/', (req, res) => {
  res.send('Helia Docker, to fetch a page, call `/ipns/<path>` or `/ipfs/<cid>`')
})
// eslint-disable-next-line @typescript-eslint/no-misused-promises
heliaServer.routes.map(({ type, path, handler }: IRouteEntry) => app[type](path, handler))

const webServer = app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://${HOST}:${PORT}`)
})

const stopWebServer = async (): Promise<void> => new Promise<void>((resolve) => {
  webServer.close((err) => {
    if (err != null) {
      // eslint-disable-next-line no-console
      console.error(err)
      process.exit(1)
    }
    // eslint-disable-next-line no-console
    console.log('Closed out remaining webServer connections.')
    resolve()
  })
})

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
