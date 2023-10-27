import { LevelBlockstore } from 'blockstore-level'
import { LevelDatastore } from 'datastore-level'
import { createHelia, type Helia, type HeliaInit } from 'helia'
import { bitswap, trustlessGateway } from 'helia/block-brokers'
import { USE_LIBP2P, FILE_BLOCKSTORE_PATH, FILE_DATASTORE_PATH, TRUSTLESS_GATEWAYS, USE_BITSWAP, USE_TRUSTLESS_GATEWAYS } from './constants.js'
import type { Libp2p } from '@libp2p/interface'
import type { PubSub } from '@libp2p/interface/pubsub'

export async function getCustomHelia (): Promise<Helia<Libp2p<{ pubsub: PubSub }>>> {
  const config: Partial<HeliaInit<Libp2p<any>>> = {
    blockBrokers: []
  }

  if (USE_BITSWAP) {
    config.blockBrokers?.push(bitswap())
  }

  if (USE_TRUSTLESS_GATEWAYS) {
    let gateway = trustlessGateway()
    if (TRUSTLESS_GATEWAYS != null) {
      gateway = trustlessGateway({ gateways: TRUSTLESS_GATEWAYS })
    }
    config.blockBrokers?.push(gateway)
  }

  /**
   * TODO: Unblock support for custom blockstores and datastores, currently not working with docker due to volume mounting requirements.
   */
  if (FILE_BLOCKSTORE_PATH != null) {
    config.blockstore = new LevelBlockstore(FILE_BLOCKSTORE_PATH)
  }

  if (FILE_DATASTORE_PATH != null) {
    config.datastore = new LevelDatastore(FILE_DATASTORE_PATH)
  }

  if (!USE_LIBP2P) {
    config.libp2p = {
      start: false
    }
  }

  return createHelia(config)
}
