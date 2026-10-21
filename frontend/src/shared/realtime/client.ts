import { io } from 'socket.io-client';
import {
  type AuctionUpdate,
  type Channel,
  type ConnectionStatus,
  type OrderUpdate,
  type ProductUpdate,
  SERVER_EVENTS,
  type SellerOrderUpdate,
  type Snapshot,
  type SubscribeAck,
} from './types';

export interface RealtimeSocket {
  connected: boolean;
  on(event: string, listener: (...args: never[]) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
  timeout(ms: number): { emitWithAck(event: string, payload: unknown): Promise<unknown> };
  connect(): unknown;
  disconnect(): unknown;
}

export type SocketFactory = (token: string | null) => RealtimeSocket;

export const defaultSocketFactory: SocketFactory = (token) =>
  io('/realtime', {
    auth: token ? { token } : {},
    transports: ['websocket'],
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  }) as unknown as RealtimeSocket;

interface Subscription {
  channel: Channel;
  id: string;
  snapshot?: Snapshot;
  listeners: Set<(snapshot: Snapshot) => void>;
}

type UserEvent =
  { kind: 'order'; update: OrderUpdate } | { kind: 'seller-order'; update: SellerOrderUpdate };

const ACK_TIMEOUT_MS = 5000;
const key = (channel: Channel, id: string) => `${channel}:${id}`;

export function isNewer(incoming: { version: number }, current?: { version: number }) {
  return current === undefined || incoming.version > current.version;
}

export class RealtimeClient {
  private socket: RealtimeSocket | null = null;
  private token: string | null = null;
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();
  private readonly userListeners = new Set<(event: UserEvent) => void>();
  private status: ConnectionStatus = 'offline';

  private readonly createSocket: SocketFactory;
  private readonly renewToken: () => Promise<string | null>;

  constructor(
    createSocket: SocketFactory = defaultSocketFactory,
    renewToken: () => Promise<string | null> = () => Promise.resolve(null),
  ) {
    this.createSocket = createSocket;
    this.renewToken = renewToken;
  }

  get connectionStatus() {
    return this.status;
  }

  connect(token: string | null) {
    if (this.socket && token === this.token) {
      return;
    }
    this.socket?.disconnect();
    this.token = token;
    this.setStatus('connecting');
    const socket = this.createSocket(token);
    this.socket = socket;

    socket.on('connect', () => {
      if (this.socket === socket) {
        this.setStatus('online');
        void this.resyncAll();
      }
    });
    socket.on('disconnect', () => {
      if (this.socket === socket) this.setStatus('connecting');
    });
    socket.on('connect_error', () => {
      if (this.socket === socket) this.setStatus('offline');
    });
    socket.on(SERVER_EVENTS.product, (update: ProductUpdate) =>
      this.apply('product', update.productId, update),
    );
    socket.on(SERVER_EVENTS.auction, (update: AuctionUpdate) =>
      this.apply('auction', update.productId, update),
    );
    socket.on(SERVER_EVENTS.order, (update: OrderUpdate) =>
      this.userListeners.forEach((listener) => listener({ kind: 'order', update })),
    );
    socket.on(SERVER_EVENTS.sellerOrder, (update: SellerOrderUpdate) =>
      this.userListeners.forEach((listener) => listener({ kind: 'seller-order', update })),
    );
    socket.on(SERVER_EVENTS.exception, (error: { statusCode?: number }) => {
      if (this.socket === socket && error?.statusCode === 401) {
        void this.reauthenticate();
      }
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.setStatus('offline');
  }

  subscribe(channel: Channel, id: string, listener: (snapshot: Snapshot) => void) {
    const subscriptionKey = key(channel, id);
    let subscription = this.subscriptions.get(subscriptionKey);
    if (!subscription) {
      subscription = { channel, id, listeners: new Set() };
      this.subscriptions.set(subscriptionKey, subscription);
      if (this.socket?.connected) {
        void this.resync(subscription);
      }
    } else if (subscription.snapshot) {
      listener(subscription.snapshot);
    }
    subscription.listeners.add(listener);

    return () => {
      const current = this.subscriptions.get(subscriptionKey);
      if (!current) return;
      current.listeners.delete(listener);
      if (current.listeners.size === 0) {
        this.subscriptions.delete(subscriptionKey);
        if (this.socket?.connected) this.socket.emit('unsubscribe', { channel, id });
      }
    };
  }

  onUserEvent(listener: (event: UserEvent) => void) {
    this.userListeners.add(listener);
    return () => {
      this.userListeners.delete(listener);
    };
  }

  onStatus(listener: (status: ConnectionStatus) => void) {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private async resyncAll() {
    await Promise.all([...this.subscriptions.values()].map((s) => this.resync(s)));
  }

  private async resync(subscription: Subscription) {
    const socket = this.socket;
    if (!socket) return;
    try {
      const ack = (await socket
        .timeout(ACK_TIMEOUT_MS)
        .emitWithAck('subscribe', { channel: subscription.channel, id: subscription.id })) as
        SubscribeAck | undefined;
      if (ack?.ok) {
        this.apply(subscription.channel, subscription.id, ack.snapshot);
      }
    } catch {
      return;
    }
  }

  private apply(channel: Channel, id: string, snapshot: Snapshot) {
    const subscription = this.subscriptions.get(key(channel, id));
    if (!subscription || !isNewer(snapshot, subscription.snapshot)) {
      return;
    }
    subscription.snapshot = snapshot;
    subscription.listeners.forEach((listener) => listener(snapshot));
  }

  private async reauthenticate() {
    const token = await this.renewToken();
    this.socket?.disconnect();
    this.socket = null;
    this.connect(token);
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }
}
