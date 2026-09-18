import { test, expect } from '@playwright/test'
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const envFile = process.env.YIN_PANEL_ENV_FILE || path.resolve('.env.local')
try { process.loadEnvFile(envFile) } catch (error) {
  if (error.code !== 'ENOENT') throw error
}

const extensionPath = process.env.YIN_PANEL_EXTENSION_DIR
const username = process.env.YIN_PANEL_TEST_USER
const password = process.env.YIN_PANEL_TEST_PASSWORD
const spaceId = process.env.YIN_PANEL_TEST_SPACE_ID || '1'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

function startIconFixture() {
  const server = http.createServer((request, response) => {
    if (request.url === '/favicon.ico' || request.url === '/fixture.png') {
      response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length })
      response.end(png)
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end('<!doctype html><link rel="icon" href="/fixture.png"><title>Icon fixture</title>')
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)))
}

async function login(request) {
  if (process.env.YIN_PANEL_TEST_TOKEN) return { token: process.env.YIN_PANEL_TEST_TOKEN, id: 1, name: 'e2e' }
  if (!username || !password) throw new Error('Set YIN_PANEL_TEST_USER and YIN_PANEL_TEST_PASSWORD, or YIN_PANEL_TEST_TOKEN')
  const response = await request.post('/api/login', { data: { mail: username, password } })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  expect(body.code, body.msg).toBe(0)
  return body.data
}

async function extensionFetch(playwright, url) {
  const userDataDir = await fs.mkdtemp(`${os.tmpdir()}/yin-panel-extension-e2e-`)
  let context
  try {
    context = await playwright.chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--no-proxy-server'],
    })
    const page = await context.newPage()
    const workerDeadline = Date.now() + 10000
    let extensionWorker
    while (!extensionWorker && Date.now() < workerDeadline) {
      extensionWorker = context.serviceWorkers().find(worker => worker.url().startsWith('chrome-extension://'))
      if (!extensionWorker) await page.waitForTimeout(100)
    }
    expect(extensionWorker, 'Chrome extension service worker was not loaded').toBeTruthy()
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    return await page.evaluate(async targetURL => {
      async function request(type, urls = []) {
        const requestId = `e2e-${Date.now()}-${Math.random()}`
        return await new Promise(resolve => {
          const timer = setTimeout(() => { window.removeEventListener('message', listener); resolve(null) }, 15000)
          function listener(event) {
            if (event.source !== window || event.data?.source !== 'yin-panel-extension' || event.data.requestId !== requestId) return
            clearTimeout(timer); window.removeEventListener('message', listener); resolve(event.data)
          }
          window.addEventListener('message', listener)
          window.postMessage({ source: 'yin-panel', type, requestId, urls }, '*')
        })
      }
      const ping = await request('ping')
      const fetchResult = await request('fetch-icons', [targetURL])
      return { ping, fetchResult }
    }, url)
  } finally {
    await context?.close()
    await fs.rm(userDataDir, { recursive: true, force: true })
  }
}

test('extension fetches non-empty icon bytes', async ({ playwright }) => {
  expect(extensionPath, 'Set YIN_PANEL_EXTENSION_DIR').toBeTruthy()
  const fixtureServer = await startIconFixture()
  const fixturePort = fixtureServer.address().port
  try {
    const extensionResult = await extensionFetch(playwright, `http://127.0.0.1:${fixturePort}/page`)
    expect(extensionResult?.ping?.source).toBe('yin-panel-extension')
    expect(extensionResult?.ping?.type).toBe('pong')
    expect(extensionResult?.fetchResult?.source).toBe('yin-panel-extension')
    expect(extensionResult?.fetchResult?.items).toHaveLength(1)
    expect(extensionResult?.fetchResult?.items[0].mimeType).toBe('image/png')
    expect(extensionResult?.fetchResult?.items[0].data?.length || 0).toBeGreaterThan(0)
  } finally { fixtureServer.close() }
})

test('batch import persists image icons and deduplicates files', async ({ request }) => {
  const fixtureServer = await startIconFixture()
  const fixturePort = fixtureServer.address().port
  const user = await login(request)
  const authHeaders = { Authorization: `Bearer ${user.token}` }
  const groupTitle = `e2e-icon-${Date.now()}`
  const fileName = 'fixture.png'
  const expectedName = `${crypto.createHash('sha256').update(png).digest('hex')}.png`
  let groupId
  const itemIds = []
  let fileId

  try {
    const importResponse = await request.post(`/api/spaces/${spaceId}/bookmarks/import-batch`, {
      headers: authHeaders,
      multipart: {
        bookmarks: JSON.stringify({ groups: [{ title: groupTitle, items: [
          { title: 'Fixture One', url: `http://127.0.0.1:${fixturePort}/one`, uploadKey: fileName },
          { title: 'Fixture Two', url: `http://127.0.0.1:${fixturePort}/two`, uploadKey: fileName },
        ] }] }),
        [fileName]: { name: fileName, mimeType: 'image/png', buffer: png },
      },
    })
    expect(importResponse.ok()).toBeTruthy()
    const importBody = await importResponse.json()
    expect(importBody.code, importBody.msg).toBe(0)
    expect(importBody.data.files[fileName].fileName).toBe(expectedName)

    const groupsResponse = await request.get(`/api/spaces/${spaceId}/groups`, { headers: authHeaders })
    const groupsBody = await groupsResponse.json()
    const group = groupsBody.data.find(item => item.title === groupTitle)
    expect(group, 'imported group was not created').toBeTruthy()
    groupId = group.id

    const itemsResponse = await request.get(`/api/spaces/${spaceId}/items?groupId=${group.id}&page=1&pageSize=100`, { headers: authHeaders })
    const itemsBody = await itemsResponse.json()
    expect(itemsBody.data).toHaveLength(2)
    for (const item of itemsBody.data) {
      itemIds.push(item.id)
      expect(item.icon.itemType).toBe(2)
      expect(item.icon.fileName).toBe(expectedName)
      expect(item.icon.src).toContain(`/uploads/${expectedName}`)
      const iconResponse = await request.get(item.icon.src, { headers: authHeaders })
      expect(iconResponse.ok(), `icon request failed: ${item.icon.src}`).toBeTruthy()
      expect((await iconResponse.body()).length).toBeGreaterThan(0)
    }

    const filesResponse = await request.get('/api/file/getList', { headers: authHeaders })
    const filesBody = await filesResponse.json()
    const matchingFiles = filesBody.data.list.filter(item => item.fileName === expectedName)
    expect(matchingFiles).toHaveLength(1)
    fileId = matchingFiles[0].id
  } finally {
    for (const itemId of itemIds) await request.delete(`/api/spaces/${spaceId}/items/${itemId}`, { headers: authHeaders }).catch(() => {})
    if (groupId) await request.delete(`/api/spaces/${spaceId}/groups/${groupId}`, { headers: authHeaders }).catch(() => {})
    if (fileId) await request.post('/api/file/delete', { headers: authHeaders, data: { id: fileId } }).catch(() => {})
    await new Promise(resolve => fixtureServer.close(resolve))
  }
})
