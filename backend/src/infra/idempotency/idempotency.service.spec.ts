import { canonicalJson, requestHash } from './idempotency.service.js';

describe('canonicalJson', () => {
  it('sorts object keys recursively', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(
      '{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}',
    );
  });

  it('drops undefined fields and keeps nulls', () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
  });
});

describe('requestHash', () => {
  it('does not depend on key order', () => {
    expect(requestHash({ a: 1, b: 2 })).toBe(requestHash({ b: 2, a: 1 }));
  });

  it('changes when the payload changes', () => {
    expect(requestHash({ expectedTotalMinor: 100 })).not.toBe(
      requestHash({ expectedTotalMinor: 101 }),
    );
  });

  it('treats a missing body like an empty one', () => {
    expect(requestHash(undefined)).toBe(requestHash(null));
  });
});
