import { Request, Response } from 'express';
import { LRUCache } from 'lru-cache';
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

class HeliaFetcher {
    private heliaFetch: HeliaFetch
    public routes: IRouteEntry[]
    public isReady: Promise<void>
    private ipnsResolutionCache: LRUCache<string, string> = new LRUCache({
        max: 10000,
        ttl: 1000 * 60 * 60 * 24
    })

    constructor () {
        this.isReady = this.init()
        this.routes = []
    }

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
     * Fetches a path from IPFS
     *
     * @param request
     * @param response
     * @param overridePath is used for IPNS routing where override is needed.
     */
    private async fetchIpfs ({
        request,
        response,
        overridePath
    }: IRouteHandler & {
        overridePath?: string
    }): Promise<void> {
        try {
            await this.isReady
            let type = undefined
            const routePath = overridePath ?? request.path
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

            if (!this.ipnsResolutionCache.has(domain)) {
                const { Path } = await (await fetch(delegatedRoutingAPI(domain))).json()
                this.ipnsResolutionCache.set(domain, Path)
            }
            await this.fetchIpfs({
                request,
                response,
                overridePath: `${this.ipnsResolutionCache.get(domain)}${relativePath}`
            })
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

const heliaFetcher = new HeliaFetcher()
export default heliaFetcher
