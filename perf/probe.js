// Single-endpoint capacity probe. Run by perf/sweep.mjs, one execution per
// load step. It drives a constant arrival rate and aborts as soon as the error
// or latency budget breaks, so a non-zero exit means "this rate is over the
// knee".
import http from 'k6/http';
import { check } from 'k6';

const REQ = JSON.parse(__ENV.ENDPOINT_JSON);
const RATE = Number(__ENV.RATE || 50);
const DURATION = __ENV.DURATION || '10s';
const BUDGET = Number(__ENV.BUDGET || 300);
const MAX_VUS = Number(__ENV.MAX_VUS || 4000);

export const options = {
  discardResponseBodies: false,
  scenarios: {
    probe: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 200,
      maxVUs: MAX_VUS,
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '2s' }],
    http_req_duration: [{ threshold: `p(95)<${BUDGET}`, abortOnFail: true, delayAbortEval: '3s' }],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  const params = { headers: REQ.headers || {} };
  const res = http.request(REQ.method, REQ.url, REQ.body || null, params);
  check(res, {
    ok: (r) => {
      if (r.status < 200 || r.status >= 400) return false;
      const ct = r.headers['Content-Type'] || '';
      if (ct.indexOf('application/json') === -1) return true;
      try {
        const body = r.json();
        if (body && typeof body.code !== 'undefined') return body.code === 0;
      } catch (e) { /* non-JSON body */ }
      return true;
    },
  });
}

export function handleSummary(data) {
  const out = __ENV.OUT;
  return out ? { [out]: JSON.stringify(data) } : { stdout: '' };
}
