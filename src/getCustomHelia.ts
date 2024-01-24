import { bitswap, trustlessGateway } from '@helia/block-brokers'
import { createHeliaHTTP } from '@helia/http'
import { LevelBlockstore } from 'blockstore-level'
import { LevelDatastore } from 'datastore-level'
import { createHelia } from 'helia'
import { FILE_BLOCKSTORE_PATH, FILE_DATASTORE_PATH, TRUSTLESS_GATEWAYS, USE_BITSWAP, USE_LIBP2P, USE_TRUSTLESS_GATEWAYS } from './constants.js'
// import { getCustomLibp2p } from './getCustomLibp2p.js'
import type { Helia } from '@helia/interface'
// import type { Libp2p, ServiceMap } from '@libp2p/interface'

export async function getCustomHelia (): Promise<Helia> {
  const blockBrokers: Array<ReturnType<typeof trustlessGateway | typeof bitswap>> = []
  if (USE_BITSWAP) {
    blockBrokers.push(bitswap())
  }

  if (USE_TRUSTLESS_GATEWAYS) {
    let gateway = trustlessGateway()
    if (TRUSTLESS_GATEWAYS != null) {
      gateway = trustlessGateway({ gateways: TRUSTLESS_GATEWAYS })
    }
    blockBrokers.push(gateway)
  }

  let blockstore: LevelBlockstore | undefined
  if (FILE_BLOCKSTORE_PATH != null) {
    blockstore = new LevelBlockstore(FILE_BLOCKSTORE_PATH)
  }

  let datastore: LevelDatastore | undefined
  if (FILE_DATASTORE_PATH != null) {
    datastore = new LevelDatastore(FILE_DATASTORE_PATH)
  }

  if (USE_LIBP2P || USE_BITSWAP) {
    // config.libp2p = await getCustomLibp2p({ datastore: config.datastore })
    return createHelia({
      blockstore,
      datastore,
      blockBrokers
    }) as unknown as Promise<Helia>
  }

  return createHeliaHTTP({
    blockstore,
    datastore,
    blockBrokers
  }) as unknown as Promise<Helia>
}
