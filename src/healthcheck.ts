#!/usr/bin/env node
import { HOST, PORT } from './constants.js'
/**
 * This healthcheck script is used to check if the server is running and healthy.
 */
const rootReq = await fetch(`http://${HOST}:${PORT}`, { method: 'GET' })
const status = rootReq.status
// eslint-disable-next-line no-console
console.log(`Healthcheck status: ${status}`)
process.exit(status === 200 ? 0 : 1)
