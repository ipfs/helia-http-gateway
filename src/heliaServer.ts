import { type Request, type Response } from 'express'
import { DEFAULT_MIME_TYPE, parseContentType } from './contentType.js'
import { HeliaFetch } from './heliaFetch.js'
import type debug from 'debug'

const HELIA_RELEASE_INFO_API = (version: string): string => `https://api.github.com/repos/ipfs/helia/git/ref/tags/helia-v${version}`

export interface IRouteEntry {
  path: string
  type: 'get' | 'post'
  handler: (request: Request, response: Response) => Promise<void>
}

interface IRouteHandler {
  request: Request
  response: Response
}

export class HeliaServer {
  private heliaFetch!: HeliaFetch
  private heliaVersionInfo!: { Version: string, Commit: string }
  private readonly log: debug.Debugger
  public isReady: Promise<void>
  public routes: IRouteEntry[]

  constructor (logger: debug.Debugger) {
    this.log = logger.extend('express')
    this.isReady = this.init()
    this.routes = []
    this.log('Initialized')
  }

  /**
   * Initialize the HeliaServer instance
   */
  async init (): Promise<void> {
    this.heliaFetch = new HeliaFetch({ logger: this.log })
    await this.heliaFetch.ready
    // eslint-disable-next-line no-console
    console.log('Helia Started!')
    this.routes = [
      {
        path: '/:ns(ipfs|ipns)/*',
        type: 'get',
        handler: async (request, response): Promise<void> => this.fetch({ request, response })
      }, {
        path: '/api/v0/version',
        type: 'get',
        handler: async (request, response): Promise<void> => this.heliaVersion({ request, response })
      }, {
        path: '/api/v0/repo/gc',
        type: 'post',
        handler: async (request, response): Promise<void> => this.gc({ request, response })
      }, {
        path: '/*',
        type: 'get',
        handler: async (request, response): Promise<void> => this.redirectRelative({ request, response })
      }
    ]
  }

  /**
   * Handles redirecting to the relative path
   */
  private async redirectRelative ({ request, response }: IRouteHandler): Promise<void> {
    try {
      const referrerPath = new URL(request.headers.referer ?? '').pathname
      if (referrerPath !== undefined) {
        this.log('Referer found:', referrerPath)
        let relativeRedirectPath = `${referrerPath}${request.path}`
        const { namespace, address } = this.heliaFetch.parsePath(referrerPath)
        if (namespace === 'ipns') {
          relativeRedirectPath = `/${namespace}/${address}${request.path}`
        }
        // absolute redirect
        this.log('Redirecting to relative to referer:', referrerPath)
        response.redirect(301, relativeRedirectPath)
      }
    } catch (error) {
      this.log('Error redirecting to relative path:', error)
      response.status(500).end()
    }
  }

  /**
   * Fetches from helia and writes the chunks to the response.
   */
  private async fetchFromHeliaAndWriteToResponse ({ request, response }: IRouteHandler): Promise<void> {
    await this.isReady
    let type: string | undefined
    const { path } = request
    this.log('Fetching from Helia:', path)
    for await (const chunk of await this.heliaFetch.fetch(path)) {
      if (type === undefined) {
        const { relativePath } = this.heliaFetch.parsePath(path)
        type = await parseContentType({ bytes: chunk, path: relativePath })
        // this needs to happen first.
        response.setHeader('Content-Type', type ?? DEFAULT_MIME_TYPE)
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      }
      response.write(Buffer.from(chunk))
    }
    response.end()
  }

  /**
   * Checks if the request requires additional redirection.
   */
  async requiresAdditionalRedirection ({ request, response }: IRouteHandler): Promise<void> {
    const {
      namespace: reqNamespace,
      relativePath,
      address: reqDomain
    } = this.heliaFetch.parsePath(request.path)

    if (request.headers.referer !== undefined) {
      this.log('Referer found:', request.headers.referer)
      const refererPath = new URL(request.headers.referer).pathname
      const {
        namespace: refNamespace,
        address: refDomain
      } = this.heliaFetch.parsePath(refererPath)

      if (reqNamespace !== refNamespace || reqDomain !== refDomain) {
        if (!request.originalUrl.startsWith(refererPath) &&
          (refNamespace === 'ipns' || refNamespace === 'ipfs')
        ) {
          const finalUrl = `${request.headers.referer}/${reqDomain}/${relativePath}`.replace(/([^:]\/)\/+/g, '$1')
          this.log('Redirecting to final URL:', finalUrl)
          response.redirect(301, finalUrl)
        }
      }
    }
  }

  /**
   * Fetches a path, which basically queries delegated routing API and then fetches the path from helia.
   */
  async fetch ({ request, response }: IRouteHandler): Promise<void> {
    try {
      await this.isReady
      await this.requiresAdditionalRedirection({ request, response })
      this.log('Requesting content from helia:', request.path)
      await this.fetchFromHeliaAndWriteToResponse({ response, request })
    } catch (error) {
      this.log('Error requesting content from helia:', error)
      response.status(500).end()
    }
  }

  /**
   * Get the helia version
   */
  async heliaVersion ({ response }: IRouteHandler): Promise<void> {
    await this.isReady

    try {
      if (this.heliaVersionInfo === undefined) {
        this.log('Fetching Helia version info')
        const { default: packageJson } = await import('../../node_modules/helia/package.json', {
          assert: { type: 'json' }
        })
        const { version: heliaVersionString } = packageJson

        const ghResp = await (await fetch(HELIA_RELEASE_INFO_API(heliaVersionString))).json()
        this.heliaVersionInfo = {
          Version: heliaVersionString,
          Commit: ghResp.object.sha.slice(0, 7)
        }
      }

      this.log('Helia version info:', this.heliaVersionInfo)
      response.json(this.heliaVersionInfo)
    } catch (error) {
      response.status(500).end()
    }
  }

  /**
   * GC the node
   */
  async gc ({ response }: IRouteHandler): Promise<void> {
    await this.isReady
    this.log('GCing node')
    await this.heliaFetch.node?.gc()
    response.status(200).end()
  }
}
