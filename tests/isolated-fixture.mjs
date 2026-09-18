import { test as base } from '@playwright/test'
import { startIsolatedService, stopIsolatedService } from './isolated-service.mjs'

export const test = base.extend({
  isolated: [async ({}, use, workerInfo) => {
    const service = await startIsolatedService()
    if (!service) {
      await use(null)
      return
    }
    try { await use(service) } finally { await stopIsolatedService(service) }
  }, { scope: 'worker' }],
})
export { expect } from '@playwright/test'
