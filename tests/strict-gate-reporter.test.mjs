import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import StrictGateReporter from './strict-gate-reporter.mjs'

async function runReporter(reporter, selected, results) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yin-theme-reporter-'))
  const previous = Object.fromEntries(['YIN_PANEL_TEST_BINARY', 'YIN_PANEL_TEST_WEB_DIR', 'YIN_PANEL_TEST_CORE_REVISION', 'YIN_PANEL_TEST_SOURCE_DIR', 'YIN_PANEL_THEME_ACCEPTANCE_REPORT', 'YIN_PANEL_REQUIRED_THEME_CASES'].map(key => [key, process.env[key]]))
  const binary = path.join(root, 'yin-panel')
  const web = path.join(root, 'web')
  const report = path.join(root, 'evidence.json')
  const manifest = path.join(root, 'required.json')
  await writeFile(binary, 'test-binary')
  await mkdir(web)
  await writeFile(path.join(web, 'index.html'), '<html></html>')
  await writeFile(manifest, JSON.stringify(selected.map(item => item.titlePath().join(' › '))))
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'test@example.test'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root })
  execFileSync('git', ['add', 'yin-panel', 'web/index.html', 'required.json'], { cwd: root })
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: root })
  process.env.YIN_PANEL_TEST_BINARY = binary
  process.env.YIN_PANEL_TEST_WEB_DIR = web
  process.env.YIN_PANEL_TEST_CORE_REVISION = 'test-source-revision'
  process.env.YIN_PANEL_TEST_SOURCE_DIR = root
  process.env.YIN_PANEL_THEME_ACCEPTANCE_REPORT = report
  process.env.YIN_PANEL_REQUIRED_THEME_CASES = manifest
  try {
    reporter.onBegin({}, { allTests: () => selected })
    for (const [item, result] of results) reporter.onTestEnd(item, result)
    const end = await reporter.onEnd({ status: 'passed' })
    return { status: end.status, report: JSON.parse(await readFile(report, 'utf8')) }
  }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await rm(root, { recursive: true, force: true })
  }
}

const fakeTest = (title = 'Theme test') => ({
  titlePath: () => ['Theme', title],
  parent: { project: () => ({ name: 'chromium' }) },
  annotations: [],
})

test('strict gate fails when the selected suite contains no tests', async () => {
  const reporter = new StrictGateReporter()
  const result = await runReporter(reporter, [], [])
  assert.equal(result.status, 'failed')
  assert.equal(result.report.selected, 0)
})

test('strict gate fails when any selected test is skipped', async () => {
  const reporter = new StrictGateReporter()
  const result = await runReporter(reporter, [fakeTest('isolated preview')], [[fakeTest('isolated preview'), { status: 'skipped' }]])
  assert.equal(result.status, 'failed')
  assert.equal(result.report.skipped.length, 1)
})

test('strict gate records Core artifact and Theme revision evidence for a passing run', async () => {
  const reporter = new StrictGateReporter()
  const item = fakeTest('built-ins')
  item.annotations.push({ type: 'theme-revisions', description: JSON.stringify([{ id: 'org.yin.default', revision: 'abc123' }]) })
  const result = await runReporter(reporter, [item], [[item, { status: 'passed' }]])
  assert.equal(result.status, 'passed')
  assert.equal(result.report.core.sourceRevision, 'test-source-revision')
  assert.equal(result.report.core.sourceDirty, false)
  assert.match(result.report.core.sourceWorktreeSha256, /^[a-f\d]{64}$/)
  assert.equal(result.report.themeRevisions[0], 'org.yin.default@abc123')
  assert.match(result.report.core.binarySha256, /^[a-f\d]{64}$/)
})
