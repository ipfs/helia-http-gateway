import { unixfs, type UnixFS } from '@helia/unixfs'
import { MemoryBlockstore } from 'blockstore-core'
import { MemoryDatastore } from 'datastore-core'
import debug from 'debug'
import DOHResolver from 'dns-over-http-resolver'
import { createHelia, type Helia } from 'helia'
import { LRUCache } from 'lru-cache'
import { CID } from 'multiformats/cid'
import type { UnixFSEntry } from 'ipfs-unixfs-exporter'

const ROOT_FILE_PATTERNS = [
  'index.html',
  'index.htm',
  'index.shtml'
]

interface HeliaPathParts {
  namespace: string
  address: string
  relativePath: string
}

interface HeliaFetchConfig {
  resolveRedirects: boolean
}

/**
 * Fetches files from IPFS or IPNS
 */
export class HeliaFetch {
  private readonly dohResolver = new DOHResolver()
  private fs!: UnixFS
  private readonly log: debug.Debugger
  private readonly PARSE_PATH_REGEX = /^\/(?<namespace>ip[fn]s)\/(?<address>[^/$]+)(?<relativePath>[^$^?]*)/
  private readonly rootFilePatterns: string[]
  public node!: Helia
  public ready: Promise<void>
  private readonly config: HeliaFetchConfig
  private readonly ipnsResolutionCache = new LRUCache<string, string>({
    max: 10000,
    ttl: 1000 * 60 * 60 * 24
  })

  constructor ({
    node,
    rootFilePatterns = ROOT_FILE_PATTERNS,
    logger,
    config = {}
  }: {
    node?: Helia
    rootFilePatterns?: string[]
    logger?: debug.Debugger
    config?: Partial<HeliaFetchConfig>
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
    this.config = {
      resolveRedirects: true,
      ...config
    }
    this.rootFilePatterns = rootFilePatterns
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
    // @ts-expect-error - helia@next does not seem to work with helia-unixfs
    this.fs = unixfs(this.node)
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
  public async fetch ({ namespace, address, relativePath }: HeliaPathParts): Promise<AsyncIterable<Uint8Array>> {
    try {
      await this.ready
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
   * Checks if a redirect is needed and returns either the original address or the redirect address.
   */
  private async checkForRedirect (address: string, options?: Parameters<UnixFS['cat']>[1]): Promise<string> {
    if (!this.config.resolveRedirects) {
      return address
    }
    try {
      this.log('Checking for redirect of:', address)
      const redirectCheckResponse = await fetch(`http://${address}`, { method: 'HEAD', redirect: 'manual', ...options })
      if ([301, 302, 307, 308].includes(redirectCheckResponse.status)) {
        this.log('Redirect statuscode :', redirectCheckResponse.status)
        const redirectText = redirectCheckResponse.headers.get('location')
        if (redirectText == null) {
          this.log('No location header')
          return address
        } else {
          const redirectUrl = new URL(redirectText)
          this.log('Redirect found:', redirectUrl.host)
          return redirectUrl.host
        }
      }
    } catch {
      // ignore errors on redirect checks
      this.log('Error checking for redirect for url')
    }
    return address
  }

  /**
   * Fetch IPNS content.
   */
  private async fetchIpns (address: string, options?: Parameters<UnixFS['cat']>[1]): Promise<AsyncIterable<Uint8Array>> {
    if (!this.ipnsResolutionCache.has(address)) {
      this.log('Fetching from DNS over HTTP:', address)
      const redirectAddress = await this.checkForRedirect(address)
      const txtRecords = await this.dohResolver.resolveTxt(`_dnslink.${redirectAddress}`)
      const pathEntry = txtRecords.find(([record]) => record.startsWith('dnslink='))
      const path = pathEntry?.[0].replace('dnslink=', '')
      this.log('Got Path from DNS over HTTP:', path)
      this.ipnsResolutionCache.set(address, path ?? 'not-found')
      if (redirectAddress !== address) {
        this.ipnsResolutionCache.set(redirectAddress, path ?? 'not-found')
      }
      // we don't do anything with this, but want to fail if it is not a valid path
      this.parsePath(path ?? '')
    }
    if (this.ipnsResolutionCache.get(address) === 'not-found') {
      this.log('No Path found:', address)
      throw new Error(`Could not resolve IPNS address: ${address}`)
    }
    const finalPath = `${this.ipnsResolutionCache.get(address)}${options?.path ?? ''}`
    this.log('Final IPFS path:', finalPath)
    return this.fetchPath(finalPath)
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
    let rootFile: UnixFSEntry | null = null
    for await (const file of this.fs.ls(cid, { signal: options?.signal })) {
      if (file.type === 'file' && this.rootFilePatterns.includes(file.name)) {
        this.log(`Found root file '${file.name}': `, file)
        rootFile = file
        break
      }
    }
    if (rootFile == null) {
      throw new Error('No root file found')
    }

    return this.getFileResponse(rootFile.cid, { ...options })
  }

  /**
   * shut down the node
   */
  async stop (): Promise<void> {
    await this.node.stop()
  }
}
