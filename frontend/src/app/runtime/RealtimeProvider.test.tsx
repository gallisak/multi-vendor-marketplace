import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { RealtimeClient, type RealtimeSocket } from '@/shared/realtime';
import { RealtimeProvider } from './RealtimeProvider';

function fakeSocket() {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const socket: RealtimeSocket & { fire(event: string, ...args: unknown[]): void } = {
    connected: false,
    on(event, listener) {
      listeners.set(event, [
        ...(listeners.get(event) ?? []),
        listener as (...args: unknown[]) => void,
      ]);
      return socket;
    },
    emit: () => socket,
    timeout: () => ({ emitWithAck: () => Promise.resolve({ ok: false, error: 'none' }) }),
    connect: () => socket,
    disconnect: () => socket,
    fire(event, ...args) {
      socket.connected =
        event === 'connect' ? true : event === 'disconnect' ? false : socket.connected;
      listeners.get(event)?.forEach((listener) => listener(...args));
    },
  };
  return socket;
}

function renderProvider() {
  const socket = fakeSocket();
  const client = new RealtimeClient(() => socket);
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider client={client}>
        <span>app</span>
      </RealtimeProvider>
    </QueryClientProvider>,
  );
  const invalidatedKeys = () =>
    invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
  return { socket, invalidate, invalidatedKeys };
}

describe('RealtimeProvider', () => {
  it('refetches orders after the connection comes back, since pushes may have been missed', () => {
    const { socket, invalidate, invalidatedKeys } = renderProvider();

    act(() => socket.fire('connect'));
    expect(invalidatedKeys()).toEqual(['["orders"]', '["seller-orders"]']);

    invalidate.mockClear();
    act(() => socket.fire('connect'));
    expect(invalidate).not.toHaveBeenCalled();

    act(() => socket.fire('disconnect'));
    act(() => socket.fire('connect'));
    expect(invalidatedKeys()).toEqual(['["orders"]', '["seller-orders"]']);
  });

  it('refreshes the affected views when an order event arrives', () => {
    const { socket, invalidate, invalidatedKeys } = renderProvider();
    act(() => socket.fire('connect'));
    invalidate.mockClear();

    act(() => socket.fire('order.updated', { orderId: 'o1', version: 2 }));
    expect(invalidatedKeys()).toEqual(['["orders"]', '["notifications"]']);

    invalidate.mockClear();
    act(() => socket.fire('seller-order.updated', { sellerOrderId: 's1', version: 2 }));
    expect(invalidatedKeys()).toEqual([
      '["seller-orders"]',
      '["seller-dashboard"]',
      '["notifications"]',
    ]);
  });
});
