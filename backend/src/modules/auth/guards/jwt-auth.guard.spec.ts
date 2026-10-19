import { extractBearerToken } from './jwt-auth.guard.js';

describe('extractBearerToken', () => {
  it('reads a bearer token case-insensitively', () => {
    expect(extractBearerToken('Bearer abc.def')).toBe('abc.def');
    expect(extractBearerToken('bearer abc.def')).toBe('abc.def');
  });

  it.each([undefined, '', 'Basic abc', 'Bearer', 'Bearer '])('ignores %s', (header) => {
    expect(extractBearerToken(header)).toBeUndefined();
  });
});
