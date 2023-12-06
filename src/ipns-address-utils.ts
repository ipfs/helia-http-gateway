import { peerIdFromString } from '@libp2p/peer-id'
import { CID } from 'multiformats/cid'
import type { PeerId } from '@libp2p/interface'

const HAS_UPPERCASE_REGEX = /[A-Z]/

interface IpnsAddressDetails {
  peerId: PeerId | null
  cid: CID | null
}

/**
 * This method should be called with the key/address value of an IPNS route.
 *
 * It will return return an object with some useful properties about the address
 *
 * @example
 *
 * http://<key>.ipns.<host>/*
 * http://<host>/ipns/<key>/*
 */
export function getIpnsAddressDetails (address: string): IpnsAddressDetails {
  let cid: CID | null = null
  let peerId: PeerId | null = null
  if (HAS_UPPERCASE_REGEX.test(address)) {
    try {
      // could be CIDv0 or PeerId at this point.
      cid = CID.parse(address).toV1()
    } catch {
      // ignore
    }

    try {
      peerId = peerIdFromString(address)
    } catch {
      // ignore error
    }
  }

  return {
    peerId,
    cid
  }
}
