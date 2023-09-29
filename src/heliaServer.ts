import { Request, Response } from 'express';
import { DEFAULT_MIME_TYPE, parseContentType } from './contentType.js';
import { HeliaFetch } from './heliaFetch.js';

export interface IRouteEntry {
    path: string
    type: 'get' | 'post'
    handler: (request: Request, response: Response) => Promise<void>
}

interface IRouteHandler {
    request: Request,
    response: Response
}

const delegatedRoutingAPI = (ipns: string): string => `https://node3.delegate.ipfs.io/api/v0/name/resolve/${ipns}?r=false`

class HeliaServer {
    private heliaFetch: HeliaFetch
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
        console.log('Helia Started!')
        this.routes = [
            {
                path: '/ipfs/*',
                type: 'get',
                handler: (request, response): Promise<void> => this.fetchIpfs({request, response})
            }, {
                path: '/ipns/*',
                type: 'get',
                handler: (request, response): Promise<void> => this.fetchIpns({request, response})
            }, {
                path: '/api/v0/repo/gc',
                type: 'get',
                handler: (request, response): Promise<void> => this.gc({request, response})
            }, {
                path: '/*',
                type: 'get',
                handler: (request, response): Promise<void> => this.redirectRelative({request, response})
            }
        ]
    }

    /**
     * Handles redirecting to the relative path
     *
     * @param request
     * @param response
     */
    private async redirectRelative ({ request, response }: IRouteHandler): Promise<void> {
        const referrerPath = new URL(request.headers.referer ?? '').pathname
        if (referrerPath) {
            response.redirect(`${referrerPath}${request.path}`.replace(/\/\//g, '/'))
        }
    }


    /**
     * Fetches from helia and writes the chunks to the response.
     * 
     * @param param0
     */
    private async fetchFromHeliaAndWriteToResponse ({
        response,
        routePath
    }: IRouteHandler & {
        routePath: string
    }): Promise<void> {
        await this.isReady
        let type: string | undefined = undefined
        for await (const chunk of await this.heliaFetch.fetch(routePath)) {
            if (!type) {
                const { relativePath: path } = this.heliaFetch.parsePath(routePath)
                type = await parseContentType({ bytes: chunk, path }) as string
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
     *
     * @param request
     * @param response
     * @param overridePath is used for IPNS routing where override is needed.
     */
    private async fetchIpfs ({
        request,
        response
    }: IRouteHandler): Promise<void> {
        try {
            this.fetchFromHeliaAndWriteToResponse({response, request, routePath: request.path})
        } catch (error) {
            console.debug(error)
            response.status(500).end()
        }
    }

    /**
     * Fetches a path from IPNS, which basically queries delegated routing API and then fetches the path from IPFS.
     *
     * @param request
     * @param response
     * @returns
     */
    async fetchIpns ({ request, response }: IRouteHandler): Promise<void> {
        try {
            await this.isReady

            const {
                relativePath,
                address: domain
            } = this.heliaFetch.parsePath(request.path)

            if (request.headers.referer) {
                const refererPath = new URL(request.headers.referer).pathname
                if (!request.originalUrl.startsWith(refererPath)) {
                    const { namespace } = this.heliaFetch.parsePath(refererPath)
                    if (namespace === 'ipns') {
                        const finalUrl = `${request.headers.referer}/${domain}/${relativePath}`.replace(/([^:]\/)\/+/g, "$1")
                        return response.redirect(finalUrl)
                    }
                }
            }

            await this.fetchFromHeliaAndWriteToResponse({response, request, routePath: request.path})
        } catch (error) {
            console.debug(error)
            response.status(500).end()
        }
    }

    /**
     * GC the node
     *
     * @param request
     * @param response
     */
    async gc ({ response }: IRouteHandler): Promise<void> {
        await this.isReady
        await this.heliaFetch.node?.gc()
        response.status(200).end()
    }
}

const heliaServer = new HeliaServer()
export default heliaServer
