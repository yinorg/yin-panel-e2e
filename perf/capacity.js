// Mixed-workload capacity test: ramps the offered request rate until the error
// or latency budget breaks, tagging every endpoint so the report shows which
// one saturates first. Run it together with perf/monitor.sh to correlate the
// service's CPU/RAM/disk against the offered load.
import http from 'k6/http';
import { check } from 'k6';

const BASE = (__ENV.BASE_URL || 'http://127.0.0.1:3002').replace(/\/$/, '');
const START = Number(__ENV.START_RATE || 20);
const PEAK = Number(__ENV.PEAK_RATE || 3000);
const RAMP = __ENV.RAMP || '4m';
const BUDGET = Number(__ENV.BUDGET || 800);

export const options = {
  discardResponseBodies: true,
  scenarios: {
    mixed: {
      executor: 'ramping-arrival-rate',
      startRate: START,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 2000,
      stages: [{ target: PEAK, duration: RAMP }],
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '15s' }],
    http_req_duration: [{ threshold: `p(95)<${BUDGET}`, abortOnFail: true, delayAbortEval: '15s' }],
  },
  summaryTrendStats: ['avg', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  const login = http.post(`${BASE}/api/login`, JSON.stringify({
    mail: __ENV.ADMIN_USER, password: __ENV.ADMIN_PASS,
  }), { headers: { 'Content-Type': 'application/json' } });
  let token = '';
  try { token = login.json('data.token') || ''; } catch { /* ignore */ }
  return { token, spaceId: __ENV.SPACE_ID || '1' };
}

const WEIGHTS = [
  ['spa-root', 'GET', '/', 1, false],
  ['about', 'GET', '/api/about', 1, false],
  ['theme-packages', 'GET', '/api/theme/v2/packages', 1, false],
  ['space-public', 'GET', '/api/spaces/{space}/public', 1, false],
  ['spaces-list', 'GET', '/api/spaces', 3, true],
  ['space-items', 'GET', '/api/spaces/{space}/items', 3, true],
  ['space-groups', 'GET', '/api/spaces/{space}/groups', 3, true],
  ['user-getUser', 'GET', '/api/user/getUser', 2, true],
  ['monitor-snapshot', 'POST', '/api/system/monitor/getSnapshot', 2, true],
];

const TOTAL_WEIGHT = WEIGHTS.reduce((s, w) => s + w[3], 0);

function pick() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const w of WEIGHTS) { r -= w[3]; if (r <= 0) return w; }
  return WEIGHTS[0];
}

export default function (data) {
  const [name, method, path, , auth] = pick();
  const url = BASE + path.replace('{space}', data.spaceId);
  const headers = auth ? { Authorization: `Bearer ${data.token}` } : {};
  let body = null;
  if (method === 'POST') { headers['Content-Type'] = 'application/json'; body = '{}'; }
  const res = http.request(method, url, body, { headers, tags: { endpoint: name } });
  check(res, { [`${name} 2xx`]: (r) => r.status >= 200 && r.status < 400 });
}
