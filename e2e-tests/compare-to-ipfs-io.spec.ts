import { test, expect } from '@playwright/test'
import { PORT } from '../src/constants.js'

// test all the same pages listed at https://probelab.io/websites/
const pages = [
  // '/ipns/blog.ipfs.tech', // currently timing out for Helia.
  '/ipns/blog.libp2p.io',
  '/ipns/consensuslab.world',
  '/ipns/docs.ipfs.tech',
  '/ipns/docs.libp2p.io',
  '/ipns/drand.love',
  // '/ipns/fil.org', // currently timing out for Helia.
  // '/ipns/filecoin.io', // currently timing out for Helia.
  '/ipns/green.filecoin.io',
  // '/ipns/ipfs.tech', // currently timing out for Helia.
  '/ipns/ipld.io',
  '/ipns/libp2p.io',
  // '/ipns/n0.computer', // currently timing out for Helia.
  '/ipns/probelab.io',
  '/ipns/protocol.ai', // very slow, but can pass.
  '/ipns/research.protocol.ai', // slow-ish, but can pass.
  '/ipns/singularity.storage',
  '/ipns/specs.ipfs.tech',
  '/ipns/strn.network'
  // '/ipns/web3.storage' // currently timing out for Helia
]

// increase default test timeout to 2 minutes
test.setTimeout(120000)

// now for each page, make sure we can request the website, the content is not empty, and status code is 200
pages.forEach((pagePath) => {
  // afterEach, we should request /api/v0/repo/gc to clear the cache
  test(`helia-http-gateway matches ipfs.io for path '${pagePath}'`, async ({ page }) => {
    const ipfsIoResponse = await page.goto(`http://ipfs.io${pagePath}`)
    expect(ipfsIoResponse?.status()).toBe(200)
    const ipfsIoContent = await ipfsIoResponse?.text()
    // TODO: enable screenshot testing? maybe not needed if we're confirming text content matches.
    // await page.screenshot({ path: `screenshots${pagePath}.png`, fullPage: true });
    const heliaGatewayResponse = await page.goto(`http://localhost:${PORT}${pagePath}`)
    expect(heliaGatewayResponse?.status()).toBe(200)
    // expect(page).toHaveScreenshot(`screenshots${pagePath}.png`, { fullPage: true, maxDiffPixelRatio: 0 });

    // expect the response text content to be the same
    const heliaGatewayContent = await heliaGatewayResponse?.text()
    expect(heliaGatewayContent).toEqual(ipfsIoContent)
  })
})
