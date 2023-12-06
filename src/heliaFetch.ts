import { ipns, type IPNS } from '@helia/ipns'
import { dnsJsonOverHttps, dnsOverHttps } from '@helia/ipns/dns-resolvers'
import { dht, pubsub, type IPNSRouting } from '@helia/ipns/routing'
import { unixfs } from '@helia/unixfs'
import { peerIdFromString } from '@libp2p/peer-id'
import debug from 'debug'
import { CID } from 'multiformats/cid'
import { getCustomHelia } from './getCustomHelia.js'
import type { UnixFS, UnixFSStats } from '@helia/unixfs'
import type { PeerId } from '@libp2p/interface'

const ROOT_FILE_PATTERNS = [
  'index.html',
  'index.htm',
  'index.shtml'
]

interface HeliaPathParts {
  address: string
  namespace: string
  relativePath: string
}

export interface HeliaFetchOptions extends HeliaPathParts {
  signal?: AbortSignal
  cid?: CID | null
  peerId?: PeerId | null
}

/**
 * Fetches files from IPFS or IPNS
 */
export class HeliaFetch {
  private fs!: UnixFS
  private readonly log: debug.Debugger
  private readonly PARSE_PATH_REGEX = /^\/(?<namespace>ip[fn]s)\/(?<address>[^/$]+)(?<relativePath>[^$^?]*)/
  private readonly rootFilePatterns: string[]
  public node!: Awaited<ReturnType<typeof getCustomHelia>>
  public ready: Promise<void>
  private ipns!: IPNS

  constructor ({
    node,
    rootFilePatterns = ROOT_FILE_PATTERNS,
    logger
  }: {
    node?: Awaited<ReturnType<typeof getCustomHelia>>
    rootFilePatterns?: string[]
    logger?: debug.Debugger
  } = {}) {
    // setup a logger
    if (logger !== undefined) {
      this.log = logger.extend('helia-fetch')
    } else {
      this.log = debug('helia-fetch')
    }
    // a node can be provided otherwise a new one will be created.
    if (node !== undefined) {
      this.node = node
    }
    this.rootFilePatterns = rootFilePatterns
    this.ready = this.init().then(() => { this.log('Initialized') })
  }

  /**
   * Initialize the HeliaFetch instance
   */
  async init (): Promise<void> {
    this.node = this.node ?? await getCustomHelia()

    this.fs = unixfs(this.node)
    const routers: IPNSRouting[] = []
    if (this.node.libp2p.contentRouting != null) {
      // @ts-expect-error - types are borked
      routers.push(dht(this.node))
    }
    if (this.node.libp2p.services.pubsub != null) {
      // @ts-expect-error - types are borked
      routers.push(pubsub(this.node))
    }
    this.ipns = ipns(this.node, {
      routers,
      resolvers: [
        dnsJsonOverHttps('https://mozilla.cloudflare-dns.com/dns-query'),
        dnsOverHttps('https://mozilla.cloudflare-dns.com/dns-query'),
        dnsOverHttps('https://cloudflare-dns.com/dns-query'),
        dnsOverHttps('https://dns.google/dns-query'),
        dnsOverHttps('https://dns.google/resolve'),
        dnsOverHttps('dns.quad9.net/dns-query')
      ]
    })
    this.log('Helia Setup Complete!')
  }

  /**
   * Parse a path into its namespace, address, and relative path
   */
  public parsePath (path: string): HeliaPathParts {
    if (path === undefined) {
      throw new Error('Path is empty')
    }
    this.log(`Parsing path: ${path}`)
    const result = path.match(this.PARSE_PATH_REGEX)
    if (result == null || result?.groups == null) {
      this.log(`Error parsing path: ${path}:`, result)
      throw new Error(`Path: ${path} is not valid, provide path as /ipfs/<cid> or /ipns/<path>`)
    }
    this.log('Parsed path:', result?.groups)
    return result.groups as unknown as HeliaPathParts
  }

  /**
   * Remove duplicate slashes and trailing slashes from a path.
   */
  public sanitizeUrlPath (path: string): string {
    return path.replace(/([^:]\/)\/+/g, '$1').replace(/\/$/, '')
  }

  /**
   * fetch a path from a given namespace and address.
   */
  public async fetch ({ namespace, address, relativePath, signal, cid, peerId }: HeliaFetchOptions): Promise<AsyncIterable<Uint8Array>> {
    try {
      await this.ready
      this.log('Processing Fetch:', { namespace, address, relativePath })
      switch (namespace) {
        case 'ipfs':
          return await this.fetchIpfs(cid ?? CID.parse(address), { path: relativePath, signal })
        case 'ipns':
          return await this.fetchIpns(address, { path: relativePath, signal, peerId })
        default:
          throw new Error('Namespace is not valid, provide path as /ipfs/<cid> or /ipns/<path>')
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      this.log(`Error fetching: ${namespace}/${address}${relativePath}`, error)
      throw error
    }
  }

  /**
   * fetch a path as string from IPFS or IPNS
   */
  public async fetchPath (path: string): Promise<AsyncIterable<Uint8Array>> {
    try {
      this.log('Fetching:', path)
      const { namespace, address, relativePath } = this.parsePath(path)
      return await this.fetch({ namespace, address, relativePath })
    } catch (error) {
      // eslint-disable-next-line no-console
      this.log(`Error fetching: ${path}`, error)
      throw error
    }
  }

  /**
   * Fetch from IPFS
   */
  private async fetchIpfs (...[cid, options]: Parameters<UnixFS['cat']>): Promise<AsyncIterable<Uint8Array>> {
    const { type } = await this.fs.stat(cid, options)
    this.log('Fetching from IPFS:', { cid, type, options })
    switch (type) {
      case 'directory':
        return this.getDirectoryResponse(cid, options)
      case 'raw':
      case 'file':
        return this.getFileResponse(cid, options)
      default:
        throw new Error(`Unsupported fsStatInfo.type: ${type}`)
    }
  }

  /**
   * Fetch IPNS content.
   *
   * @todo - Support delegated IPNS resolution from Kubo when testing gateway-conformance
   * @todo - Support ipns for peerIds: http://localhost:8090/ipns/12D3KooWLQzUv2FHWGVPXTXSZpdHs7oHbXub2G5WC8Tx4NQhyd2d
   */
  private async fetchIpns (address: string, { path = '', signal = undefined, peerId }: { path?: string, signal?: AbortSignal, peerId?: PeerId | null }): Promise<AsyncIterable<Uint8Array>> {
    this.log('Fetching from IPNS:', address, path)

    let resolvedCid = null
    if (typeof address === 'string' && peerId == null) {
      try {
        this.log('Attempting to parse peerId from address:', address)
        peerId = peerIdFromString(address)
        this.log('peerId: ', peerId)
      } catch {
        // ignoring
      }
    }

    if (peerId != null) {
      resolvedCid = await this.ipns.resolve(peerId, { signal })
    } else if (peerId == null && typeof address === 'string') {
      resolvedCid = await this.ipns.resolveDns(address, { signal })
    } else {
      throw new Error(`Not sure how to handle address input: ${address.toString()}`)
    }

    this.log('Final IPNS path:', `/ipfs/${resolvedCid.toString()}/${path}`)
    return this.fetch({ namespace: 'ipfs', address: resolvedCid.toString(), relativePath: path, signal })
  }

  /**
   * Get the response for a file.
   */
  private async getFileResponse (...[cid, options]: Parameters<UnixFS['cat']>): Promise<AsyncIterable<Uint8Array>> {
    this.log('Getting file response:', { cid, options })
    return this.fs.cat(cid, options)
  }

  /**
   * Gets the response for a directory.
   */
  private async getDirectoryResponse (...[cid, options]: Parameters<UnixFS['cat']>): Promise<AsyncIterable<Uint8Array>> {
    this.log('Getting directory response:', { cid, options })
    let indexFile: UnixFSStats | null = null

    for (const path of this.rootFilePatterns) {
      try {
        indexFile = await this.fs.stat(cid, {
          ...options,
          path
        })

        break
      } catch (err: any) {
        this.log('error loading path %c/%s', cid, path, err)
      }
    }

    if (indexFile == null) {
      throw new Error('No root file found')
    }

    return this.getFileResponse(indexFile.cid, { ...options })
  }

  /**
   * shut down the node
   */
  async stop (): Promise<void> {
    await this.node.stop()
  }
}
