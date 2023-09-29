/* eslint-disable no-console */
import express from 'express'
import promBundle from 'express-prom-bundle'
import heliaFetcher, { type IRouteEntry } from './heliaServer.js'

const app = express()
const promMetricsMiddleware = promBundle({ includeMethod: true })

// Constants
const PORT = 8080
const HOST = '0.0.0.0'

// Add the prometheus middleware
app.use(promMetricsMiddleware)

app.get('/', (req, res) => {
  res.send('Helia Docker, to fetch a page, call `/ipns/<path>` or `/ipfs/<cid>`')
})

await heliaFetcher.isReady

// eslint-disable-next-line @typescript-eslint/no-misused-promises
heliaFetcher.routes.map(({ type, path, handler }: IRouteEntry) => app[type](path, handler))

app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`)
})
