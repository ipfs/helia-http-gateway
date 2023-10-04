/* eslint-disable no-console */
import express from 'express'
import promBundle from 'express-prom-bundle'
import heliaServer, { type IRouteEntry } from './heliaServer.js'

const app = express()
const promMetricsMiddleware = promBundle({ includeMethod: true })

// Constants
const PORT = 8080
const HOST = 'localhost'

// Add the prometheus middleware
app.use(promMetricsMiddleware)

app.get('/', (req, res) => {
  res.send('Helia Docker, to fetch a page, call `/ipns/<path>` or `/ipfs/<cid>`')
})

await heliaServer.isReady

// eslint-disable-next-line @typescript-eslint/no-misused-promises
heliaServer.routes.map(({ type, path, handler }: IRouteEntry) => app[type](path, handler))

app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`)
})
