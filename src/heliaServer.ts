/* eslint-disable @typescript-eslint/strict-boolean-expressions  */
import { setMaxListeners } from 'node:events'
import { createVerifiedFetch } from '@helia/verified-fetch'
import { type FastifyReply, type FastifyRequest, type RouteGenericInterface } from 'fastify'
import { USE_SUBDOMAINS } from './constants.js'
import { getCustomHelia } from './getCustomHelia.js'
import { getIpnsAddressDetails } from './ipns-address-utils.js'
import type { PeerId } from '@libp2p/interface'
import type debug from 'debug'
import type { Helia } from 'helia'
import type { CID } from 'multiformats/cid'

const HELIA_RELEASE_INFO_API = (version: string): string => `https://api.github.com/repos/ipfs/helia/git/ref/tags/helia-v${version}`

export interface RouteEntry<T extends RouteGenericInterface = RouteGenericInterface> {
  path: string
  type: 'GET' | 'POST' | 'OPTIONS'
  handler(request: FastifyRequest<T>, reply: FastifyReply): Promise<void>
}

interface RouteHandler<T extends RouteGenericInterface = RouteGenericInterface> {
  request: FastifyRequest<T>
  reply: FastifyReply
}

interface EntryParams {
  ns: string
  address: string
  '*': string
}

interface HeliaPathParts {
  address: string
  namespace: string
  relativePath: string
}

interface HeliaFetchOptions extends HeliaPathParts {
  signal?: AbortSignal
  cid?: CID | null
  peerId?: PeerId | null
}

export class HeliaServer {
  private heliaFetch!: Awaited<ReturnType<typeof createVerifiedFetch>>
  private heliaVersionInfo!: { Version: string, Commit: string }
  private readonly HOST_PART_REGEX = /^(?<address>.+)\.(?<namespace>ip[fn]s)\..+$/
  private readonly log: debug.Debugger
  public isReady: Promise<void>
  public routes: RouteEntry[]
  private heliaNode!: Helia

  constructor (logger: debug.Debugger) {
    this.log = logger.extend('server')
    this.isReady = this.init()
      .then(() => {
        this.log('Initialized')
      })
      .catch((error) => {
        this.log('Error initializing:', error)
        throw error
      })
    this.routes = []
  }

  /**
   * Initialize the HeliaServer instance
   */
  async init (): Promise<void> {
    this.heliaNode = await getCustomHelia()
    this.heliaFetch = await createVerifiedFetch(this.heliaNode)

    // eslint-disable-next-line no-console
    console.log('Helia Started!')
    this.routes = [
      {
        // without this non-wildcard postfixed path, the '/*' route will match first.
        path: '/:ns(ipfs|ipns)/:address', // ipns/dnsLink or ipfs/cid
        type: 'GET',
        handler: async (request, reply): Promise<void> => this.handleEntry({ request, reply })
      },
      {
        path: '/:ns(ipfs|ipns)/:address/*', // ipns/dnsLink/relativePath or ipfs/cid/relativePath
        type: 'GET',
        handler: async (request, reply): Promise<void> => this.handleEntry({ request, reply })
      },
      {
        path: '/api/v0/version',
        type: 'POST',
        handler: async (request, reply): Promise<void> => this.heliaVersion({ request, reply })
      }, {
        path: '/api/v0/version',
        type: 'GET',
        handler: async (request, reply): Promise<void> => this.heliaVersion({ request, reply })
      }, {
        path: '/api/v0/repo/gc',
        type: 'POST',
        handler: async (request, reply): Promise<void> => this.gc({ request, reply })
      },
      {
        path: '/api/v0/repo/gc',
        type: 'GET',
        handler: async (request, reply): Promise<void> => this.gc({ request, reply })
      },
      {
        path: '/*',
        type: 'GET',
        handler: async (request, reply): Promise<void> => {
          try {
            await this.fetch({ request, reply })
          } catch {
            await reply.code(200).send('try /ipfs/<cid> or /ipns/<name>')
          }
        }
      },
      {
        path: '/',
        type: 'GET',
        handler: async (request, reply): Promise<void> => {
          if (request.url.includes('/api/v0')) {
            await reply.code(400).send('API + Method not supported')
            return
          }
          if (USE_SUBDOMAINS && request.hostname.split('.').length > 1) {
            return this.fetch({ request, reply })
          }
          await reply.code(200).send('try /ipfs/<cid> or /ipns/<name>')
        }
      }
    ]
  }

  /**
   * Redirects to the subdomain gateway.
   */
  private async handleEntry ({ request, reply }: RouteHandler): Promise<void> {
    const { params } = request
    const { ns: namespace, '*': relativePath, address } = params as EntryParams
    this.log('Handling entry: ', { address, namespace, relativePath })
    if (!USE_SUBDOMAINS) {
      this.log('Subdomains are disabled, fetching without subdomain')
      return this.fetchWithoutSubdomain({ request, reply, address, namespace, relativePath })
    } else {
      this.log('Subdomains are enabled, redirecting to subdomain')
    }
    if (address.includes('wikipedia')) {
      await reply.code(500).send('Wikipedia is not yet supported. Follow https://github.com/ipfs/helia-http-gateway/issues/35 for more information.')
      return
    }

    const { peerId, cid } = getIpnsAddressDetails(address)
    if (peerId != null) {
      return this.fetchWithoutSubdomain({ request, reply, address, namespace, relativePath, peerId, cid })
    }
    const cidv1Address = cid?.toString()

    const query = (request.query as Record<string, string>)
    this.log('query: ', query)
    // eslint-disable-next-line no-warning-comments
    // TODO: enable support for query params
    if (query != null) {
      // http://localhost:8090/ipfs/bafybeie72edlprgtlwwctzljf6gkn2wnlrddqjbkxo3jomh4n7omwblxly/dir?format=raw
      // eslint-disable-next-line no-warning-comments
      // TODO: temporary ipfs gateway spec?
      // if (query.uri != null) {
      // // Test = http://localhost:8080/ipns/?uri=ipns%3A%2F%2Fdnslink-subdomain-gw-test.example.org
      //   this.log('Got URI query parameter: ', query.uri)
      //   const url = new URL(query.uri)
      //   address = url.hostname
      // }
      // finalUrl += encodeURIComponent(`?${new URLSearchParams(request.query).toString()}`)
    }
    this.log('relativePath: ', relativePath)

    const finalUrl = `//${cidv1Address ?? address}.${namespace}.${request.hostname}/${relativePath ?? ''}`
    this.log('Redirecting to final URL:', finalUrl)
    await reply
      .headers({
        Location: finalUrl
      })
      .code(301)
      .send()
  }

  /**
   * Parses the host into its parts.
   */
  private parseHostParts (host: string): { address: string, namespace: string } {
    const result = host.match(this.HOST_PART_REGEX)
    if (result == null || result?.groups == null) {
      this.log(`Error parsing path: ${host}:`, result)
      throw new Error(`Subdomain: ${host} is not valid`)
    }
    return result.groups as { address: string, namespace: string }
  }

  async fetchWithoutSubdomain ({ request, reply, peerId, cid, address, namespace, relativePath }: RouteHandler & HeliaFetchOptions): Promise<void> {
    this.log('Fetching without subdomain')
    const opController = new AbortController()
    setMaxListeners(Infinity, opController.signal)
    request.raw.on('close', () => {
      if (request.raw.aborted) {
        this.log('Request aborted by client')
        opController.abort()
      }
    })
    // const { ns: namespace, address, '*': relativePath } = request.params as EntryParams
    try {
      await this.isReady
      await this._fetch({ request, reply, address, namespace, relativePath, signal: opController.signal, peerId, cid })
    } catch (error) {
      this.log('Error requesting content from helia:', error)
      await reply.code(500).send(error)
    }
  }

  /**
   * Convert HeliaFetchOptions to a URL string compatible with `@helia/verified-fetch`
   */
  #getUrlFromArgs ({ address, namespace, relativePath, peerId, cid }: HeliaFetchOptions): string {
    // if (peerId != null) {
    //   // we have a peerId, so we need to pass `ipns://<peerId>/relativePath` to @helia/verified-fetch.
    //   return `${namespace}://${peerId.toString()}/${relativePath}`
    // }
    if (relativePath == null || relativePath === '' || relativePath === '/') {
      // we have a CID, so we need to pass `ipfs://<cid>` to @helia/verified-fetch.
      return `${namespace}://${address}`
    }
    return `${namespace}://${address}/${relativePath}`
  }

  /**
   * Fetches a content for a subdomain, which basically queries delegated routing API and then fetches the path from helia.
   */
  async _fetch ({ reply, address, namespace, relativePath, signal, cid, peerId }: RouteHandler & HeliaFetchOptions & { signal: AbortSignal }): Promise<void> {
    this.log('Fetching from Helia:', { address, namespace, relativePath })
    // let type: string | undefined
    const url = this.#getUrlFromArgs({ address, namespace, relativePath, peerId, cid })
    this.log('got URL for verified-fetch: ', url)

    const verifiedFetchResponse = await this.heliaFetch(url, { signal })
    this.log('Got verified-fetch response: ', verifiedFetchResponse.status)

    if (!verifiedFetchResponse.ok) {
      this.log('verified-fetch response not ok: ', verifiedFetchResponse.status)
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      reply.code(verifiedFetchResponse.status).send(verifiedFetchResponse.statusText)
      return
    }
    const contentType = verifiedFetchResponse.headers.get('content-type')
    if (contentType == null) {
      this.log('verified-fetch response has no content-type')
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      reply.code(200).send(verifiedFetchResponse.body)
      return
    }
    if (verifiedFetchResponse.body == null) {
      this.log('verified-fetch response has no body')
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      reply.code(501).send('empty')
      return
    }

    const headers: Record<string, string> = {}
    for (const [headerName, headerValue] of verifiedFetchResponse.headers.entries()) {
      headers[headerName] = headerValue
    }
    // Fastify really does not like streams despite what the documentation and github issues say.
    const reader = verifiedFetchResponse.body.getReader()
    reply.raw.writeHead(verifiedFetchResponse.status, headers)
    try {
      let done = false
      while (!done) {
        const { done: _done, value } = await reader.read()
        if (value != null) {
          reply.raw.write(Buffer.from(value))
        }
        done = _done
      }
    } catch (err) {
      this.log('Error reading response:', err)
    } finally {
      reply.raw.end()
    }
  }

  /**
   * Fetches a content for a subdomain, which basically queries delegated routing API and then fetches the path from helia.
   */
  async fetch ({ request, reply }: RouteHandler): Promise<void> {
    this.log('Fetching from Helia:', request.url)
    const opController = new AbortController()
    setMaxListeners(Infinity, opController.signal)
    request.raw.on('close', () => {
      if (request.raw.aborted) {
        this.log('Request aborted by client')
        opController.abort()
      }
    })
    try {
      await this.isReady
      this.log('Requesting content from helia:', request.url)
      let address: string
      let namespace: string
      try {
        const hostParts = this.parseHostParts(request.hostname)
        address = hostParts.address
        namespace = hostParts.namespace
      } catch (e) {
        // not a valid request, should have been caught prior to calling this method.
        return reply.code(200).send('try /ipfs/<cid> or /ipns/<name>')
      }
      if (address.includes('wikipedia')) {
        await reply.code(500).send('Wikipedia is not yet supported. Follow https://github.com/ipfs/helia-http-gateway/issues/35 for more information.')
        return
      }
      const { url: relativePath } = request
      await this._fetch({ request, reply, address, namespace, relativePath, signal: opController.signal })
    } catch (error) {
      this.log('Error requesting content from helia:', error)
      await reply.code(500).send(error)
    }
  }

  /**
   * Get the helia version
   */
  async heliaVersion ({ reply }: RouteHandler): Promise<void> {
    await this.isReady

    try {
      if (this.heliaVersionInfo === undefined) {
        this.log('Fetching Helia version info')
        const { default: packageJson } = await import('../../node_modules/helia/package.json', {
          assert: { type: 'json' }
        })
        const { version: heliaVersionString } = packageJson
        this.log('Helia version string:', heliaVersionString)

        // handling the next versioning strategy
        const [heliaNextVersion, heliaNextCommit] = heliaVersionString.split('-')
        if (heliaNextCommit != null) {
          this.heliaVersionInfo = {
            Version: heliaNextVersion,
            Commit: heliaNextCommit
          }
        } else {
          // if this is not a next version, we will fetch the commit from github.
          const ghResp = await (await fetch(HELIA_RELEASE_INFO_API(heliaVersionString))).json()
          this.heliaVersionInfo = {
            Version: heliaVersionString,
            Commit: ghResp.object.sha.slice(0, 7)
          }
        }
      }

      this.log('Helia version info:', this.heliaVersionInfo)
      await reply.code(200).header('Content-Type', 'application/json; charset=utf-8').send(this.heliaVersionInfo)
    } catch (error) {
      await reply.code(500).send(error)
    }
  }

  /**
   * GC the node
   */
  async gc ({ reply }: RouteHandler): Promise<void> {
    await this.isReady
    this.log('GCing node')
    await this.heliaNode?.gc({ signal: AbortSignal.timeout(20000) })
    await reply.code(200).send('OK')
  }

  /**
   * Stop the server
   */
  async stop (): Promise<void> {
    await this.heliaFetch.stop()
  }
}
