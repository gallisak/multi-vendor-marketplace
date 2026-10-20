import { parseSubscription } from './realtime.gateway.js';

const id = '01a15561-8d33-773a-bf4f-0e219518735e';

describe('parseSubscription', () => {
  it('accepts product and auction channels with a uuid', () => {
    expect(parseSubscription({ channel: 'product', id })).toEqual({ channel: 'product', id });
    expect(parseSubscription({ channel: 'auction', id })).toEqual({ channel: 'auction', id });
  });

  it.each([
    [undefined, /channel must be/],
    [{ channel: 'user', id }, /channel must be/],
    [{ channel: 'product' }, /id must be a UUID/],
    [{ channel: 'product', id: 'drop table' }, /id must be a UUID/],
  ])('rejects %j', (body, message) => {
    expect(parseSubscription(body)).toMatch(message);
  });
});
