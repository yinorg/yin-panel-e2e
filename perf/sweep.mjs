#!/usr/bin/env node
// Capacity sweep driver.
//
// For every endpoint in the catalogue it runs perf/probe.js at an increasing
// constant arrival rate until the error or latency budget breaks, then records
// the highest rate that still passed as that endpoint's ceiling.
//
// Usage:
//   node perf/sweep.mjs [--class public,read] [--only name1,name2]
//                       [--start 20] [--max 4000] [--duration 10s]
//                       [--budget-read 300] [--budget-write 800]
//                       [--out-dir perf/results/run-<ts>] [--resume]
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG, buildRequest } from './lib/catalog.mjs';
import { discover, createThrowawaySpace, deleteSpace } from './lib/client.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const K6 = process.env.K6_BIN || 'k6';

function parseArgs(argv) {
  const out = { start: 20, max: 4000, duration: '10s', budgetRead: 300, budgetWrite: 800 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--class') out.classes = next().split(',');
    else if (a === '--only') out.only = next().split(',');
    else if (a === '--start') out.start = Number(next());
    else if (a === '--max') out.max = Number(next());
    else if (a === '--duration') out.duration = next();
    else if (a === '--budget-read') out.budgetRead = Number(next());
    else if (a === '--budget-write') out.budgetWrite = Number(next());
    else if (a === '--out-dir') out.outDir = next();
    else if (a === '--resume') out.resume = true;
    else if (a === '--canary-only') out.canaryOnly = true;
  }
  return out;
}

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function canary(base, built) {
  try {
    const headers = {};
    if (built.headers?.Authorization) headers.Authorization = built.headers.Authorization;
    if (built.body) headers['Content-Type'] = 'application/json';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(built.url, { method: built.method, headers, body: built.body, signal: controller.signal });
    clearTimeout(timer);
    const text = await res.text();
    let code;
    try { const j = JSON.parse(text); if (j && typeof j.code !== 'undefined') code = j.code; } catch { /* non-JSON */ }
    const ok = res.status >= 200 && res.status < 400 && (code === undefined || code === 0);
    return { ok, status: res.status, code };
  } catch (e) {
    return { ok: false, status: 0, error: String(e.message || e) };
  }
}

function runProbe(built, rate, args, outPath) {
  const endpointJson = JSON.stringify({ method: built.method, url: built.url, body: built.body, headers: built.headers });
  const r = spawnSync(K6, [
    'run',
    '-e', `ENDPOINT_JSON=${endpointJson}`,
    '-e', `RATE=${rate}`,
    '-e', `DURATION=${args.duration}`,
    '-e', `BUDGET=${built.budget}`,
    '-e', `OUT=${outPath}`,
    join(HERE, 'probe.js'),
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let summary = null;
  if (existsSync(outPath)) {
    try { summary = JSON.parse(readFileSync(outPath, 'utf8')); } catch { /* ignore */ }
  }
  const m = summary?.metrics || {};
  const durSec = parseFloat(args.duration) || 10;
  const reqs = m['http_reqs']?.values?.count ?? 0;
  const dropped = m['dropped_iterations']?.values?.count ?? 0;
  const attempted = reqs + dropped;
  return {
    pass: r.status === 0,
    exitCode: r.status,
    p95: m['http_req_duration']?.values?.['p(95)'] ?? null,
    p99: m['http_req_duration']?.values?.['p(99)'] ?? null,
    failRate: m['http_req_failed']?.values?.rate ?? null,
    reqs,
    dropped,
    achieved: durSec ? Math.round(reqs / durSec) : null,
    droppedRatio: attempted ? dropped / attempted : 0,
    checksRate: m['checks']?.values?.rate ?? null,
  };
}

async function sweepEndpoint(ep, ctx, args, outDir) {
  const budget = ep.cls === 'write' || ep.cls === 'upload' ? args.budgetWrite : args.budgetRead;
  const built = buildRequest(ep, ctx);
  if (built.url.startsWith('/')) built.url = ctx.baseUrl + built.url;
  const headers = {};
  if (ep.auth === 'admin') headers.Authorization = `Bearer ${ctx.tokens.admin}`;
  else if (ep.auth === 'member') headers.Authorization = `Bearer ${ctx.tokens.member}`;
  built.headers = headers;
  built.budget = budget;

  const c = await canary(ctx.baseUrl, built);
  if (!c.ok) {
    return { name: ep.name, cls: ep.cls, status: 'canary_fail', httpStatus: c.status, error: c.error };
  }

  const steps = [];
  let maxPass = 0;
  let firstFail = null;
  let failLimited = false;
  for (let rate = args.start; rate <= args.max; rate *= 2) {
    const outPath = join(outDir, `${ep.name}.rate-${rate}.json`);
    const step = runProbe(built, rate, args, outPath);
    const genLimited = step.droppedRatio > 0.05;
    steps.push({ rate, generatorLimited: genLimited, ...step });
    if (step.pass && !genLimited) { maxPass = rate; } else { firstFail = rate; failLimited = genLimited; break; }
  }

  return {
    name: ep.name,
    cls: ep.cls,
    status: firstFail === null ? 'not_broken' : (failLimited ? 'generator_limited' : 'knee_found'),
    ceilingRps: maxPass,
    firstFailRps: firstFail,
    budgetMs: budget,
    steps,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args.outDir || join(HERE, 'results', `run-${nowStamp()}`);
  mkdirSync(outDir, { recursive: true });

  const base = (process.env.YIN_PANEL_URL || 'http://127.0.0.1:3002').replace(/\/$/, '');
  const classes = args.classes || ['public', 'read', 'admin', 'external'];
  const needWriteSpace = classes.includes('write') || classes.includes('upload');

  let ctx = await discover(base, process.env);
  let throwawaySpaceId = null;
  if (needWriteSpace) {
    const name = `perf-${Date.now()}`;
    throwawaySpaceId = await createThrowawaySpace(base, ctx.tokens.admin, name);
    ctx = await discover(base, process.env, { spaceIdOverride: throwawaySpaceId });
    console.log(`[sweep] throwaway space ${throwawaySpaceId} (${name}) for write/upload endpoints`);
  }
  writeFileSync(join(outDir, 'context.json'), JSON.stringify({
    baseUrl: ctx.baseUrl, spaceId: ctx.spaceId, itemId: ctx.itemId,
    groupId: ctx.groupId, userId: ctx.userId, packageId: ctx.packageId,
    revision: ctx.revision, throwawaySpaceId, notes: ctx.notes,
  }, null, 2));
  console.log(`[sweep] base=${base} space=${ctx.spaceId} item=${ctx.itemId} group=${ctx.groupId} user=${ctx.userId}`);
  if (ctx.notes.length) console.log(`[sweep] notes: ${ctx.notes.join('; ')}`);

  let endpoints = CATALOG.filter((e) => classes.includes(e.cls));
  if (args.only) endpoints = endpoints.filter((e) => args.only.includes(e.name));

  if (args.canaryOnly) {
    const out = [];
    for (const ep of endpoints) {
      if (ep.skip) { out.push({ name: ep.name, cls: ep.cls, status: 'skipped', reason: ep.skip }); continue; }
      let built;
      try { built = buildRequest(ep, ctx); } catch (e) { out.push({ name: ep.name, cls: ep.cls, status: 'build_error', error: String(e.message) }); continue; }
      if (built.url.startsWith('/')) built.url = ctx.baseUrl + built.url;
      const headers = {};
      if (ep.auth === 'admin') headers.Authorization = `Bearer ${ctx.tokens.admin}`;
      built.headers = headers;
      const c = await canary(ctx.baseUrl, built);
      const row = { name: ep.name, cls: ep.cls, status: c.ok ? 'canary_ok' : 'canary_fail', httpStatus: c.status, code: c.code, error: c.error };
      out.push(row);
      console.log(`[canary] ${ep.name} ${row.status} http=${c.status} code=${c.code ?? '-'}`);
    }
    writeFileSync(join(outDir, 'canary.json'), JSON.stringify(out, null, 2));
    if (throwawaySpaceId) {
      try { await deleteSpace(base, ctx.tokens.admin, throwawaySpaceId); console.log(`[sweep] removed throwaway space ${throwawaySpaceId}`); }
      catch (e) { console.log(`[sweep] WARN could not remove throwaway space ${throwawaySpaceId}: ${e.message}`); }
    }
    console.log(`[sweep] canary -> ${join(outDir, 'canary.json')}`);
    return;
  }

  const index = [];
  const doneNames = new Set();
  if (args.resume && existsSync(join(outDir, 'index.json'))) {
    const prev = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8'));
    for (const r of prev) {
      index.push(r);
      if (r.status !== 'error' && r.status !== 'canary_fail') doneNames.add(r.name);
    }
    console.log(`[sweep] resume: ${doneNames.size} endpoint(s) already measured`);
  }
  try {
    for (const ep of endpoints) {
      if (doneNames.has(ep.name)) { console.log(`[resume] ${ep.name}`); continue; }
      if (ep.skip) {
        console.log(`[skip] ${ep.name}: ${ep.skip}`);
        index.push({ name: ep.name, cls: ep.cls, status: 'skipped', reason: ep.skip });
        continue;
      }
      process.stdout.write(`[sweep] ${ep.name} ... `);
      try {
        const res = await sweepEndpoint(ep, ctx, args, outDir);
        writeFileSync(join(outDir, `${ep.name}.result.json`), JSON.stringify(res, null, 2));
        index.push(res);
        console.log(`${res.status} ceiling=${res.ceilingRps} firstFail=${res.firstFailRps ?? '-'}`);
      } catch (e) {
        const res = { name: ep.name, cls: ep.cls, status: 'error', error: String(e.message || e) };
        index.push(res);
        console.log(`error: ${res.error}`);
      }
      writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2));
    }
  } finally {
    if (throwawaySpaceId) {
      try { await deleteSpace(base, ctx.tokens.admin, throwawaySpaceId); console.log(`[sweep] removed throwaway space ${throwawaySpaceId}`); }
      catch (e) { console.log(`[sweep] WARN could not remove throwaway space ${throwawaySpaceId}: ${e.message}`); }
    }
  }
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`[sweep] done -> ${outDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
