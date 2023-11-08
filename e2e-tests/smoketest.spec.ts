import { test, expect } from '@playwright/test'
import { PORT } from '../src/constants.js'

// test all the same pages listed at https://probelab.io/websites/
const pages = [
  'blog.ipfs.tech',
  'blog.libp2p.io',
  'consensuslab.world',
  'docs.ipfs.tech',
  'docs.libp2p.io',
  'drand.love',
  'fil.org',
  'filecoin.io',
  'green.filecoin.io',
  'ipfs.tech',
  'ipld.io',
  'libp2p.io',
  'n0.computer',
  'probelab.io',
  'protocol.ai',
  'research.protocol.ai',
  'singularity.storage',
  'specs.ipfs.tech',
  // 'strn.network' // redirects to saturn.tech
  'saturn.tech',
  'web3.storage'
]

// increase default test timeout to 2 minutes
test.setTimeout(120000)

// now for each page, make sure we can request the website, the content is not empty, and status code is 200
pages.forEach((pagePath) => {
  // test.skip(`helia-http-gateway matches ipfs.io for path '${pagePath}'`, async ({ page }) => {
  //   // const ipfsIoResponse = await page.goto(`http://ipfs.io${pagePath}`)
  //   const websiteDomain = pagePath.split('/')[2]
  //   const websiteResponse = await page.goto(`https://${websiteDomain}`)
  //   expect(websiteResponse?.status()).toBe(200)
  //   const ipfsIoContent = await websiteResponse?.text()
  //   // TODO: enable screenshot testing? maybe not needed if we're confirming text content matches.
  //   // await page.screenshot({ path: `screenshots${pagePath}.png`, fullPage: true });
  //   const heliaGatewayResponse = await page.goto(`http://localhost:${PORT}${pagePath}`)
  //   expect(heliaGatewayResponse?.status()).toBe(200)
  //   // expect(page).toHaveScreenshot(`screenshots${pagePath}.png`, { fullPage: true, maxDiffPixelRatio: 0 });

  //   // expect the response text content to be the same
  //   const heliaGatewayContent = await heliaGatewayResponse?.text()
  //   expect(heliaGatewayContent).toEqual(ipfsIoContent)
  // })

  test.beforeEach(async ({ context }) => {
    // Block any asset requests for tests in this file.
    await context.route(/.(css|js|svg|png|jpg|woff2|otf|webp)$/, async route => route.abort())
  })

  test(`helia-http-gateway can load path 'http://${pagePath}.ipns.localhost:${PORT}'`, async ({ page }) => {
    const heliaGatewayResponse = await page.goto(`http://${pagePath}.ipns.localhost:${PORT}`, { waitUntil: 'commit' })
    expect(heliaGatewayResponse?.status()).toBe(200)
    expect(await heliaGatewayResponse?.text()).not.toEqual('')
    const headers = heliaGatewayResponse?.headers()
    expect(headers).not.toBeNull()
    expect(headers?.['content-type']).toContain('text/html')

    const result = await page.request.post(`http://localhost:${PORT}/api/v0/repo/gc`)
    expect(result?.status()).toBe(200)

    const maybeContent = await result?.text()
    expect(maybeContent).toEqual('OK')
  })
})
