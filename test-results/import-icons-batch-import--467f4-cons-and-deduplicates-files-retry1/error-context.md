# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: import-icons.spec.mjs >> batch import persists image icons and deduplicates files
- Location: tests/import-icons.spec.mjs:89:1

# Error details

```
Error: Incorrect username or password

expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 1003
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test'
  2   | import http from 'node:http'
  3   | import crypto from 'node:crypto'
  4   | import fs from 'node:fs/promises'
  5   | import os from 'node:os'
  6   | 
  7   | const extensionPath = process.env.YIN_PANEL_EXTENSION || '/home/hsy/project/yin-panel-extension'
  8   | const username = process.env.YIN_PANEL_TEST_USER || 'admin@yiniot.com'
  9   | const password = process.env.YIN_PANEL_TEST_PASSWORD || 'admin@yiniot.com'
  10  | const spaceId = process.env.YIN_PANEL_TEST_SPACE_ID || '1'
  11  | const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  12  | 
  13  | function startIconFixture() {
  14  |   const server = http.createServer((request, response) => {
  15  |     if (request.url === '/favicon.ico' || request.url === '/fixture.png') {
  16  |       response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length })
  17  |       response.end(png)
  18  |       return
  19  |     }
  20  |     response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  21  |     response.end('<!doctype html><link rel="icon" href="/fixture.png"><title>Icon fixture</title>')
  22  |   })
  23  |   return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)))
  24  | }
  25  | 
  26  | async function login(request) {
  27  |   if (process.env.YIN_PANEL_TEST_TOKEN) return { token: process.env.YIN_PANEL_TEST_TOKEN, id: 1, name: 'e2e' }
  28  |   const response = await request.post('/api/login', { data: { mail: username, password } })
  29  |   expect(response.ok()).toBeTruthy()
  30  |   const body = await response.json()
> 31  |   expect(body.code, body.msg).toBe(0)
      |                               ^ Error: Incorrect username or password
  32  |   return body.data
  33  | }
  34  | 
  35  | async function extensionFetch(playwright, url) {
  36  |   const userDataDir = await fs.mkdtemp(`${os.tmpdir()}/yin-panel-extension-e2e-`)
  37  |   let context
  38  |   try {
  39  |     context = await playwright.chromium.launchPersistentContext(userDataDir, {
  40  |       headless: false,
  41  |       args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--no-proxy-server'],
  42  |     })
  43  |     const page = await context.newPage()
  44  |     const workerDeadline = Date.now() + 10000
  45  |     let extensionWorker
  46  |     while (!extensionWorker && Date.now() < workerDeadline) {
  47  |       extensionWorker = context.serviceWorkers().find(worker => worker.url().startsWith('chrome-extension://'))
  48  |       if (!extensionWorker) await page.waitForTimeout(100)
  49  |     }
  50  |     expect(extensionWorker, 'Chrome extension service worker was not loaded').toBeTruthy()
  51  |     await page.goto('/', { waitUntil: 'domcontentloaded' })
  52  |     return await page.evaluate(async targetURL => {
  53  |       async function request(type, urls = []) {
  54  |         const requestId = `e2e-${Date.now()}-${Math.random()}`
  55  |         return await new Promise(resolve => {
  56  |           const timer = setTimeout(() => { window.removeEventListener('message', listener); resolve(null) }, 15000)
  57  |           function listener(event) {
  58  |             if (event.source !== window || event.data?.source !== 'yin-panel-extension' || event.data.requestId !== requestId) return
  59  |             clearTimeout(timer); window.removeEventListener('message', listener); resolve(event.data)
  60  |           }
  61  |           window.addEventListener('message', listener)
  62  |           window.postMessage({ source: 'yin-panel', type, requestId, urls }, '*')
  63  |         })
  64  |       }
  65  |       const ping = await request('ping')
  66  |       const fetchResult = await request('fetch-icons', [targetURL])
  67  |       return { ping, fetchResult }
  68  |     }, url)
  69  |   } finally {
  70  |     await context?.close()
  71  |     await fs.rm(userDataDir, { recursive: true, force: true })
  72  |   }
  73  | }
  74  | 
  75  | test('extension fetches non-empty icon bytes', async ({ playwright }) => {
  76  |   const fixtureServer = await startIconFixture()
  77  |   const fixturePort = fixtureServer.address().port
  78  |   try {
  79  |     const extensionResult = await extensionFetch(playwright, `http://127.0.0.1:${fixturePort}/page`)
  80  |     expect(extensionResult?.ping?.source).toBe('yin-panel-extension')
  81  |     expect(extensionResult?.ping?.type).toBe('pong')
  82  |     expect(extensionResult?.fetchResult?.source).toBe('yin-panel-extension')
  83  |     expect(extensionResult?.fetchResult?.items).toHaveLength(1)
  84  |     expect(extensionResult?.fetchResult?.items[0].mimeType).toBe('image/png')
  85  |     expect(extensionResult?.fetchResult?.items[0].data?.length || 0).toBeGreaterThan(0)
  86  |   } finally { fixtureServer.close() }
  87  | })
  88  | 
  89  | test('batch import persists image icons and deduplicates files', async ({ request }) => {
  90  |   const fixtureServer = await startIconFixture()
  91  |   const fixturePort = fixtureServer.address().port
  92  |   const user = await login(request)
  93  |   const authHeaders = { Authorization: `Bearer ${user.token}` }
  94  |   const groupTitle = `e2e-icon-${Date.now()}`
  95  |   const fileName = 'fixture.png'
  96  |   const expectedName = `${crypto.createHash('sha256').update(png).digest('hex')}.png`
  97  |   let groupId
  98  |   const itemIds = []
  99  |   let fileId
  100 | 
  101 |   try {
  102 |     const importResponse = await request.post(`/api/spaces/${spaceId}/bookmarks/import-batch`, {
  103 |       headers: authHeaders,
  104 |       multipart: {
  105 |         bookmarks: JSON.stringify({ groups: [{ title: groupTitle, items: [
  106 |           { title: 'Fixture One', url: `http://127.0.0.1:${fixturePort}/one`, uploadKey: fileName },
  107 |           { title: 'Fixture Two', url: `http://127.0.0.1:${fixturePort}/two`, uploadKey: fileName },
  108 |         ] }] }),
  109 |         [fileName]: { name: fileName, mimeType: 'image/png', buffer: png },
  110 |       },
  111 |     })
  112 |     expect(importResponse.ok()).toBeTruthy()
  113 |     const importBody = await importResponse.json()
  114 |     expect(importBody.code, importBody.msg).toBe(0)
  115 |     expect(importBody.data.files[fileName].fileName).toBe(expectedName)
  116 | 
  117 |     const groupsResponse = await request.get(`/api/spaces/${spaceId}/groups`, { headers: authHeaders })
  118 |     const groupsBody = await groupsResponse.json()
  119 |     const group = groupsBody.data.find(item => item.title === groupTitle)
  120 |     expect(group, 'imported group was not created').toBeTruthy()
  121 |     groupId = group.id
  122 | 
  123 |     const itemsResponse = await request.get(`/api/spaces/${spaceId}/items?groupId=${group.id}&page=1&pageSize=100`, { headers: authHeaders })
  124 |     const itemsBody = await itemsResponse.json()
  125 |     expect(itemsBody.data).toHaveLength(2)
  126 |     for (const item of itemsBody.data) {
  127 |       itemIds.push(item.id)
  128 |       expect(item.icon.itemType).toBe(2)
  129 |       expect(item.icon.fileName).toBe(expectedName)
  130 |       expect(item.icon.src).toContain(`/uploads/${expectedName}`)
  131 |       const iconResponse = await request.get(item.icon.src, { headers: authHeaders })
```