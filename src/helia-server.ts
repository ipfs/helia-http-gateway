import { setMaxListeners } from 'node:events'
import { createVerifiedFetch, type VerifiedFetch } from '@helia/verified-fetch'
import { type FastifyReply, type FastifyRequest, type RouteGenericInterface } from 'fastify'
import { USE_SUBDOMAINS } from './constants.js'
import { contentTypeParser } from './content-type-parser.js'
import { dnsLinkLabelEncoder, isInlinedDnsLink } from './dns-link-labels.js'
import { getCustomHelia } from './get-custom-helia.js'
import { getIpnsAddressDetails } from './ipns-address-utils.js'
import type { ComponentLogger, Logger } from '@libp2p/interface'
import type { Helia } from 'helia'

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

export class HeliaServer {
  private heliaFetch!: VerifiedFetch
  private heliaVersionInfo!: { Version: string, Commit: string }
  private readonly log: Logger
  public isReady: Promise<void>
  public routes: RouteEntry[]
  private heliaNode!: Helia

  constructor (logger: ComponentLogger) {
    this.log = logger.forComponent('server')
    this.isReady = this.init()
      .then(() => {
        this.log('initialized')
      })
      .catch((error) => {
        this.log.error('error initializing:', error)
        throw error
      })
    this.routes = []
  }

  /**
   * Initialize the HeliaServer instance
   */
  async init (): Promise<void> {
    this.heliaNode = await getCustomHelia()
    this.heliaFetch = await createVerifiedFetch(this.heliaNode, { contentTypeParser })

    this.log('heliaServer Started!')
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
        path: '/api/v0/http-gateway-healthcheck',
        type: 'GET',
        handler: async (request, reply): Promise<void> => {
          const signal = AbortSignal.timeout(1000)
          try {
            // echo "hello world" | npx kubo add --cid-version 1 -Q --inline
            // inline CID is bafkqaddimvwgy3zao5xxe3debi
            await this.heliaFetch('ipfs://bafkqaddimvwgy3zao5xxe3debi', { signal, redirect: 'follow' })
            await reply.code(200).send('OK')
          } catch (error) {
            await reply.code(500).send(error)
          }
        }
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
    this.log('fetch request %s', request.url)
    const { ns: namespace, '*': relativePath, address } = params as EntryParams

    this.log('handling entry: ', { address, namespace, relativePath })
    if (!USE_SUBDOMAINS) {
      this.log('subdomains are disabled, fetching without subdomain')
      return this.fetch({ request, reply })
    } else {
      this.log('subdomains are enabled, redirecting to subdomain')
    }

    const { peerId, cid } = getIpnsAddressDetails(address)
    if (peerId != null) {
      return this.fetch({ request, reply })
    }
    const cidv1Address = cid?.toString()

    const query = request.query as Record<string, string>
    this.log.trace('query: ', query)
    // eslint-disable-next-line no-warning-comments
    // TODO: enable support for query params
    if (query != null) {
      // http://localhost:8090/ipfs/bafybeie72edlprgtlwwctzljf6gkn2wnlrddqjbkxo3jomh4n7omwblxly/dir?format=raw
      // eslint-disable-next-line no-warning-comments
      // TODO: temporary ipfs gateway spec?
      // if (query.uri != null) {
      // // Test = http://localhost:8080/ipns/?uri=ipns%3A%2F%2Fdnslink-subdomain-gw-test.example.org
      //   this.log('got URI query parameter: ', query.uri)
      //   const url = new URL(query.uri)
      //   address = url.hostname
      // }
      // finalUrl += encodeURIComponent(`?${new URLSearchParams(request.query).toString()}`)
    }
    let encodedDnsLink = address
    if (!isInlinedDnsLink(address)) {
      encodedDnsLink = dnsLinkLabelEncoder(address)
    }

    const finalUrl = `${request.protocol}://${cidv1Address ?? encodedDnsLink}.${namespace}.${request.hostname}/${relativePath ?? ''}`
    this.log('redirecting to final URL:', finalUrl)
    await reply
      .headers({
        Location: finalUrl
      })
      .code(301)
      .send()
  }

  #getFullUrlFromFastifyRequest (request: FastifyRequest): string {
    let query = ''
    if (request.query != null) {
      this.log('request.query:', request.query)
      const pairs: string[] = []
      Object.keys(request.query).forEach((key: string) => {
        const value = (request.query as Record<string, string>)[key]
        pairs.push(`${key}=${value}`)
      })
      if (pairs.length > 0) {
        query += '?' + pairs.join('&')
      }
    }

    return `${request.protocol}://${request.hostname}${request.url}${query}`
  }

  #convertVerifiedFetchResponseToFastifyReply = async (verifiedFetchResponse: Response, reply: FastifyReply): Promise<void> => {
    if (!verifiedFetchResponse.ok) {
      this.log('verified-fetch response not ok: ', verifiedFetchResponse.status)
      await reply.code(verifiedFetchResponse.status).send(verifiedFetchResponse.statusText)
      return
    }
    const contentType = verifiedFetchResponse.headers.get('content-type')
    if (contentType == null) {
      this.log('verified-fetch response has no content-type')
      await reply.code(200).send(verifiedFetchResponse.body)
      return
    }
    if (verifiedFetchResponse.body == null) {
      // this should never happen
      this.log('verified-fetch response has no body')
      await reply.code(501).send('empty')
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
      this.log.error('error reading response:', err)
    } finally {
      reply.raw.end()
    }
  }

  #getRequestAwareSignal (request: FastifyRequest, url = this.#getFullUrlFromFastifyRequest(request), timeout?: number): AbortSignal {
    const opController = new AbortController()
    setMaxListeners(Infinity, opController.signal)
    const cleanupFn = (): void => {
      if (request.raw.readableAborted) {
        this.log.trace('request aborted by client for url "%s"', url)
      } else if (request.raw.destroyed) {
        this.log.trace('request destroyed for url "%s"', url)
      } else if (request.raw.complete) {
        this.log.trace('request closed or ended in completed state for url "%s"', url)
      } else {
        this.log.trace('request closed or ended gracefully for url "%s"', url)
      }
      // we want to stop all further processing because the request is closed
      opController.abort()
    }
    /**
     * The 'close' event is emitted when the stream and any of its underlying resources (a file descriptor, for example) have been closed. The event indicates that no more events will be emitted, and no further computation will occur.
     * A Readable stream will always emit the 'close' event if it is created with the emitClose option.
     *
     * @see https://nodejs.org/api/stream.html#event-close_1
     */
    request.raw.on('close', cleanupFn)

    if (timeout != null) {
      setTimeout(() => {
        this.log.trace('request timed out for url "%s"', url)
        opController.abort()
      }, timeout)
    }
    return opController.signal
  }

  /**
   * Fetches a content for a subdomain, which basically queries delegated routing API and then fetches the path from helia.
   */
  async fetch ({ request, reply }: RouteHandler): Promise<void> {
    const url = this.#getFullUrlFromFastifyRequest(request)
    this.log('fetching url "%s" with @helia/verified-fetch', url)

    const signal = this.#getRequestAwareSignal(request, url)

    await this.isReady
    // pass headers from the original request (IncomingHttpHeaders) to HeadersInit
    const headers: Record<string, string> = {}
    for (const [headerName, headerValue] of Object.entries(request.headers)) {
      if (headerValue != null) {
        if (typeof headerValue === 'string') {
          headers[headerName] = headerValue
        } else {
          headers[headerName] = headerValue.join(',')
        }
      }
    }
    const resp = await this.heliaFetch(url, { signal, redirect: 'manual', headers })
    await this.#convertVerifiedFetchResponseToFastifyReply(resp, reply)
  }

  /**
   * Get the helia version
   */
  async heliaVersion ({ reply }: RouteHandler): Promise<void> {
    await this.isReady

    try {
      if (this.heliaVersionInfo === undefined) {
        this.log('fetching Helia version info')
        const { default: packageJson } = await import('../../node_modules/helia/package.json', {
          assert: { type: 'json' }
        })
        const { version: heliaVersionString } = packageJson
        this.log('helia version string:', heliaVersionString)

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

      this.log('helia version info:', this.heliaVersionInfo)
      await reply.code(200).header('Content-Type', 'application/json; charset=utf-8').send(this.heliaVersionInfo)
    } catch (error) {
      await reply.code(500).send(error)
    }
  }

  /**
   * GC the node
   */
  async gc ({ reply, request }: RouteHandler): Promise<void> {
    await this.isReady
    this.log('running `gc` on Helia node')
    const signal = this.#getRequestAwareSignal(request, undefined, 20000)
    await this.heliaNode?.gc({ signal })
    await reply.code(200).send('OK')
  }

  /**
   * Stop the server
   */
  async stop (): Promise<void> {
    await this.heliaFetch.stop()
  }
}
