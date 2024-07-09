#!/usr/bin/env node
import { HOST, RPC_PORT } from './constants.js'

/**
 * This healthcheck script is used to check if the server is running and healthy
 */
const rootReq = await fetch(`http://${HOST}:${RPC_PORT}/api/v0/http-gateway-healthcheck`, {
  method: 'GET'
})
const status = rootReq.status

process.exit(status === 200 ? 0 : 1)
