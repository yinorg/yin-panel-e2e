import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export default class StrictGateReporter {
  constructor() {
    this.total = 0
    this.completed = 0
    this.skipped = []
    this.tests = []
  }

  onBegin(_config, suite) {
    this.total = suite.allTests().length
  }

  onTestEnd(test, result) {
    this.completed += 1
    if (result.status === 'skipped') this.skipped.push(test.titlePath().join(' › '))
    this.tests.push({
      title: test.titlePath().join(' › '),
      project: test.parent.project()?.name || '',
      status: result.status,
      annotations: test.annotations.filter(annotation => annotation.type === 'theme-revisions'),
    })
  }

  async onEnd(result) {
    const failures = []
    if (this.total === 0) failures.push('Theme acceptance selected zero tests')
    if (this.completed !== this.total) failures.push(`Theme acceptance completed ${this.completed}/${this.total} tests`)
    if (this.skipped.length) failures.push(`Theme acceptance skipped tests: ${this.skipped.join(', ')}`)
    const requiredManifest = path.resolve(process.env.YIN_PANEL_REQUIRED_THEME_CASES || path.join(path.dirname(new URL(import.meta.url).pathname), 'required-theme-cases.json'))
    try {
      const required = JSON.parse(await readFile(requiredManifest, 'utf8'))
      const titles = this.tests.map(test => test.title)
      for (const entry of required) {
        if (!titles.some(title => title.includes(entry))) failures.push(`Theme acceptance required case missing: ${entry}`)
      }
    }
    catch (error) {
      failures.push(`Theme acceptance required-case manifest unavailable: ${error.message}`)
    }
    const binary = process.env.YIN_PANEL_TEST_BINARY
    const webDir = process.env.YIN_PANEL_TEST_WEB_DIR
    if (!binary || !webDir) failures.push('Theme acceptance artifact metadata is missing')
    let core = null
    if (binary && webDir) {
      try {
        const binaryBytes = await readFile(binary)
        const entryBytes = await readFile(path.join(webDir, 'index.html'))
        const sourceDir = process.env.YIN_PANEL_TEST_SOURCE_DIR || path.dirname(binary)
        const sourceRevision = process.env.YIN_PANEL_TEST_CORE_REVISION
          || execFileSync('git', ['-C', sourceDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
        const gitOptions = { cwd: sourceDir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
        const status = execFileSync('git', ['status', '--porcelain'], gitOptions)
        const trackedDiff = execFileSync('git', ['diff', '--binary', 'HEAD'], gitOptions)
        const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], gitOptions).split('\n').filter(Boolean).sort()
        const sourceHash = createHash('sha256').update(trackedDiff)
        for (const file of untracked) sourceHash.update(file).update(await readFile(path.resolve(sourceDir, file)))
        core = {
          sourceRevision,
          sourceDirty: !!status.trim(),
          sourceWorktreeSha256: sourceHash.digest('hex'),
          binarySha256: createHash('sha256').update(binaryBytes).digest('hex'),
          webEntrySha256: createHash('sha256').update(entryBytes).digest('hex'),
        }
      }
      catch (error) {
        failures.push(`Theme acceptance could not fingerprint Core artifacts: ${error.message}`)
      }
    }
    const themeRevisions = [...new Set(this.tests.flatMap(test => test.annotations.flatMap(annotation => {
      try { return JSON.parse(annotation.description || '[]').map(theme => `${theme.id}@${theme.revision}`) }
      catch { return [] }
    })))]
    const report = {
      generatedAt: new Date().toISOString(),
      status: failures.length || result.status !== 'passed' ? 'failed' : 'passed',
      selected: this.total,
      completed: this.completed,
      skipped: this.skipped,
      core,
      themeRevisions,
      tests: this.tests,
      failures,
    }
    const reportPath = path.resolve(process.env.YIN_PANEL_THEME_ACCEPTANCE_REPORT || 'test-results/theme-acceptance.json')
    await mkdir(path.dirname(reportPath), { recursive: true })
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`Theme acceptance evidence: ${reportPath}`)
    if (failures.length) {
      for (const failure of failures) console.error(failure)
      return { status: 'failed' }
    }
    return { status: result.status }
  }
}
