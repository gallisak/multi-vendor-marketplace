import http from 'k6/http';
import { check, fail } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173';
export const API = `${BASE_URL}/api`;
const PASSWORD = 'Password123!';

export const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });

export function headers(token, extra = {}) {
  return {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extra },
  };
}

function expectOk(response, what) {
  if (response.status >= 300) {
    fail(`${what} failed with ${response.status}: ${response.body}`);
  }
  return response.json();
}

export function login(email) {
  const response = http.post(`${API}/auth/login`, JSON.stringify({ email, password: PASSWORD }), {
    headers: { 'Content-Type': 'application/json' },
  });
  return expectOk(response, `login ${email}`).accessToken;
}

export function registerCustomers(count, prefix) {
  const tokens = [];
  for (let offset = 0; offset < count; offset += 25) {
    const batch = [];
    for (let index = offset; index < Math.min(count, offset + 25); index += 1) {
      batch.push([
        'POST',
        `${API}/auth/register`,
        JSON.stringify({
          name: `Load ${index}`,
          email: `${prefix}-${index}@load.test`,
          password: PASSWORD,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ]);
    }
    for (const response of http.batch(batch)) {
      tokens.push(expectOk(response, 'register').accessToken);
    }
  }
  return tokens;
}

export function leafCategoryId() {
  const categories = expectOk(http.get(`${API}/categories`), 'categories');
  const withChildren = categories.find((category) => category.children.length > 0);
  return withChildren ? withChildren.children[0].id : categories[0].id;
}

export function createApprovedProduct(body) {
  const seller = login('seller1@mvm.local');
  const admin = login('admin@mvm.local');
  const product = expectOk(
    http.post(`${API}/seller/products`, JSON.stringify(body), headers(seller)),
    'create product',
  );
  expectOk(
    http.post(`${API}/admin/products/${product.id}/approve`, '{}', headers(admin)),
    'approve product',
  );
  check(product, { 'product created': (p) => Boolean(p.id) });
  return product.id;
}

export function summary(name) {
  return (data) => {
    const metric = (key, stat) => data.metrics[key]?.values?.[stat] ?? 0;
    const report = {
      scenario: name,
      setup: data.setup_data ? { productId: data.setup_data.productId } : null,
      requests: metric('http_reqs', 'count'),
      rps: metric('http_reqs', 'rate'),
      p95Ms: metric('http_req_duration', 'p(95)'),
      p99Ms: metric('http_req_duration', 'p(99)'),
      medianMs: metric('http_req_duration', 'med'),
      unexpectedErrors: metric('unexpected_errors', 'count') ?? 0,
      custom: Object.fromEntries(
        Object.entries(data.metrics)
          .filter(([key]) => key.startsWith(`${name}_`))
          .map(([key, value]) => [key, value.values]),
      ),
    };
    const lines = [
      `\n${name}: ${report.requests} requests, ${report.rps.toFixed(1)} req/s`,
      `latency: median ${report.medianMs.toFixed(1)} ms, p95 ${report.p95Ms.toFixed(1)} ms, p99 ${report.p99Ms.toFixed(1)} ms`,
      `unexpected errors: ${report.unexpectedErrors}`,
      ...Object.entries(report.custom).map(
        ([key, values]) =>
          `${key}: ${values.count ?? ''}${values['p(95)'] === undefined ? '' : ` p95 ${values['p(95)'].toFixed(1)} ms`}`,
      ),
      '',
    ];
    return {
      stdout: lines.join('\n'),
      [`/scripts/results/${name}.json`]: JSON.stringify(report, null, 2),
    };
  };
}
