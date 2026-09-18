import { test, expect } from './isolated-fixture.mjs'
import { authHeaders, getSpaces, login } from './helpers.mjs'
import Database from 'better-sqlite3'
import { restartIsolatedService } from './isolated-service.mjs'

test('fresh startup gives every account one Yin entry with a stable pair', async ({ isolated, playwright }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY and YIN_PANEL_TEST_WEB_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const user = await login(request, { mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com', password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com' })
  const spaces = await getSpaces(request, authHeaders(user))
  const yin = spaces.filter(value => value.side === 'yin')
  expect(yin.length).toBeGreaterThan(0)
  expect(new Set(yin.map(value => value.pairId)).size).toBe(yin.length)
  expect(yin.every(value => value.pairedSpaceId)).toBeTruthy()
  await request.dispose()
})

test('historical duplicate personal spaces merge on restart and remain idempotent', async ({ isolated, playwright }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY and YIN_PANEL_TEST_WEB_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const user = await login(request, { mail: 'admin@yiniot.com', password: 'admin@yiniot.com' })
  const db = new Database(isolated.database)
  const yin = db.prepare("select * from space where owner_user_id = ? and side = 'yin' order by id limit 1").get(user.id)
  db.prepare("insert into space (type,name,owner_user_id,pair_id,side,public_enabled,public_mode,created_at,updated_at) values ('personal','legacy duplicate',?,?, 'yin',1,'direct',datetime('now'),datetime('now'))").run(user.id, yin.pair_id || yin.id)
  const duplicate = db.prepare("select id from space where owner_user_id = ? order by id desc limit 1").get(user.id)
  db.prepare("insert into space_member (space_id,user_id,role,source,joined_at,created_at,updated_at) values (?,?, 'viewer','manual',datetime('now'),datetime('now'),datetime('now'))").run(duplicate.id, user.id)
  db.close()
  await restartIsolatedService(isolated)
  const first = new Database(isolated.database)
  const count = first.prepare("select count(*) as count from space where owner_user_id = ? and side = 'yin'").get(user.id).count
  expect(count).toBe(1)
  const snapshot = first.prepare('select id,type,name,owner_user_id,pair_id,side,public_enabled,public_mode from space order by id').all()
  first.close()
  await restartIsolatedService(isolated)
  const second = new Database(isolated.database)
  expect(second.prepare('select id,type,name,owner_user_id,pair_id,side,public_enabled,public_mode from space order by id').all()).toEqual(snapshot)
  second.close(); await request.dispose()
})
