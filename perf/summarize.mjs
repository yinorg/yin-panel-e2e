#!/usr/bin/env node
// Aggregate one sweep results directory into summary.md and summary.csv.
// Usage: node perf/summarize.mjs perf/results/run-<ts>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('usage: summarize.mjs <results-dir>'); process.exit(1); }
const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));

function lastPassStep(ep) {
  const passed = (ep.steps || []).filter((s) => s.pass);
  return passed.length ? passed[passed.length - 1] : null;
}

const rows = index.map((ep) => {
  const step = lastPassStep(ep);
  return {
    name: ep.name,
    cls: ep.cls,
    status: ep.status,
    ceiling: ep.ceilingRps ?? '',
    firstFail: ep.firstFailRps ?? '',
    p95: step?.p95 != null ? Math.round(step.p95 * 100) / 100 : '',
    failRate: step?.failRate != null ? (step.failRate * 100).toFixed(2) + '%' : '',
    reqs: step?.reqs ?? '',
    reason: ep.reason || ep.error || '',
  };
});

const header = '| endpoint | class | status | ceiling req/s | first-fail req/s | p95@ceiling ms | fail@ceiling | reason |';
const sep = '| --- | --- | --- | --- | --- | --- | --- | --- |';
const lines = [header, sep];
for (const r of rows) {
  lines.push(`| ${r.name} | ${r.cls} | ${r.status} | ${r.ceiling} | ${r.firstFail} | ${r.p95} | ${r.failRate} | ${r.reason} |`);
}

const broken = rows.filter((r) => r.status === 'knee_found');
const notBroken = rows.filter((r) => r.status === 'not_broken');
const skipped = rows.filter((r) => r.status === 'skipped');
const failed = rows.filter((r) => r.status === 'canary_fail' || r.status === 'error');

const summary = [
  `# Capacity sweep summary`,
  '',
  `- measured: ${broken.length + notBroken.length}`,
  `- knee found: ${broken.length}`,
  `- not broken within cap: ${notBroken.length}`,
  `- skipped: ${skipped.length}`,
  `- canary/error: ${failed.length}`,
  '',
  ...lines,
  '',
  '> Same-host run: the load generator shares the machine with the service, so',
  '> the SUT-side CPU/RAM/disk numbers are a lower bound and the host-wide disk',
  '> figure includes k6 itself. Loopback bypasses the real network path.',
  '',
].join('\n');

writeFileSync(join(dir, 'summary.md'), summary);
const csv = ['endpoint,class,status,ceiling_rps,first_fail_rps,p95_ms,fail_rate,reason']
  .concat(rows.map((r) => [r.name, r.cls, r.status, r.ceiling, r.firstFail, r.p95, r.failRate, `"${String(r.reason).replace(/"/g, "'")}"`].join(',')))
  .join('\n');
writeFileSync(join(dir, 'summary.csv'), csv + '\n');

console.log(summary);
