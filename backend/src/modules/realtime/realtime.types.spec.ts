import { isNewer, room } from './realtime.types.js';

describe('isNewer', () => {
  it('accepts the first message', () => {
    expect(isNewer({ version: 3 })).toBe(true);
  });

  it('accepts only strictly newer versions', () => {
    expect(isNewer({ version: 4 }, { version: 3 })).toBe(true);
    expect(isNewer({ version: 3 }, { version: 3 })).toBe(false);
    expect(isNewer({ version: 2 }, { version: 3 })).toBe(false);
  });
});

describe('room', () => {
  it('namespaces rooms by kind', () => {
    expect(room.product('p1')).toBe('product:p1');
    expect(room.auction('p1')).toBe('auction:p1');
    expect(room.user('u1')).toBe('user:u1');
  });
});
