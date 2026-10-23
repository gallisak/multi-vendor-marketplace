import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Gauge } from 'prom-client';
import type { Socket } from 'socket.io';
import type { Env } from '../../infra/config/env.schema.js';
import type { AccessTokenRevocationService } from '../auth/access-token-revocation.service.js';
import type { RealtimeSnapshotsService } from './realtime-snapshots.service.js';
import { parseSubscription, RealtimeGateway } from './realtime.gateway.js';

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

describe('RealtimeGateway.subscribe', () => {
  const calls: string[] = [];
  const client = {
    join: vi.fn(() => {
      calls.push('join');
    }),
    leave: vi.fn(() => {
      calls.push('leave');
    }),
  };
  const snapshots = {
    product: vi.fn(() => {
      calls.push('snapshot');
      return Promise.resolve({ productId: id, version: 1 });
    }),
    auction: vi.fn(() => {
      calls.push('snapshot');
      return Promise.resolve(null);
    }),
  };
  const gateway = new RealtimeGateway(
    {} as JwtService,
    { get: () => 60_000 } as unknown as ConfigService<Env, true>,
    {} as AccessTokenRevocationService,
    snapshots as unknown as RealtimeSnapshotsService,
    {} as Gauge<string>,
  );

  beforeEach(() => {
    calls.length = 0;
  });

  it('joins the room before reading the snapshot so no push falls in between', async () => {
    const ack = await gateway.subscribe(client as unknown as Socket, { channel: 'product', id });
    expect(ack).toMatchObject({ ok: true, channel: 'product' });
    expect(calls).toEqual(['join', 'snapshot']);
  });

  it('leaves the room again when the entity does not exist', async () => {
    const ack = await gateway.subscribe(client as unknown as Socket, { channel: 'auction', id });
    expect(ack).toEqual({ ok: false, error: 'auction not found' });
    expect(calls).toEqual(['join', 'snapshot', 'leave']);
  });
});
