import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { request } from '@playwright/test'

const envPath = process.env.YIN_PANEL_ENV_FILE || path.resolve('.env.local')
try { process.loadEnvFile(envPath) } catch {}
const api = await request.newContext({ baseURL: process.env.YIN_PANEL_URL })
const login = await api.post('/api/login', { data: { mail: process.env.YIN_PANEL_TEST_USER, password: process.env.YIN_PANEL_TEST_PASSWORD } })
const loginBody = await login.json(); if (loginBody.code !== 0) throw new Error(loginBody.msg)
const headers = { Authorization: `Bearer ${loginBody.data.token}` }
const mail = process.env.YIN_PANEL_TEST_MEMBER_USER || `yin-panel-e2e-member-${Date.now()}@local.test`
const password = process.env.YIN_PANEL_TEST_MEMBER_PASSWORD || `E2e-${Date.now().toString().slice(-8)}`
const users = await api.get('/api/panel/users/getList?page=1&pageSize=200', { headers })
const userBody = await users.json(); const existing = userBody.data?.list?.find(user => user.mail === mail)
let memberId = existing?.id
if (!memberId) {
  const created = await api.post('/api/panel/users/create', { headers, data: { mail, password, name: 'E2E Member', role: 2, status: 1 } })
  const body = await created.json(); if (body.code !== 0) throw new Error(body.msg); memberId = body.data.userId
}
let env = await fs.readFile(envPath, 'utf8').catch(() => '')
for (const [key, value] of [['YIN_PANEL_TEST_MEMBER_USER', mail], ['YIN_PANEL_TEST_MEMBER_PASSWORD', password], ['YIN_PANEL_TEST_MEMBER_ID', String(memberId)]]) {
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  env = pattern.test(env) ? env.replace(pattern, line) : `${env.trimEnd()}\n${line}\n`
}
await fs.writeFile(envPath, env)
console.log(`Provisioned ${mail} (${memberId}) in ${envPath}`)
await api.dispose()
