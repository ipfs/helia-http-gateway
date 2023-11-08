import { type FastifyReply, type FastifyRequest, type RouteGenericInterface } from 'fastify'
import { CID } from 'multiformats'
import { USE_SUBDOMAINS, RESOLVE_REDIRECTS } from './constants.js'
import { DEFAULT_MIME_TYPE, parseContentType } from './contentType.js'
import { getCustomHelia } from './getCustomHelia.js'
import { HeliaFetch } from './heliaFetch.js'
import type debug from 'debug'

const HELIA_RELEASE_INFO_API = (version: string): string => `https://api.github.com/repos/ipfs/helia/git/ref/tags/helia-v${version}`

export interface RouteEntry<T extends RouteGenericInterface = RouteGenericInterface> {
  path: string
  type: 'GET' | 'POST'
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

interface ParsedEntryParams {
  address: string
  namespace: string
  relativePath: string
}

export class HeliaServer {
  private heliaFetch!: HeliaFetch
  private heliaVersionInfo!: { Version: string, Commit: string }
  private readonly HOST_PART_REGEX = /^(?<address>.+)\.(?<namespace>ip[fn]s)\..+$/
  private readonly HAS_UPPERCASE_REGEX = /[A-Z]/
  private readonly log: debug.Debugger
  public isReady: Promise<void>
  public routes: RouteEntry[]

  constructor (logger: debug.Debugger) {
    this.log = logger.extend('server')
    this.isReady = this.init()
    this.routes = []
    this.log('Initialized')
  }

  /**
   * Initialize the HeliaServer instance
   */
  async init (): Promise<void> {
    this.heliaFetch = new HeliaFetch({
      logger: this.log,
      node: await getCustomHelia(),
      config: {
        resolveRedirects: RESOLVE_REDIRECTS
      }
    })
    await this.heliaFetch.ready
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
        handler: async (request, reply): Promise<void> => this.fetch({ request, reply })
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
    if (!USE_SUBDOMAINS) {
      return this.fetchWithoutSubdomain({ request, reply })
    }
    const { ns: namespace, address, '*': relativePath } = request.params as EntryParams
    if (address.includes('wikipedia')) {
      await reply.code(500).send('Wikipedia is not yet supported. Follow https://github.com/ipfs/helia-http-gateway/issues/35 for more information.')
      return
    }
    let cidv1Address: string | null = null
    if (this.HAS_UPPERCASE_REGEX.test(address)) {
      cidv1Address = CID.parse(address).toV1().toString()
    }
    const finalUrl = `//${cidv1Address ?? address}.${namespace}.${request.hostname}${relativePath ?? ''}`
    this.log('Redirecting to final URL:', finalUrl)
    await reply.redirect(finalUrl)
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

  async fetchWithoutSubdomain ({ request, reply }: RouteHandler): Promise<void> {
    const opController = new AbortController()
    request.raw.on('close', () => {
      if (request.raw.aborted) {
        this.log('Request aborted by client')
        opController.abort()
      }
    })
    const { ns: namespace, address, '*': relativePath } = request.params as EntryParams
    try {
      await this.isReady
      await this._fetch({ request, reply, address, namespace, relativePath, signal: opController.signal })
    } catch (error) {
      this.log('Error requesting content from helia:', error)
      await reply.code(500).send(error)
    }
  }

  async _fetch ({ reply, address, namespace, relativePath, signal }: RouteHandler & ParsedEntryParams & { signal: AbortSignal }): Promise<void> {
    this.log('Fetching from Helia:', { address, namespace, relativePath })
    let type: string | undefined
    // raw response is needed to respond with the correct content type.
    try {
      for await (const chunk of await this.heliaFetch.fetch({ address, namespace, relativePath, signal })) {
        if (type === undefined) {
          type = await parseContentType({ bytes: chunk, path: relativePath })
          // this needs to happen first.
          reply.raw.writeHead(200, {
            'Content-Type': type ?? DEFAULT_MIME_TYPE,
            'Cache-Control': 'public, max-age=31536000, immutable'
          })
        }
        reply.raw.write(Buffer.from(chunk))
      }
    } catch (err) {
      this.log('Error fetching from Helia:', err)
      // TODO: If we failed here and we already wrote the headers, we need to handle that.
      // await reply.code(500)
    } finally {
      reply.raw.end()
    }
  }

  /**
   * Fetches a content for a subdomain, which basically queries delegated routing API and then fetches the path from helia.
   */
  async fetch ({ request, reply }: RouteHandler): Promise<void> {
    const opController = new AbortController()
    request.raw.on('close', () => {
      if (request.raw.aborted) {
        this.log('Request aborted by client')
        opController.abort()
      }
    })
    try {
      await this.isReady
      this.log('Requesting content from helia:', request.url)
      const { address, namespace } = this.parseHostParts(request.hostname)
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
    await this.heliaFetch.node?.gc({ signal: AbortSignal.timeout(20000) })
    await reply.code(200).send('OK')
  }

  /**
   * Stop the server
   */
  async stop (): Promise<void> {
    await this.heliaFetch.stop()
  }
}
