import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { createDelegatedRoutingV1HttpApiClient } from '@helia/delegated-routing-v1-http-api-client'
import { bootstrap } from '@libp2p/bootstrap'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { identify, type Identify } from '@libp2p/identify'
import { type KadDHT, kadDHT, removePrivateAddressesMapper } from '@libp2p/kad-dht'
import { mplex } from '@libp2p/mplex'
import { prometheusMetrics } from '@libp2p/prometheus-metrics'
import { tcp } from '@libp2p/tcp'
import { tls } from '@libp2p/tls'
import { webRTC, webRTCDirect } from '@libp2p/webrtc'
import { webSockets } from '@libp2p/websockets'
import { ipnsSelector } from 'ipns/selector'
import { ipnsValidator } from 'ipns/validator'
import { createLibp2p as create, type Libp2pOptions, type ServiceFactoryMap } from 'libp2p'
import isPrivate from 'private-ip'
import { DELEGATED_ROUTING_V1_HOST, METRICS, USE_DELEGATED_ROUTING, USE_DHT_ROUTING } from './constants.js'
import type { Libp2p, ServiceMap } from '@libp2p/interface'
import type { Multiaddr } from '@multiformats/multiaddr'
import type { HeliaInit } from 'helia'

interface HeliaGatewayLibp2pServices extends ServiceMap {
  dht?: KadDHT
  delegatedRouting?: unknown
  identify: Identify
}

interface HeliaGatewayLibp2pOptions extends Partial<Pick<HeliaInit, 'datastore'>> {

}

const IP4 = 4
const IP6 = 41

export async function getCustomLibp2p ({ datastore }: HeliaGatewayLibp2pOptions): Promise<Libp2p<HeliaGatewayLibp2pServices>> {
  const libp2pServices: ServiceFactoryMap<HeliaGatewayLibp2pServices> = {
    identify: identify()
  }

  if (USE_DELEGATED_ROUTING) {
    libp2pServices.delegatedRouting = () => createDelegatedRoutingV1HttpApiClient(DELEGATED_ROUTING_V1_HOST)
  }

  if (USE_DHT_ROUTING) {
    libp2pServices.dht = kadDHT({
      protocol: '/ipfs/kad/1.0.0',
      peerInfoMapper: removePrivateAddressesMapper,
      // don't do DHT server work.
      clientMode: true,
      validators: {
        ipns: ipnsValidator
      },
      selectors: {
        ipns: ipnsSelector
      }
    })
  }

  const options: Libp2pOptions<HeliaGatewayLibp2pServices> = {
    datastore,
    addresses: {
      listen: [
        // helia-http-gateway is not dialable, we're only retrieving data from IPFS network, and then providing that data via a web2 http interface.
      ]
    },
    transports: [
      circuitRelayTransport(),
      tcp(),
      webRTC(),
      webRTCDirect(),
      webSockets()
    ],
    connectionEncrypters: [
      noise(),
      tls()
    ],
    streamMuxers: [
      yamux(),
      mplex()
    ],
    peerDiscovery: [
      bootstrap({
        list: [
          '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
          '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
          '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
          '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt',
          '/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ'
        ]
      })
    ],
    services: libp2pServices,
    connectionGater: {
      denyDialMultiaddr: async (multiaddr: Multiaddr) => {
        const [[proto, address]] = multiaddr.stringTuples()

        // deny private ip4/ip6 addresses
        if (proto === IP4 || proto === IP6) {
          return Boolean(isPrivate(`${address}`))
        }

        // all other addresses are ok
        return false
      }
    }
  }

  if (METRICS === 'true') {
    options.metrics = prometheusMetrics({
      // this is done by fastify-metrics
      collectDefaultMetrics: false,
      // do not remove metrics configured by fastify-metrics
      preserveExistingMetrics: true
    })
  }

  return create(options)
}
