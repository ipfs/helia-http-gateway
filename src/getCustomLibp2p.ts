import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { createDelegatedRoutingV1HttpApiClient } from '@helia/delegated-routing-v1-http-api-client'
import { autoNAT as autoNATService } from '@libp2p/autonat'
import { bootstrap } from '@libp2p/bootstrap'
import { circuitRelayTransport, circuitRelayServer, type CircuitRelayService } from '@libp2p/circuit-relay-v2'
import { dcutr as dcutrService } from '@libp2p/dcutr'
import { identify as identifyService, type Identify } from '@libp2p/identify'
import { type DualKadDHT, kadDHT } from '@libp2p/kad-dht'
// import { mdns } from '@libp2p/mdns'
import { mplex } from '@libp2p/mplex'
import { ping as pingService, type PingService } from '@libp2p/ping'
import { tcp } from '@libp2p/tcp'
import { uPnPNAT as uPnPNATService } from '@libp2p/upnp-nat'
// import { webRTC, webRTCDirect } from '@libp2p/webrtc'
import { webSockets } from '@libp2p/websockets'
import { ipnsSelector } from 'ipns/selector'
import { ipnsValidator } from 'ipns/validator'
import { createLibp2p as create, type Libp2pOptions } from 'libp2p'
import { USE_LIBP2P } from './constants.js'
import type { Libp2p, PubSub } from '@libp2p/interface'
import type { HeliaInit } from 'helia'
// import { peerDiscovery, PeerDiscovery } from '@libp2p/peer-discovery'

interface HeliaGatewayLibp2pServices extends Record<string, unknown> {
  dht: DualKadDHT
  delegatedRouting: unknown
  pubsub: PubSub
  relay: CircuitRelayService
  identify: Identify
  autoNAT: unknown
  upnp: unknown
  dcutr: unknown
  ping: PingService
}

interface HeliaGatewayLibp2pOptions extends Pick<HeliaInit, 'datastore'> {

}

export async function getCustomLibp2p ({ datastore }: HeliaGatewayLibp2pOptions): Promise<Libp2p<HeliaGatewayLibp2pServices>> {
  let options: Libp2pOptions<HeliaGatewayLibp2pServices> = {
    datastore,
    addresses: {
      listen: [
        // helia-http-gateway is not dialable, we're only retrieving data from IPFS network, and then providing that data via a web2 http interface.
        // '/ip4/0.0.0.0/tcp/0',
        // '/ip6/::/tcp/0',
        // '/webrtc'
      ]
    },
    connectionManager: {
      /**
       * disable auto-dial because we don't want to be doing a lot of work to keep connections alive.
       */
      minConnections: 0
    },
    transports: [
      circuitRelayTransport({
        discoverRelays: 1
      }),
      tcp(),
      /**
       * Temporarily disabling webrtc while waiting on release of:
       * * https://github.com/libp2p/js-libp2p/pull/2299
       * * https://github.com/libp2p/js-libp2p/pull/2302
       *
       * @see https://github.com/libp2p/js-libp2p/pull/2301
       */
      // webRTC(),
      // webRTCDirect(),
      webSockets()
    ],
    connectionEncryption: [
      noise()
    ],
    streamMuxers: [
      yamux(),
      mplex()
    ],
    peerDiscovery: [
      // (components): PeerDiscovery => ({
      //   get [peerDiscovery] () {
      //     components.services.
      //   }
      // }),
      // mdns(), // disable mdns while optimizing for performance.
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
    services: {
      identify: identifyService(),
      autoNAT: autoNATService(),
      upnp: uPnPNATService(),
      pubsub: gossipsub(),
      dcutr: dcutrService(),
      delegatedRouting: () => createDelegatedRoutingV1HttpApiClient('https://delegated-ipfs.dev'),
      dht: kadDHT({
        // don't do DHT server work.
        clientMode: true,
        validators: {
          ipns: ipnsValidator
        },
        selectors: {
          ipns: ipnsSelector
        }
      }),
      relay: circuitRelayServer({
        // don't advertise as a circuitRelay server because we have one job, and that is to:  listen for http requests, maybe fetch content, return http responses.
        // advertise: true
      }),
      ping: pingService()
    }
  }

  if (!USE_LIBP2P) {
    // we should not be running libp2p things
    options = {
      ...options,
      start: false,
      addresses: {
        listen: []
      }
    }
  }

  return create(options)
}
