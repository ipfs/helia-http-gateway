import { LevelBlockstore } from 'blockstore-level'
import { LevelDatastore } from 'datastore-level'
import { createHelia, type Helia, type HeliaInit } from 'helia'
import { bitswap, trustlessGateway } from 'helia/block-brokers'
import { FILE_BLOCKSTORE_PATH, FILE_DATASTORE_PATH, TRUSTLESS_GATEWAYS, USE_BITSWAP, USE_TRUSTLESS_GATEWAYS } from './constants.js'
import { getCustomLibp2p } from './getCustomLibp2p.js'
import type { Libp2p } from '@libp2p/interface'

export async function getCustomHelia (): Promise<Helia> {
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

  config.libp2p = await getCustomLibp2p({ datastore: config.datastore })

  return createHelia(config)
}
