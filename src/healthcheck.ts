#!/usr/bin/env node
import { HOST, PORT } from './constants.js'
import { logger } from './logger.js'

const log = logger.forComponent('healthcheck')

/**
 * This healthcheck script is used to check if the server is running and healthy.
 */
const rootReq = await fetch(`http://${HOST}:${PORT}/api/v0/http-gateway-healthcheck`, { method: 'GET' })
const status = rootReq.status

log(`Healthcheck status: ${status}`)
process.exit(status === 200 ? 0 : 1)
