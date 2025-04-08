import { S3 } from '@aws-sdk/client-s3'
import { bitswap, trustlessGateway } from '@helia/block-brokers'
import { createHeliaHTTP } from '@helia/http'
import { delegatedHTTPRouting, httpGatewayRouting } from '@helia/routers'
import { FsBlockstore } from 'blockstore-fs'
import { S3Blockstore } from 'blockstore-s3'
import { LevelDatastore } from 'datastore-level'
import { S3Datastore } from 'datastore-s3'
import { createHelia } from 'helia'
import {
  AWS_REGION,
  DELEGATED_ROUTING_V1_HOST,
  FILE_BLOCKSTORE_PATH,
  FILE_DATASTORE_PATH,
  S3_ACCESS_KEY_ID,
  S3_BUCKET,
  S3_ENDPOINT,
  S3_SECRET_ACCESS_KEY,
  TRUSTLESS_GATEWAYS,
  USE_BITSWAP,
  USE_DELEGATED_ROUTING,
  USE_LIBP2P,
  USE_TRUSTLESS_GATEWAYS
} from './constants.js'
import { getCustomLibp2p } from './get-custom-libp2p.js'
import type { Helia } from '@helia/interface'
import type { HeliaInit } from 'helia'
import type { Datastore, Key } from 'interface-datastore'

export async function getCustomHelia (): Promise<Helia> {
  const datastore = await configureDatastore()

  if (USE_LIBP2P || USE_BITSWAP) {
    return createHelia({
      libp2p: await getCustomLibp2p({ datastore }),
      blockstore: await configureBlockstore(),
      datastore,
      blockBrokers: configureBlockBrokers(),
      routers: configureRouters()
    })
  }

  return createHeliaHTTP({
    blockstore: await configureBlockstore(),
    datastore,
    blockBrokers: configureBlockBrokers(),
    routers: configureRouters()
  })
}

const exists = (value: string | undefined): boolean => value != null && value !== undefined && value !== ''

const useS3 = exists(S3_BUCKET) && exists(S3_ACCESS_KEY_ID) && exists(S3_SECRET_ACCESS_KEY)

const s3 = new S3({
  endpoint: S3_ENDPOINT,
  region: AWS_REGION,
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY
  }
})

async function configureBlockstore (): Promise<HeliaInit['blockstore'] | undefined> {
  if (FILE_BLOCKSTORE_PATH != null && FILE_BLOCKSTORE_PATH !== '') {
    const fs = new FsBlockstore(FILE_BLOCKSTORE_PATH)
    await fs.open()
    return fs
  }
  if (useS3 && S3_BUCKET != null && S3_BUCKET !== '') {
    const s3Blockstore = new S3Blockstore(s3, S3_BUCKET)
    return s3Blockstore
  }
}

async function configureDatastore (): Promise<HeliaInit['datastore'] | undefined> {
  if (FILE_DATASTORE_PATH != null && FILE_DATASTORE_PATH !== '') {
    const db = new LevelDatastore(FILE_DATASTORE_PATH)
    await db.open()

    return db
  }
  if (useS3 && S3_BUCKET != null && S3_BUCKET !== '') {
    const datastore = new S3Datastore(s3, S3_BUCKET, {
      path: '.ipfs/datastore'
    }) as unknown as Datastore<Key, Uint8Array>
    return datastore
  }
}

function configureBlockBrokers (): HeliaInit['blockBrokers'] {
  const blockBrokers: HeliaInit['blockBrokers'] = []

  if (USE_BITSWAP) {
    blockBrokers.push(bitswap())
  }

  if (USE_TRUSTLESS_GATEWAYS) {
    blockBrokers.push(trustlessGateway())
  }

  return blockBrokers
}

function configureRouters (): HeliaInit['routers'] {
  const routers: HeliaInit['routers'] = []

  if (TRUSTLESS_GATEWAYS != null) {
    routers.push(httpGatewayRouting({
      gateways: TRUSTLESS_GATEWAYS
    }))
  }

  if (USE_DELEGATED_ROUTING) {
    routers.push(delegatedHTTPRouting(DELEGATED_ROUTING_V1_HOST))
  }

  return routers
}
