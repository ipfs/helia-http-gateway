import { test, expect } from '@playwright/test'
import { HTTP_PORT } from '../src/constants.js'

// test all the same pages listed at https://probelab.io/websites/
const pages = [
  'blog.ipfs.tech',
  'blog.libp2p.io',
  'consensuslab.world',
  'docs.ipfs.tech',
  'docs.libp2p.io',
  // 'drand.love', // no dnsaddr or dnslink TXT record, only "x-ipfs-path" header (supported only by ipfs-companion and brave)
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
  // 'singularity.storage', // broken as of 09-07-2024
  'specs.ipfs.tech',
  // 'strn.network', // redirects to saturn.tech
  'saturn.tech',
  'web3.storage'
]

// increase default test timeout to 2 minutes
test.setTimeout(120000)

// now for each page, make sure we can request the website, the content is not empty, and status code is 200
test.beforeEach(async ({ context }) => {
  // Block any asset requests for tests in this file.
  await context.route(/.(css|js|svg|png|jpg|woff2|otf|webp|ttf|json)(?:\?.*)?$/, async route => route.abort())
})

pages.forEach((pagePath) => {
  const url = `http://${pagePath}.ipns.localhost:${HTTP_PORT}`
  test(`helia-http-gateway can load path '${url}'`, async ({ page }) => {
    // only wait for 'commit' because we don't want to wait for all the assets to load, we just want to make sure that they *would* load (e.g. the html is valid)
    const heliaGatewayResponse = await page.goto(`${url}`, { waitUntil: 'commit' })
    expect(heliaGatewayResponse?.status()).toBe(200)
    // await page.waitForSelector('body')
    expect(await heliaGatewayResponse?.text()).not.toEqual('')
    const headers = heliaGatewayResponse?.headers()
    expect(headers).not.toBeNull()
    expect(headers?.['content-type']).toContain('text/')
  })
})
