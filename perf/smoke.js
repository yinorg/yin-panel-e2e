import http from 'k6/http';
import { check, sleep } from 'k6';

// Public entry points only, so the smoke test needs no credentials.
const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3002';
const SPACE_ID = __ENV.SPACE_ID || '1';

const paths = ['/', '/login', '/api/theme/v2/packages', `/api/spaces/${SPACE_ID}/public`];

export const options = {
  vus: 3,
  duration: '10s',
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

export default function () {
  for (const path of paths) {
    const res = http.get(`${BASE_URL}${path}`);
    check(res, {
      [`${path} status 200`]: (r) => r.status === 200,
    });
  }
  sleep(1);
}
