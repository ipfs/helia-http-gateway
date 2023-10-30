import { type FastifyReply, type FastifyRequest } from 'fastify'
import { CID } from 'multiformats'
import { DEFAULT_MIME_TYPE, parseContentType } from './contentType.js'
import { getCustomHelia } from './getCustomHelia.js'
import { HeliaFetch } from './heliaFetch.js'
import type debug from 'debug'

const HELIA_RELEASE_INFO_API = (version: string): string => `https://api.github.com/repos/ipfs/helia/git/ref/tags/helia-v${version}`

export interface RouteEntry {
  path: string
  type: 'GET' | 'POST'
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
}

interface RouteHandler {
  request: FastifyRequest
  reply: FastifyReply
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
    this.log = logger.extend('fastify')
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
      node: await getCustomHelia()
    })
    await this.heliaFetch.ready
    // eslint-disable-next-line no-console
    console.log('Helia Started!')
    this.routes = [
      {
        path: '/:ns(ipfs|ipns)/*',
        type: 'GET',
        handler: async (request, reply): Promise<void> => this.redirectToSubdomainGW({ request, reply })
      }, {
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
      }, {
        path: '/*',
        type: 'GET',
        handler: async (request, reply): Promise<void> => this.fetch({ request, reply })
      }
    ]
  }

  /**
   * Redirects to the subdomain gateway.
   */
  private async redirectToSubdomainGW ({ request, reply }: RouteHandler): Promise<void> {
    const { namespace, address, relativePath } = this.heliaFetch.parsePath(request.url)
    let cidv1Address: string | null = null
    if (this.HAS_UPPERCASE_REGEX.test(address)) {
      cidv1Address = CID.parse(address).toV1().toString()
    }
    const finalUrl = `//${cidv1Address ?? address}.${namespace}.${request.hostname}${relativePath}`
    this.log('Redirecting to final URL:', finalUrl)
    await reply.redirect(301, finalUrl)
  }

  /**
   * Parses the host into its parts.
   */
  private parseHostParts (host: string): { address: string, namespace: string } {
    const result = host.match(this.HOST_PART_REGEX)
    return {
      address: result?.groups?.address ?? '',
      namespace: result?.groups?.namespace ?? ''
    }
  }

  /**
   * Fetches a path, which basically queries delegated routing API and then fetches the path from helia.
   */
  async fetch ({ request, reply }: RouteHandler): Promise<void> {
    try {
      await this.isReady
      this.log('Requesting content from helia:', request.url)
      let type: string | undefined
      const { address, namespace } = this.parseHostParts(request.hostname)
      if (address === '' || namespace === '') {
        return await reply.code(200).send('try /ipfs/<cid> or /ipns/<name>')
      }
      const { url: relativePath } = request
      this.log('Fetching from Helia:', { address, namespace, relativePath })
      // raw response is needed to respond with the correct content type.
      for await (const chunk of await this.heliaFetch.fetch({ address, namespace, relativePath })) {
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
      reply.raw.end()
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
    await this.heliaFetch.node?.gc()
    await reply.code(200).send('OK')
  }

  /**
   * Stop the server
   */
  async stop (): Promise<void> {
    await this.heliaFetch.stop()
  }
}
