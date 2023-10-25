import { test, expect } from '@playwright/test'
import { PORT } from '../src/constants.js'

test('POST /api/v0/repo/gc', async ({ page }) => {
  const result = await page.request.post(`http://localhost:${PORT}/api/v0/repo/gc`)
  expect(result?.status()).toBe(200)

  const maybeContent = await result?.text()
  expect(maybeContent).toEqual('OK')
})
