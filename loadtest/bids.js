import http from 'k6/http';
import { check } from 'k6';
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

const BIDDERS = Number(__ENV.BIDDERS || 50);
const STEP_MINOR = 1_000;

const accepted = new Counter('bids_accepted');
const outbid = new Counter('bids_rejected_too_low');
const leading = new Counter('bids_rejected_already_leading');
const busy = new Counter('bids_rejected_busy');
const unexpected = new Counter('unexpected_errors');
const bidLatency = new Trend('bids_latency', true);

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  setupTimeout: '120s',
  scenarios: {
    bidders: {
      executor: 'constant-vus',
      vus: BIDDERS,
      duration: __ENV.DURATION || '30s',
    },
  },
  thresholds: {
    unexpected_errors: ['count==0'],
    bids_latency: ['p(95)<500'],
    bids_accepted: ['count>0'],
  },
};

export function setup() {
  const productId = createApprovedProduct({
    title: `Load test auction ${Date.now()}`,
    description: 'Many bidders hit the same lot at once',
    categoryId: leafCategoryId(),
    type: 'AUCTION',
    auction: {
      startPriceMinor: 10_000,
      bidStepMinor: STEP_MINOR,
      endsAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    },
  });
  return { productId, tokens: registerCustomers(BIDDERS, `bids-${Date.now()}`) };
}

export default function ({ productId, tokens }) {
  const token = tokens[(__VU - 1) % tokens.length];
  const view = http.get(`${API}/auctions/${productId}`, {
    ...headers(token),
    tags: { name: 'auction view' },
  });
  if (view.status !== 200) {
    unexpected.add(1);
    return;
  }
  const amountMinor = view.json().minNextBidMinor + STEP_MINOR * Math.floor(Math.random() * 3);
  const response = http.post(`${API}/auctions/${productId}/bids`, JSON.stringify({ amountMinor }), {
    ...headers(token, { 'Idempotency-Key': uuid() }),
    tags: { name: 'place bid' },
  });
  bidLatency.add(response.timings.duration);

  if (response.status === 201) {
    accepted.add(1);
  } else if (response.status === 409) {
    const message = String(response.json().message);
    if (message.startsWith('Bid must be at least')) outbid.add(1);
    else if (message.includes('already the highest')) leading.add(1);
    else if (message.includes('too busy')) busy.add(1);
    else unexpected.add(1);
  } else {
    unexpected.add(1);
  }
  check(response, { 'bid answered with 201 or 409': (r) => r.status === 201 || r.status === 409 });
}

export const handleSummary = summary('bids');
