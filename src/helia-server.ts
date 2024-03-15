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

    const finalUrl = `//${cidv1Address ?? encodedDnsLink}.${namespace}.${request.hostname}/${relativePath ?? ''}`
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

  /**
   * Fetches a content for a subdomain, which basically queries delegated routing API and then fetches the path from helia.
   */
  async fetch ({ request, reply }: RouteHandler): Promise<void> {
    const url = this.#getFullUrlFromFastifyRequest(request)
    this.log('fetching url "%s" with @helia/verified-fetch', url)

    const opController = new AbortController()
    setMaxListeners(Infinity, opController.signal)
    request.raw.on('close', () => {
      if (request.raw.aborted) {
        this.log('request aborted by client')
        opController.abort()
      }
    })
    await this.isReady
    const resp = await this.heliaFetch(url, { signal: opController.signal, redirect: 'manual' })
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
  async gc ({ reply }: RouteHandler): Promise<void> {
    await this.isReady
    this.log('running `gc` on Helia node')
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
