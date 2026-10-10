#!/usr/bin/env node
// Captures feature screenshots for the Core README from a throwaway instance.
//
// The instance is started by tests/isolated-service.mjs: a temporary SQLite
// database, a random port, and the default admin account, so no real data is
// read or written. Demo spaces, groups, and items are seeded through the public
// API, favicons are fetched by the backend itself, and each scene is captured
// in both light and dark mode through the stored theme preference.
//
// Usage:
//   node scripts/readme-screenshots.mjs
//
// Env:
//   README_SHOTS_DIR    output directory (default: ../Yin-Panel/doc/images)
//   README_SHOTS_MODES  comma-separated modes to capture (default: light,dark)
//   YIN_PANEL_ENV_FILE  env file to load (default: ./.env.local)
//
// Requires YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and
// YIN_PANEL_TEST_LANG_DIR, exactly like the isolated test fixture.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, request } from '@playwright/test'
import { startIsolatedService, stopIsolatedService } from '../tests/isolated-service.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

const envFile = process.env.YIN_PANEL_ENV_FILE || path.resolve(repoRoot, '.env.local')
try { process.loadEnvFile(envFile) } catch (error) { if (error.code !== 'ENOENT') throw error }

for (const name of ['NO_PROXY', 'no_proxy'])
  process.env[name] = [...new Set(`${process.env[name] || ''},localhost,127.0.0.1,::1`.split(',').filter(Boolean))].join(',')

const outDir = process.env.README_SHOTS_DIR || path.resolve(repoRoot, '../Yin-Panel/doc/images')
const modes = (process.env.README_SHOTS_MODES || 'light,dark').split(',').map(value => value.trim()).filter(Boolean)
const viewport = { width: 1440, height: 900 }

const admin = { mail: 'admin@yiniot.com', password: 'admin@yiniot.com' }

const demo = [
  {
    title: 'Apps',
    items: [
      ['GitHub', 'https://github.com', 'github', { id: 'logos:github-icon' }],
      ['Docker Hub', 'https://hub.docker.com', 'docker'],
      ['Grafana', 'https://grafana.com', 'grafana'],
      ['Jellyfin', 'https://jellyfin.org', 'jellyfin'],
      ['Home Assistant', 'https://www.home-assistant.io', 'home-assistant'],
      ['Nextcloud', 'https://nextcloud.com', 'nextcloud'],
    ],
  },
  {
    title: 'Media',
    items: [
      ['YouTube', 'https://www.youtube.com', 'youtube'],
      ['Spotify', 'https://open.spotify.com', 'spotify'],
      ['Plex', 'https://www.plex.tv', 'plex'],
      ['Jellyseerr', 'https://jellyseerr.dev', 'jellyseerr'],
      ['Twitch', 'https://www.twitch.tv', 'twitch'],
    ],
  },
  {
    title: 'Tools',
    items: [
      ['Portainer', 'https://www.portainer.io', 'portainer', { background: '#ffffff' }],
      ['Pi-hole', 'https://pi-hole.net', 'pi-hole'],
      ['Uptime Kuma', 'https://uptime.kuma.pet', 'uptime-kuma'],
      ['Proxy Manager', 'https://nginxproxymanager.com', 'nginx-proxy-manager'],
      ['Proxmox', 'https://www.proxmox.com', 'proxmox'],
    ],
  },
]

async function apiJson(client, method, url, options = {}) {
  const response = await client[method](url, options)
  const body = await response.json().catch(() => ({}))
  if (body.code !== 0)
    throw new Error(`${method.toUpperCase()} ${url} failed: code=${body.code} ${body.msg}`)
  return body.data
}

async function fetchBrandIcon(iconClient, iconifyId) {
  const [prefix, name] = iconifyId.split(':')
  const response = await iconClient.get(`https://api.iconify.design/${prefix}/${name}.svg`)
  if (!response.ok())
    throw new Error(`iconify ${iconifyId}: HTTP ${response.status()}`)
  return Buffer.from(await response.body())
}

async function seedDemoContent(client, headers, iconClient) {
  // A fresh user has no stored config; enable the monitor band and search box
  // so the home page shows its full layout.
  await apiJson(client, 'post', '/api/panel/userConfig/setConfig', {
    headers,
    data: {
      panel: {
        homeLayout: 'standard',
        systemMonitorShow: true,
        systemMonitorShowTitle: true,
        searchBoxShow: true,
      },
    },
  })

  const spaces = await apiJson(client, 'get', '/api/spaces', { headers })
  const space = spaces.find(candidate => candidate.side === 'yin') || spaces[0]
  if (!space)
    throw new Error('isolated instance did not provision a space')

  await apiJson(client, 'post', `/api/spaces/${space.id}`, { headers, data: { name: 'Home Lab' } })

  const groups = await apiJson(client, 'get', `/api/spaces/${space.id}/groups`, { headers })
  let iconFailures = 0
  let itemCount = 0

  for (const [index, group] of demo.entries()) {
    let groupId
    const existing = groups[index]
    if (existing) {
      // Reuse the seeded APP group for the first section and rename it.
      await apiJson(client, 'post', `/api/spaces/${space.id}/groups/${existing.id}/update`, {
        headers,
        data: { title: group.title, icon: existing.icon || '', parentId: null },
      })
      groupId = existing.id
    }
    else {
      const created = await apiJson(client, 'post', `/api/spaces/${space.id}/groups`, {
        headers,
        data: { title: group.title, icon: '' },
      })
      groupId = created.id
    }

    for (const [title, url, slug, options = {}] of group.items) {
      let icon
      try {
        // Upload the brand mark exactly like a user-uploaded icon image.
        const svg = await fetchBrandIcon(iconClient, options.id || `selfhst:${slug}`)
        const uploaded = await apiJson(client, 'post', '/api/file/uploadImg', {
          headers,
          multipart: { imgfile: { name: `${slug}.svg`, mimeType: 'image/svg+xml', buffer: svg } },
        })
        icon = {
          itemType: 2,
          src: uploaded.imageUrl,
          fileName: uploaded.fileName,
          text: '',
          backgroundColor: options.background || '',
        }
      }
      catch (error) {
        iconFailures += 1
        console.log(`  icon fallback for ${title}: ${error.message}`)
        icon = { itemType: 1, text: title.slice(0, 2), backgroundColor: '#385a66' }
      }
      await apiJson(client, 'post', `/api/spaces/${space.id}/items`, {
        headers,
        data: {
          title,
          url,
          lanUrl: '',
          mobileUrl: '',
          description: '',
          openMethod: 2,
          itemIconGroupId: groupId,
          icon,
        },
      })
      itemCount += 1
    }
  }
  return { space, itemCount, iconFailures }
}

async function waitForSettledHome(page) {
  await page.locator('[data-testid="theme-trusted-host"]').waitFor({ state: 'visible', timeout: 30000 })
  await page.locator('#theme-root .yin-group-title').first().waitFor({ state: 'visible', timeout: 30000 })
  await page.evaluate(async () => {
    const images = [...document.images]
    await Promise.all(images.map(image => image.complete
      ? Promise.resolve()
      : new Promise(resolve => { image.onload = resolve; image.onerror = resolve })))
  })
  await page.waitForTimeout(1200)
}

async function openSession(browser, isolated, mode, state, userInfo) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    colorScheme: mode === 'dark' ? 'dark' : 'light',
  })
  await context.addCookies(state.cookies)
  await context.addInitScript(({ userInfo }) => {
    sessionStorage.removeItem('yin-theme-safe-mode')
    localStorage.setItem('authStorage', JSON.stringify({ data: { userInfo, loggedIn: true }, expire: null }))
  }, { userInfo })
  const page = await context.newPage()
  page.on('console', message => {
    if (message.type() === 'error')
      console.log(`  [browser] ${message.text().slice(0, 160)}`)
  })
  return { context, page, url: isolated.url }
}

async function captureScene(page, file) {
  await page.screenshot({
    path: file,
    animations: 'disabled',
    caret: 'hide',
  })
  console.log(`saved ${file}`)
}

async function main() {
  const service = await startIsolatedService()
  if (!service) {
    throw new Error('set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  }
  await fs.mkdir(outDir, { recursive: true })
  const browser = await chromium.launch()
  let api
  let iconClient
  try {
    api = await request.newContext({ baseURL: service.url })
    const proxyServer = process.env.https_proxy || process.env.http_proxy
    iconClient = await request.newContext({
      proxy: proxyServer ? { server: proxyServer } : undefined,
    })
    const login = await api.post('/api/login', { data: admin })
    const loginBody = await login.json()
    if (loginBody.code !== 0)
      throw new Error(`login failed: ${loginBody.msg}`)
    const user = loginBody.data
    const headers = { Authorization: `Bearer ${user.token}` }
    const userInfo = { id: user.userId || user.id, name: user.name, mail: user.mail, role: user.role }
    const state = await api.storageState()

    const seeded = await seedDemoContent(api, headers, iconClient)
    console.log(`seeded ${seeded.itemCount} items in space "${seeded.space.name}" (icon fallbacks: ${seeded.iconFailures})`)

    for (const mode of modes) {
      await apiJson(api, 'post', '/api/theme/v2/preference', {
        headers,
        data: { packageId: 'org.yin.default', mode },
      })
      const { context, page } = await openSession(browser, service, mode, state, userInfo)
      try {
        // Scene 1: the home page with groups, items, monitor band, and search.
        // A taller viewport shows all three groups above the fold.
        await page.setViewportSize({ width: viewport.width, height: 1280 })
        await page.goto(`${service.url}/`, { waitUntil: 'domcontentloaded' })
        await waitForSettledHome(page)
        await captureScene(page, path.join(outDir, `readme-home-${mode}.png`))

        // Scene 2: the item editor opened through the /add command.
        await page.setViewportSize(viewport)
        await page.keyboard.press('/')
        const palette = page.getByTestId('command-center-panel')
        await palette.waitFor({ state: 'visible' })
        await palette.getByText('/add', { exact: true }).click()
        const editor = page.getByTestId('edit-item-modal')
        await editor.waitFor({ state: 'visible' })
        await page.waitForTimeout(600)
        await captureScene(page, path.join(outDir, `readme-editor-${mode}.png`))
        await editor.locator('.n-base-close').last().click().catch(() => {})
        await page.keyboard.press('Escape').catch(() => {})

        // Scene 3: space management (members, public access, bookmark transfer).
        await page.goto(`${service.url}/theme/space-manage`, { waitUntil: 'domcontentloaded' })
        await page.getByRole('button', { name: /create new space/i }).first().waitFor({ state: 'visible', timeout: 30000 })
        await page.waitForTimeout(800)
        await captureScene(page, path.join(outDir, `readme-spaces-${mode}.png`))
      }
      finally {
        await context.close()
      }
    }
  }
  finally {
    if (api)
      await api.dispose()
    if (iconClient)
      await iconClient.dispose()
    await browser.close()
    await stopIsolatedService(service)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
