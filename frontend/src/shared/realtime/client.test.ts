import { RealtimeClient, type RealtimeSocket } from './client';
import type { ConnectionStatus, ProductUpdate, Snapshot, SubscribeAck } from './types';

type Listener = (...args: never[]) => void;

class FakeSocket implements RealtimeSocket {
  connected = false;
  readonly emitted: { event: string; payload: unknown }[] = [];
  readonly listeners = new Map<string, Listener[]>();
  ack: (payload: { channel: string; id: string }) => SubscribeAck = () => ({
    ok: false,
    error: 'not configured',
  });

  readonly token: string | null;

  constructor(token: string | null) {
    this.token = token;
  }

  on(event: string, listener: Listener) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  emit(event: string, payload: unknown) {
    this.emitted.push({ event, payload });
    return this;
  }

  timeout() {
    return {
      emitWithAck: (event: string, payload: unknown) => {
        this.emitted.push({ event, payload });
        return Promise.resolve(this.ack(payload as { channel: string; id: string }));
      },
    };
  }

  connect() {
    return this;
  }

  disconnect() {
    this.connected = false;
    return this;
  }

  fire(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) {
      (listener as (...values: unknown[]) => void)(...args);
    }
  }

  open() {
    this.connected = true;
    this.fire('connect');
  }

  drop() {
    this.connected = false;
    this.fire('disconnect');
  }
}

const product = (version: number, stock: number): ProductUpdate => ({
  productId: 'p1',
  version,
  status: 'ACTIVE',
  stock,
  inStock: stock > 0,
  priceMinor: 10_000,
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(renewToken = () => Promise.resolve<string | null>('renewed')) {
  const sockets: FakeSocket[] = [];
  const client = new RealtimeClient((token) => {
    const socket = new FakeSocket(token);
    sockets.push(socket);
    return socket;
  }, renewToken);
  const statuses: ConnectionStatus[] = [];
  client.onStatus((status) => statuses.push(status));
  return { client, sockets, statuses };
}

describe('RealtimeClient', () => {
  it('fetches a snapshot through the subscribe ack once connected', async () => {
    const { client, sockets } = setup();
    client.connect('token');
    const socket = sockets[0];
    socket.ack = () => ({ ok: true, channel: 'product', snapshot: product(3, 5) });
    const seen: Snapshot[] = [];
    client.subscribe('product', 'p1', (snapshot) => seen.push(snapshot));

    socket.open();
    await flush();

    expect(socket.emitted).toContainEqual({
      event: 'subscribe',
      payload: { channel: 'product', id: 'p1' },
    });
    expect(seen).toEqual([product(3, 5)]);
  });

  it('resyncs every subscription after a reconnect so missed pushes are recovered', async () => {
    const { client, sockets, statuses } = setup();
    client.connect('token');
    const socket = sockets[0];
    let serverStock = 5;
    let serverVersion = 1;
    socket.ack = () => ({
      ok: true,
      channel: 'product',
      snapshot: product(serverVersion, serverStock),
    });
    const seen: number[] = [];
    client.subscribe('product', 'p1', (snapshot) => seen.push((snapshot as ProductUpdate).stock));
    socket.open();
    await flush();

    socket.drop();
    serverStock = 2;
    serverVersion = 4;
    socket.open();
    await flush();

    expect(seen).toEqual([5, 2]);
    expect(statuses).toEqual(['offline', 'connecting', 'online', 'connecting', 'online']);
    expect(socket.emitted.filter((entry) => entry.event === 'subscribe')).toHaveLength(2);
  });

  it('drops pushes that are older than the snapshot it already has', async () => {
    const { client, sockets } = setup();
    client.connect(null);
    const socket = sockets[0];
    socket.ack = () => ({ ok: true, channel: 'product', snapshot: product(5, 3) });
    const seen: number[] = [];
    client.subscribe('product', 'p1', (snapshot) => seen.push(snapshot.version));
    socket.open();
    await flush();

    socket.fire('product.updated', product(4, 9));
    socket.fire('product.updated', product(6, 1));
    socket.fire('product.updated', product(6, 1));

    expect(seen).toEqual([5, 6]);
  });

  it('replays the latest snapshot to a late subscriber without another request', async () => {
    const { client, sockets } = setup();
    client.connect(null);
    const socket = sockets[0];
    socket.ack = () => ({ ok: true, channel: 'product', snapshot: product(2, 7) });
    client.subscribe('product', 'p1', () => undefined);
    socket.open();
    await flush();

    const late: Snapshot[] = [];
    client.subscribe('product', 'p1', (snapshot) => late.push(snapshot));

    expect(late).toEqual([product(2, 7)]);
    expect(socket.emitted.filter((entry) => entry.event === 'subscribe')).toHaveLength(1);
  });

  it('unsubscribes on the server only when the last listener leaves', async () => {
    const { client, sockets } = setup();
    client.connect(null);
    const socket = sockets[0];
    socket.ack = () => ({ ok: true, channel: 'product', snapshot: product(1, 1) });
    socket.open();
    const first = client.subscribe('product', 'p1', () => undefined);
    const second = client.subscribe('product', 'p1', () => undefined);
    await flush();

    first();
    expect(socket.emitted.some((entry) => entry.event === 'unsubscribe')).toBe(false);
    second();
    expect(socket.emitted).toContainEqual({
      event: 'unsubscribe',
      payload: { channel: 'product', id: 'p1' },
    });
  });

  it('renews the token and reconnects when the server rejects an expired one', async () => {
    const renew = vi.fn(() => Promise.resolve<string | null>('fresh-token'));
    const { client, sockets } = setup(renew);
    client.connect('stale-token');
    sockets[0].open();

    sockets[0].fire('exception', { statusCode: 401 });
    await flush();

    expect(renew).toHaveBeenCalledOnce();
    expect(sockets).toHaveLength(2);
    expect(sockets[1].token).toBe('fresh-token');
  });

  it('passes order events to user listeners regardless of subscriptions', () => {
    const { client, sockets } = setup();
    client.connect('token');
    const events: string[] = [];
    client.onUserEvent((event) => events.push(event.kind));

    sockets[0].fire('order.updated', { orderId: 'o1', version: 1 });
    sockets[0].fire('seller-order.updated', { sellerOrderId: 's1', version: 1 });

    expect(events).toEqual(['order', 'seller-order']);
  });
});
