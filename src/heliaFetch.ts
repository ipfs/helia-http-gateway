import { unixfs, type UnixFS } from '@helia/unixfs'
import { MemoryBlockstore } from 'blockstore-core'
import { MemoryDatastore } from 'datastore-core'
import debug from 'debug'
import { createHelia, type Helia } from 'helia'
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
  private fs!: UnixFS
  private readonly delegatedRoutingApi: string
  private readonly log: debug.Debugger
  private readonly rootFilePatterns: string[]
  public node!: Helia
  public ready: Promise<void>
  private readonly ipnsResolutionCache = new LRUCache<string, string>({
    max: 10000,
    ttl: 1000 * 60 * 60 * 24
  })

  constructor ({
    node,
    rootFilePatterns = ROOT_FILE_PATTERNS,
    delegatedRoutingApi = DELEGATED_ROUTING_API,
    logger
  }: {
    node?: Helia
    rootFilePatterns?: string[]
    delegatedRoutingApi?: string
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
    this.delegatedRoutingApi = delegatedRoutingApi
    this.ready = this.init()
    this.log('Initialized')
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
    this.log('Helia Setup Complete!')
  }

  /**
   * Parse a path into its namespace, address, and relative path
   */
  public parsePath (path: string): { namespace: string, address: string, relativePath: string } {
    if (path === undefined) {
      throw new Error('Path is empty')
    }
    this.log(`Parsing path: ${path}`)
    const regex = /^\/(?<namespace>ip[fn]s)\/(?<address>[^/$]+)(?<relativePath>[^$]*)/
    const result = path.match(regex)
    if (result == null || result?.groups == null) {
      this.log(`Error parsing path: ${path}:`, result)
      throw new Error(`Path: ${path} is not valid, provide path as /ipfs/<cid> or /ipns/<path>`)
    }
    this.log('Parsed path:', result?.groups)
    return result.groups as { namespace: string, address: string, relativePath: string }
  }

  /**
   * Remove duplicate slashes and trailing slashes from a path.
   */
  public sanitizeUrlPath (path: string): string {
    return path.replace(/([^:]\/)\/+/g, '$1').replace(/\/$/, '')
  }

  /**
   * fetch a path from IPFS or IPNS
   */
  public async fetch (path: string): Promise<AsyncIterable<Uint8Array>> {
    try {
      await this.ready
      this.log('Fetching:', path)
      const { namespace, address, relativePath } = this.parsePath(path)
      this.log('Processing Fetch:', { namespace, address, relativePath })
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
   */
  private async fetchIpns (address: string, options?: Parameters<UnixFS['cat']>[1]): Promise<AsyncIterable<Uint8Array>> {
    if (!this.ipnsResolutionCache.has(address)) {
      this.log('Fetching from Delegate Routing:', address)
      const { Path } = await (await fetch(this.delegatedRoutingApi + address)).json()
      this.ipnsResolutionCache.set(address, Path ?? 'not-found')
    }
    if (this.ipnsResolutionCache.get(address) === 'not-found') {
      this.log('No Path found:', address)
      throw new Error(`Could not resolve IPNS address: ${address}`)
    }
    const finalPath = `${this.ipnsResolutionCache.get(address)}${options?.path ?? ''}`
    this.log('Final IPFS path:', finalPath)
    return this.fetch(finalPath)
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
    const rootFile = await pTryEach(this.rootFilePatterns.map(file => {
      const directoryPath = options?.path ?? ''
      return async (): Promise<{ name: string, cid: CID }> => {
        try {
          const path = this.sanitizeUrlPath(`${directoryPath}/${file}`)
          this.log('Trying to get root file:', { file, directoryPath })
          const stats = await this.fs.stat(cid, { path })
          this.log('Got root file:', { file, directoryPath, stats })
          return {
            name: file,
            cid: stats.cid
          }
        } catch (error) {
          return Promise.reject(error)
        }
      }
    }))

    // no options needed, because we already have the CID for the rootFile
    return this.getFileResponse(rootFile.cid)
  }

  /**
   * shut down the node
   */
  async stop (): Promise<void> {
    await this.node.stop()
  }
}
