import { HeliaFetch } from './heliaFetch.js';
export interface routeEntry {
    path: string
    type: 'get' | 'post'
    handler: (request: Express.Request, response: Express.Response) => Promise<Express.Response>
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
            // }, {
            //     path: '/api/v0/repo/gc',
            //     type: 'get',
            //     handler: this.gc.bind(this)
            }
        ]
    }

    private async redirectRelative (request: Express.Request, response: Express.Response): Promise<Express.Response> {
        const referrerPath = new URL(request.headers.referer).pathname
        return response.redirect(`${referrerPath}${request.path}`.replace(/\/\//g, '/'))
    }

    private async callRunner (request: Express.Request, response: Express.Response): Promise<Express.Response> {
        await this.isReady
        try {
            response.setHeader('Content-Type', 'text/html')
            for await (const chunk of await this.heliaFetch.fetch(request.path)) {
                response.write(this.decoder.decode(chunk))
            }
            return response.end()
        } catch (error) {
            console.debug(error)
            return response.status(500).end()
        }
    }

    // async fetch (request: Express.Request, response: Express.Response): Promise<Express.Response> {
    //     console.log(request.params.cid)
    //     return this.callRunner(request, response, async (): Promise<void> => {
    //         const { type } = await this.fs.stat(CID.parse(request.params.cid))
    //         console.log(type)
    //         for (await const chunk of this.heliaFetch.fetch())
    //     })
    // }

    // async fetchIpns (request: Express.Request, response: Express.Response): Promise<Express.Response> {
    //     return this.callRunner(request, response, async (): Promise<void> => {
    //         for await (const chunk of this.fs.cat(request.params.path)) {
    //             response.write(chunk)
    //         }
    //     })
    // }

    // async gc (request: Express.Request, response: Express.Response): Promise<Express.Response> {
    //     return this.callRunner(request, response, async (): Promise<void> => this.node.gc())
    // }
}

const heliaFetcher = new HeliaFetcher()
export default heliaFetcher
