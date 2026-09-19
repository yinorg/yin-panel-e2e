import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import net from 'node:net'
import { startMockOIDC } from './mock-oidc.mjs'

async function freePort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

export async function waitForService(url, timeout = 30000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.status === 200) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`isolated service did not become ready: ${url}`)
}

export async function startIsolatedService() {
  const binary = process.env.YIN_PANEL_TEST_BINARY
  const webDir = process.env.YIN_PANEL_TEST_WEB_DIR
  const langDir = process.env.YIN_PANEL_TEST_LANG_DIR
  if (!binary || !webDir || !langDir) return null
  for (const [label, value] of [['binary', binary], ['web', webDir], ['lang', langDir]]) {
    try { await fs.access(value) } catch { throw new Error(`YIN_PANEL_TEST_${label.toUpperCase()} path does not exist: ${value}`) }
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yin-panel-e2e-'))
  const oidc = await startMockOIDC()
  const port = await freePort()
  const database = path.join(root, 'database', 'database.db')
  const uploads = path.join(root, 'uploads')
  await fs.mkdir(path.dirname(database), { recursive: true })
  await fs.mkdir(uploads, { recursive: true })
  const configuredCore = process.env.YIN_PANEL_TEST_CORE_CONFIG
  const providerConfig = ['gitlab', 'google', 'keycloak', 'auth0', 'entra', 'okta', 'zitadel', 'authentik']
    .map(name => `    - name: ${name}\n      client_id: e2e-${name}\n      client_secret: e2e-secret\n      issuer_url: ${oidc.issuer}\n      scopes: openid profile email\n      field_mapping_identifier: sub\n      field_mapping_display_name: name\n      field_mapping_email: email`)
    .join('\n')
  const githubConfig = `    - name: github\n      client_id: e2e-github\n      client_secret: e2e-secret\n      auth_url: ${oidc.issuer}/github/authorize\n      token_url: ${oidc.issuer}/github/token\n      user_info_url: ${oidc.issuer}/github/user\n      user_info_email_url: ${oidc.issuer}/github/emails\n      scopes: read:user user:email\n      field_mapping_identifier: id\n      field_mapping_display_name: name\n      field_mapping_email: email`
  let config = configuredCore
    ? await fs.readFile(configuredCore, 'utf8')
    : `base:\n  http_port: ${port}\n  root_url: http://127.0.0.1:${port}\n  database_drive: sqlite\n  enable_static_server: true\n  enable_monitor: false\n  url_prefix: /uploads/\nsqlite:\n  file_path: ${database}\nrclone:\n  type: local\n  bucket: ${uploads}\n  rclone.conf: |-\n    type = local\njwt:\n  secret: e2e-isolated-secret\n  expire: 24\noauth:\n  enable: true\n  providers:\n    - name: mock\n      client_id: e2e-client\n      client_secret: e2e-secret\n      issuer_url: ${oidc.issuer}\n      scopes: openid profile email\n      field_mapping_identifier: sub\n      field_mapping_display_name: name\n      field_mapping_email: email\nmigration:\n  enabled: true\n  dry_run: false\n  backup_path: ${path.join(root, 'backup')}\n`
  if (!configuredCore) config = config.replace(/    - name: mock[\s\S]*?      field_mapping_email: email\n/, `${githubConfig}\n${providerConfig}\n`)
  const configPath = path.join(root, 'conf.yaml')
  await fs.writeFile(configPath, config)
  await fs.cp(webDir, path.join(root, 'web'), { recursive: true })
  await fs.cp(langDir, path.join(root, 'lang'), { recursive: true })
  const child = spawn(binary, ['-c', configPath], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  const url = `http://127.0.0.1:${port}`
  try {
    await waitForService(`${url}/`)
  } catch (error) {
    child.kill('SIGTERM')
    await fs.rm(root, { recursive: true, force: true })
    throw new Error(`${error.message}\n${output}`)
  }
  return { root, url, port, database, binary, webDir, langDir, configPath, config, child, oidc, get output() { return output } }
}

export async function restartIsolatedService(service) {
  if (!service.child.killed) {
    service.child.kill('SIGTERM')
    await Promise.race([once(service.child, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))])
  }
  const child = spawn(service.binary, ['-c', service.configPath], { cwd: service.root, stdio: ['ignore', 'pipe', 'pipe'] })
  service.child = child
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  await waitForService(`${service.url}/`)
}

export async function stopIsolatedService(service) {
  if (!service) return
  if (!service.child.killed) service.child.kill('SIGTERM')
  await Promise.race([once(service.child, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))])
  await fs.rm(service.root, { recursive: true, force: true })
  await service.oidc.close()
}
