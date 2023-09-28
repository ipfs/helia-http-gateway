import { DEFAULT_MIME_TYPE, parseContentType } from './contentType.js';
import { HeliaFetch } from './heliaFetch.js';
import { Request, Response } from 'express';

export interface routeEntry {
    path: string
    type: 'get' | 'post'
    handler: (request: Request, response: Response) => Promise<void>
}

class HeliaFetcher {
    private heliaFetch: HeliaFetch
    public routes: routeEntry[]
    private decoder: TextDecoder
    public isReady: Promise<void>

    constructor () {
        this.isReady = this.init()
        this.routes = []
        this.decoder = new TextDecoder()
    }

    async init (): Promise<void> {
        this.heliaFetch = new HeliaFetch()
        await this.heliaFetch.ready
        console.log('Helia Started!')
        this.routes = [
            {
                path: '/ipfs/*',
                type: 'get',
                handler: this.callRunner.bind(this)
            }, {
                path: '/*',
                type: 'get',
                handler: this.redirectRelative.bind(this)
            // }, {
            //     path: '/ipns/:path',
            //     type: 'get',
            //     handler: this.fetchIpns.bind(this)
            }, {
                path: '/api/v0/repo/gc',
                type: 'get',
                handler: this.gc.bind(this)
            }
        ]
    }

    private async redirectRelative (request: Request, response: Response): Promise<void> {
        const referrerPath = new URL(request.headers.referer ?? '').pathname
        response.redirect(`${referrerPath}${request.path}`.replace(/\/\//g, '/'))
    }

    private async callRunner (request: Request, response: Response): Promise<void> {
        await this.isReady
        try {
            let type = undefined
            for await (const chunk of await this.heliaFetch.fetch(request.path)) {
                if (!type) {
                    const { relativePath: path } = this.heliaFetch.parsePath(request.path)
                    type = await parseContentType({ bytes: chunk, path }) as string
                    // this needs to happen first.
                    response.setHeader('Content-Type', type ?? DEFAULT_MIME_TYPE)
                }
                response.write(Buffer.from(chunk))
            }
            response.end()
        } catch (error) {
            console.debug(error)
            response.status(500).end()
        }
    }

    // async fetchIpns (request: Express.Request, response: Express.Response): Promise<Express.Response> {
    //     return this.callRunner(request, response, async (): Promise<void> => {
    //         for await (const chunk of this.fs.cat(request.params.path)) {
    //             response.write(chunk)
    //         }
    //     })
    // }

    async gc (request: Request, response: Response): Promise<void> {
        await this.isReady
        await this.heliaFetch.node?.gc()
        response.status(200).end()
    }
}

const heliaFetcher = new HeliaFetcher()
export default heliaFetcher
