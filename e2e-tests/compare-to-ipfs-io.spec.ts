import { test, expect } from '@playwright/test'
import { PORT } from '../src/constants.js'

test.setTimeout(120000)

// test all the same pages listed at https://probelab.io/websites/
const pages = [
  '/ipns/blog.ipfs.tech',
  '/ipns/blog.libp2p.io',
  '/ipns/consensuslab.world',
  '/ipns/docs.ipfs.tech',
  '/ipns/docs.libp2p.io',
  '/ipns/drand.love',
  '/ipns/fil.org',
  '/ipns/filecoin.io',
  '/ipns/green.filecoin.io',
  '/ipns/ipfs.tech',
  '/ipns/ipld.io',
  '/ipns/libp2p.io',
  '/ipns/n0.computer',
  '/ipns/probelab.io',
  '/ipns/protocol.ai',
  '/ipns/research.protocol.ai',
  '/ipns/singularity.storage',
  '/ipns/specs.ipfs.tech',
  '/ipns/strn.network',
  '/ipns/web3.storage'
]

// don't bombard helia-gateway with parallel requests. it's not ready for that yet
test.describe.configure({ mode: 'serial' })

// now for each page, make sure we can request the website, the content is not empty, and status code is 200
pages.forEach((pagePath) => {
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
