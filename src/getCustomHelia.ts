import { bitswap, trustlessGateway } from '@helia/block-brokers'
import { createHeliaHTTP } from '@helia/http'
import { delegatedHTTPRouting } from '@helia/routers'
import { type HeliaInit } from '@helia/utils'
import { LevelBlockstore } from 'blockstore-level'
import { LevelDatastore } from 'datastore-level'
import { createHelia } from 'helia'
import { DELEGATED_ROUTING_V1_HOST, FILE_BLOCKSTORE_PATH, FILE_DATASTORE_PATH, TRUSTLESS_GATEWAYS, USE_BITSWAP, USE_DELEGATED_ROUTING, USE_LIBP2P, USE_TRUSTLESS_GATEWAYS } from './constants.js'
import { getCustomLibp2p } from './getCustomLibp2p.js'
import type { Helia } from '@helia/interface'

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

  let blockstore: HeliaInit['blockstore'] | undefined
  if (FILE_BLOCKSTORE_PATH != null) {
    blockstore = new LevelBlockstore(FILE_BLOCKSTORE_PATH)
  }

  let datastore: HeliaInit['datastore'] | undefined
  if (FILE_DATASTORE_PATH != null) {
    datastore = new LevelDatastore(FILE_DATASTORE_PATH)
  }

  if (USE_LIBP2P || USE_BITSWAP) {
    return createHelia({
      libp2p: await getCustomLibp2p({ datastore }),
      blockstore,
      datastore,
      blockBrokers
    })
  }

  const routers: HeliaInit['routers'] = []
  if (USE_DELEGATED_ROUTING) {
    routers.push(delegatedHTTPRouting(DELEGATED_ROUTING_V1_HOST))
  }

  return createHeliaHTTP({
    blockstore,
    datastore,
    blockBrokers,
    routers
  })
}
