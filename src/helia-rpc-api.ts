import { GC_TIMEOUT_MS, HEALTHCHECK_TIMEOUT_MS } from './constants.js'
import { getRequestAwareSignal } from './helia-server.js'
import type { VerifiedFetch } from '@helia/verified-fetch'
import type { ComponentLogger } from '@libp2p/interface'
import type { FastifyReply, FastifyRequest, RouteOptions } from 'fastify'
import type { Helia } from 'helia'

const HELIA_RELEASE_INFO_API = (version: string): string => `https://api.github.com/repos/ipfs/helia/git/ref/tags/helia-v${version}`

export interface HeliaRPCAPIOptions {
  logger: ComponentLogger
  helia: Helia
  fetch: VerifiedFetch
}

export function rpcApi (opts: HeliaRPCAPIOptions): RouteOptions[] {
  const log = opts.logger.forComponent('rpc-api')
  let heliaVersionInfo: { Version: string, Commit: string } | undefined

  /**
   * Get the helia version
   */
  async function heliaVersion (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      if (heliaVersionInfo === undefined) {
        log('fetching Helia version info')
        const { default: packageJson } = await import('../../node_modules/helia/package.json', {
          assert: { type: 'json' }
        })
        const { version: heliaVersionString } = packageJson
        log('helia version string:', heliaVersionString)

        // handling the next versioning strategy
        const [heliaNextVersion, heliaNextCommit] = heliaVersionString.split('-')
        if (heliaNextCommit != null) {
          heliaVersionInfo = {
            Version: heliaNextVersion,
            Commit: heliaNextCommit
          }
        } else {
          // if this is not a next version, we will fetch the commit from github.
          const ghResp = await (await fetch(HELIA_RELEASE_INFO_API(heliaVersionString))).json()
          heliaVersionInfo = {
            Version: heliaVersionString,
            Commit: ghResp.object.sha.slice(0, 7)
          }
        }
      }

      log('helia version info:', heliaVersionInfo)
      await reply.code(200).header('Content-Type', 'application/json; charset=utf-8').send(heliaVersionInfo)
    } catch (err) {
      log.error('could not send version', err)
      await reply.code(500).send(err)
    }
  }

  /**
   * GC the node
   */
  async function gc (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    log('running `gc` on Helia node')
    const signal = getRequestAwareSignal(request, log, {
      timeout: GC_TIMEOUT_MS
    })
    await opts.helia.gc({ signal })
    await reply.code(200).send('OK')
  }

  async function healthCheck (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const signal = getRequestAwareSignal(request, log, {
      timeout: HEALTHCHECK_TIMEOUT_MS
    })
    try {
      // echo "hello world" | npx kubo add --cid-version 1 -Q --inline
      // inline CID is bafkqaddimvwgy3zao5xxe3debi
      await opts.fetch('ipfs://bafkqaddimvwgy3zao5xxe3debi', { signal, redirect: 'follow' })
      await reply.code(200).send('OK')
    } catch (err) {
      log.error('could not run healthcheck', err)
      await reply.code(500).send(err)
    }
  }

  return [
    {
      url: '/api/v0/version',
      method: ['POST', 'GET'],
      handler: async (request, reply): Promise<void> => heliaVersion(request, reply)
    }, {
      url: '/api/v0/repo/gc',
      method: ['POST', 'GET'],
      handler: async (request, reply): Promise<void> => gc(request, reply)
    },
    {
      url: '/api/v0/http-gateway-healthcheck',
      method: 'GET',
      handler: async (request, reply): Promise<void> => healthCheck(request, reply)
    },
    {
      url: '/*',
      method: 'GET',
      handler: async (request, reply): Promise<void> => {
        await reply.code(400).send('API + Method not supported')
      }
    }
  ]
}
