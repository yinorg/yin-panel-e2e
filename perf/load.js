import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3002';
const SPACE_ID = __ENV.SPACE_ID || '1';

// Ramp to a modest peak so the run stays meaningful on a local single process.
export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 30 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

const endpoints = [
  { path: '/', tag: 'spa-root' },
  { path: '/api/theme/v2/packages', tag: 'theme-packages' },
  { path: `/api/spaces/${SPACE_ID}/public`, tag: 'space-public' },
];

export default function () {
  for (const endpoint of endpoints) {
    const res = http.get(`${BASE_URL}${endpoint.path}`, { tags: { endpoint: endpoint.tag } });
    check(res, {
      [`${endpoint.tag} status 200`]: (r) => r.status === 200,
    });
  }
  sleep(1);
}
