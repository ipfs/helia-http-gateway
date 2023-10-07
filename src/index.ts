import debug from 'debug'
import express from 'express'
import promBundle from 'express-prom-bundle'
import { HeliaServer, type IRouteEntry } from './heliaServer.js'

const logger = debug('helia-server')
const app = express()
const promMetricsMiddleware = promBundle({ includeMethod: true })

// Constants
const PORT = 8080
const HOST = 'localhost'

// Add the prometheus middleware
app.use(promMetricsMiddleware)

const heliaServer = new HeliaServer(logger)
await heliaServer.isReady

// Add the routes
app.get('/', (req, res) => {
  res.send('Helia Docker, to fetch a page, call `/ipns/<path>` or `/ipfs/<cid>`')
})
// eslint-disable-next-line @typescript-eslint/no-misused-promises
heliaServer.routes.map(({ type, path, handler }: IRouteEntry) => app[type](path, handler))

app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://${HOST}:${PORT}`)
})
