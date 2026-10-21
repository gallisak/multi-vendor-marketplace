import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { Counter, Trend } from 'k6/metrics';
import {
  API,
  createApprovedProduct,
  headers,
  leafCategoryId,
  registerCustomers,
  summary,
  uuid,
} from './lib.js';

const BUYERS = Number(__ENV.BUYERS || 200);
const STOCK = Number(__ENV.STOCK || 20);

const placed = new Counter('checkout_placed');
const soldOut = new Counter('checkout_sold_out');
const unexpected = new Counter('unexpected_errors');
const checkoutLatency = new Trend('checkout_latency', true);

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  setupTimeout: '180s',
  scenarios: {
    rush: {
      executor: 'shared-iterations',
      vus: Number(__ENV.VUS || 100),
      iterations: BUYERS,
      maxDuration: '2m',
    },
  },
  thresholds: {
    unexpected_errors: ['count==0'],
    checkout_placed: [`count==${STOCK}`],
    checkout_latency: ['p(95)<1000'],
  },
};

export function setup() {
  const productId = createApprovedProduct({
    title: `Load test limited stock ${Date.now()}`,
    description: `Only ${STOCK} units for ${BUYERS} buyers`,
    categoryId: leafCategoryId(),
    type: 'FIXED_PRICE',
    priceMinor: 25_000,
    stock: STOCK,
  });
  return { productId, tokens: registerCustomers(BUYERS, `checkout-${Date.now()}`) };
}

const isStockConflict = (response) =>
  response.status === 409 && /STOCK|NOT_ACTIVE/i.test(String(response.json().message));

const leftCatalog = (response) => response.status === 404;

export default function ({ productId, tokens }) {
  const token = tokens[exec.scenario.iterationInTest];
  const cart = http.put(`${API}/cart/items/${productId}`, JSON.stringify({ quantity: 1 }), {
    ...headers(token),
    tags: { name: 'add to cart' },
  });
  if (cart.status !== 200) {
    if (isStockConflict(cart) || leftCatalog(cart)) soldOut.add(1);
    else unexpected.add(1);
    return;
  }

  const response = http.post(`${API}/orders/checkout`, '{}', {
    ...headers(token, { 'Idempotency-Key': uuid() }),
    tags: { name: 'checkout' },
  });
  checkoutLatency.add(response.timings.duration);
  if (response.status === 201) placed.add(1);
  else if (isStockConflict(response)) soldOut.add(1);
  else unexpected.add(1);
  check(response, {
    'checkout answered with 201 or 409': (r) => r.status === 201 || r.status === 409,
  });
}

export const handleSummary = summary('checkout');
