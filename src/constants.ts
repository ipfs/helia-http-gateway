/**
 * Where we listen for gateway requests
 */
export const HTTP_PORT = Number(process.env.HTTP_PORT ?? 8080)

/**
 * Where we listen for RPC API requests
 */
export const RPC_PORT = Number(process.env.RPC_PORT ?? 5001)

export const HOST = process.env.HOST ?? '0.0.0.0'

export const DEBUG = process.env.DEBUG ?? ''
export const FASTIFY_DEBUG = process.env.FASTIFY_DEBUG ?? ''

export const USE_SUBDOMAINS = process.env.USE_SUBDOMAINS !== 'false'

export const USE_SESSIONS = process.env.USE_SESSIONS !== 'false'

export const ECHO_HEADERS = process.env.ECHO_HEADERS === 'true'

/**
 * If set to any value other than 'true', we will disable prometheus metrics.
 *
 * @default 'true'
 */
export const METRICS = process.env.METRICS ?? 'true'

/**
 * If not set, we will enable bitswap by default.
 */
export const USE_BITSWAP = process.env.USE_BITSWAP !== 'false'

/**
 * If not set, we will use the default gateways that come from https://github.com/ipfs/helia/blob/43932a54036dafdf1265b034b30b12784fd22d82/packages/helia/src/block-brokers/trustless-gateway/index.ts
 */
export const TRUSTLESS_GATEWAYS = process.env.TRUSTLESS_GATEWAYS?.split(',') ?? undefined

/**
 * If not set, we will use trustless gateways by default.
 */
export const USE_TRUSTLESS_GATEWAYS = process.env.USE_TRUSTLESS_GATEWAYS !== 'false'

/**
 * If not set, we will enable libp2p by default.
 */
export const USE_LIBP2P = process.env.USE_LIBP2P !== 'false'

/**
 * If not set, we will use a memory datastore by default.
 */
export const FILE_DATASTORE_PATH = process.env.FILE_DATASTORE_PATH ?? undefined

/**
 * If not set, we will use a memory blockstore by default.
 */
export const FILE_BLOCKSTORE_PATH = process.env.FILE_BLOCKSTORE_PATH ?? undefined

/**
 * Whether to use the delegated routing v1 API. Defaults to true.
 */
export const USE_DELEGATED_ROUTING = process.env.USE_DELEGATED_ROUTING !== 'false'

/**
 * Whether to use the DHT for routing
 *
 * @default true
 */
export const USE_DHT_ROUTING = process.env.USE_DHT_ROUTING !== 'false'

/**
 * If not set, we will default delegated routing to `https://delegated-ipfs.dev`
 */
export const DELEGATED_ROUTING_V1_HOST = process.env.DELEGATED_ROUTING_V1_HOST ?? 'https://delegated-ipfs.dev'

/**
 * How long to wait for GC to complete
 */
export const GC_TIMEOUT_MS = 20000

/**
 * How long to wait for the healthcheck retrieval of an identity CID to complete
 */
export const HEALTHCHECK_TIMEOUT_MS = 1000
