import { type UnixFS, unixfs } from '@helia/unixfs'
import { MemoryBlockstore } from 'blockstore-core'
import { MemoryDatastore } from 'datastore-core'
import { type Helia, createHelia } from 'helia'
import { LRUCache } from 'lru-cache'
import { CID } from 'multiformats/cid'
import pTryEach from 'p-try-each'

const ROOT_FILE_PATTERNS = [
  'index.html',
  'index.htm',
  'index.shtml'
]

const DELEGATED_ROUTING_API = 'https://node3.delegate.ipfs.io/api/v0/name/resolve/'

/**
 * Fetches files from IPFS or IPNS
 */
export class HeliaFetch {
  private readonly delegatedRoutingApi: string
  private fs!: UnixFS
  private readonly rootFilePatterns: string[]
  public node!: Helia
  public ready: Promise<void>
  private readonly ipnsResolutionCache = new LRUCache<string, string>({
    max: 10000,
    ttl: 1000 * 60 * 60 * 24
  })

  constructor (
    node?: Helia,
    rootFilePatterns: string[] = ROOT_FILE_PATTERNS,
    delegatedRoutingApi: string = DELEGATED_ROUTING_API
  ) {
    if (node !== undefined) {
      this.node = node
    }
    this.rootFilePatterns = rootFilePatterns
    this.delegatedRoutingApi = delegatedRoutingApi
    this.ready = this.init()
  }

  /**
   * Initialize the HeliaFetch instance
   */
  async init (): Promise<void> {
    this.node = this.node ?? await createHelia({
      blockstore: new MemoryBlockstore(),
      datastore: new MemoryDatastore()
    })
    this.fs = unixfs(this.node)
  }

  /**
   * Parse a path into its namespace, address, and relative path
   */
  public parsePath (path: string): { namespace: string, address: string, relativePath: string } {
    if (path === undefined) {
      throw new Error('Path is empty')
    }
    const regex = /^\/(?<namespace>ip[fn]s)\/(?<address>[^/$]+)(?<relativePath>[^$]*)/
    const result = path.match(regex)
    if (result == null) {
      throw new Error('Path is not valid, provide path as /ipfs/<cid> or /ipns/<path>')
    }
    return result.groups as { namespace: string, address: string, relativePath: string }
  }

  /**
   * fetch a path from IPFS or IPNS
   */
  public async fetch (path: string): Promise<AsyncIterable<Uint8Array>> {
    try {
      await this.ready
      const { namespace, address, relativePath } = this.parsePath(path)
      switch (namespace) {
        case 'ipfs':
          return await this.fetchIpfs(CID.parse(address), { path: relativePath })
        case 'ipns':
          return await this.fetchIpns(address, { path: relativePath })
        default:
          throw new Error('Namespace is not valid, provide path as /ipfs/<cid> or /ipns/<path>')
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error)
      throw error
    }
  }

  /**
   * Fetch from IPFS
   */
  private async fetchIpfs (...[cid, options]: Parameters<UnixFS['cat']>): Promise<AsyncIterable<Uint8Array>> {
    const { type } = await this.fs.stat(cid)
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
   */
  private async fetchIpns (address: string, options?: Parameters<UnixFS['cat']>[1]): Promise<AsyncIterable<Uint8Array>> {
    if (!this.ipnsResolutionCache.has(address)) {
      const { Path } = await (await fetch(this.delegatedRoutingApi + address)).json()
      this.ipnsResolutionCache.set(address, Path)
    }
    return this.fetch(`${this.ipnsResolutionCache.get(address)}${options?.path ?? ''}`)
  }

  /**
   * Get the response for a file.
   */
  private async getFileResponse (...[cid, options]: Parameters<UnixFS['cat']>): Promise<AsyncIterable<Uint8Array>> {
    return this.fs.cat(cid, options)
  }

  /**
   * Gets the response for a directory.
   */
  private async getDirectoryResponse (...[cid, options]: Parameters<UnixFS['cat']>): Promise<AsyncIterable<Uint8Array>> {
    const rootFile = await pTryEach(this.rootFilePatterns.map(file => {
      const directoryPath = options?.path ?? ''
      return async (): Promise<{ name: string, cid: CID }> => {
        const path = `${directoryPath}/${file}`.replace(/\/\//g, '/')
        const stats = await this.fs.stat(cid, { path })

        return {
          name: file,
          cid: stats.cid
        }
      }
    }))

    // no options needed, because we already have the CID for the rootFile
    return this.getFileResponse(rootFile.cid)
  }
}
