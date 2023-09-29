/* eslint-disable no-console */
import { type Request, type Response } from 'express'
import { DEFAULT_MIME_TYPE, parseContentType } from './contentType.js'
import { HeliaFetch } from './heliaFetch.js'

export interface IRouteEntry {
  path: string
  type: 'get' | 'post'
  handler: (request: Request, response: Response) => Promise<void>
}

interface IRouteHandler {
  request: Request
  response: Response
}

class HeliaServer {
  private heliaFetch!: HeliaFetch
  public routes: IRouteEntry[]
  public isReady: Promise<void>

  constructor () {
    this.isReady = this.init()
    this.routes = []
  }

  /**
   * Initialize the HeliaServer instance
   */
  async init (): Promise<void> {
    this.heliaFetch = new HeliaFetch()
    await this.heliaFetch.ready
    // eslint-disable-next-line no-console
    console.log('Helia Started!')
    this.routes = [
      {
        path: '/ipfs/*',
        type: 'get',
        handler: async (request, response): Promise<void> => this.fetchIpfs({ request, response })
      }, {
        path: '/ipns/*',
        type: 'get',
        handler: async (request, response): Promise<void> => this.fetchIpns({ request, response })
      }, {
        path: '/api/v0/repo/gc',
        type: 'get',
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
    const referrerPath = new URL(request.headers.referer ?? '').pathname
    if (referrerPath !== undefined) {
      response.redirect(`${referrerPath}${request.path}`.replace(/\/\//g, '/'))
    }
  }

  /**
   * Fetches from helia and writes the chunks to the response.
   */
  private async fetchFromHeliaAndWriteToResponse ({
    response,
    routePath
  }: IRouteHandler & {
    routePath: string
  }): Promise<void> {
    await this.isReady
    let type: string | undefined
    for await (const chunk of await this.heliaFetch.fetch(routePath)) {
      if (type === undefined) {
        const { relativePath: path } = this.heliaFetch.parsePath(routePath)
        type = await parseContentType({ bytes: chunk, path })
        // this needs to happen first.
        response.setHeader('Content-Type', type ?? DEFAULT_MIME_TYPE)
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      }
      response.write(Buffer.from(chunk))
    }
    response.end()
  }

  /**
   * Fetches a path from IPFS
   */
  private async fetchIpfs ({
    request,
    response
  }: IRouteHandler): Promise<void> {
    try {
      await this.fetchFromHeliaAndWriteToResponse({ response, request, routePath: request.path })
    } catch (error) {
      console.debug(error)
      response.status(500).end()
    }
  }

  /**
   * Fetches a path from IPNS, which basically queries delegated routing API and then fetches the path from IPFS.
   */
  async fetchIpns ({ request, response }: IRouteHandler): Promise<void> {
    try {
      await this.isReady

      const {
        relativePath,
        address: domain
      } = this.heliaFetch.parsePath(request.path)

      if (request.headers.referer !== undefined) {
        const refererPath = new URL(request.headers.referer).pathname
        if (!request.originalUrl.startsWith(refererPath)) {
          const { namespace } = this.heliaFetch.parsePath(refererPath)
          if (namespace === 'ipns') {
            const finalUrl = `${request.headers.referer}/${domain}/${relativePath}`.replace(/([^:]\/)\/+/g, '$1')
            response.redirect(finalUrl); return
          }
        }
      }

      await this.fetchFromHeliaAndWriteToResponse({ response, request, routePath: request.path })
    } catch (error) {
      console.debug(error)
      response.status(500).end()
    }
  }

  /**
   * GC the node
   */
  async gc ({ response }: IRouteHandler): Promise<void> {
    await this.isReady
    await this.heliaFetch.node?.gc()
    response.status(200).end()
  }
}

const heliaServer = new HeliaServer()
export default heliaServer
