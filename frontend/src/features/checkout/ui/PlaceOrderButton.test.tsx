import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Cart } from '@/shared/api';
import { jsonResponse, renderWithApp, requestHeaders } from '@/test/render';
import { PlaceOrderButton } from './PlaceOrderButton';

const cart = (totalMinor: number): Cart => ({
  sellers: [],
  totalMinor,
  itemsCount: 2,
  hasUnavailableItems: false,
});

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const keys = () => fetchMock.mock.calls.map((call) => requestHeaders(call)['Idempotency-Key']);

describe('PlaceOrderButton', () => {
  it('retries a failed checkout with the same idempotency key so the order is not placed twice', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(503, { message: 'Service unavailable' }))
      .mockResolvedValueOnce(jsonResponse(201, { id: 'order-1' }));
    const { router } = renderWithApp(<PlaceOrderButton cart={cart(10_000)} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Place order' }));
    await screen.findByText('Service unavailable');
    await user.click(screen.getByRole('button', { name: 'Place order' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/account/orders/order-1'));
    expect(keys()).toHaveLength(2);
    expect(keys()[0]).toBeTruthy();
    expect(keys()[1]).toBe(keys()[0]);
  });

  it('starts a new attempt after the server rejects the cart and asks to refresh it', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(409, { message: 'Cart total has changed' }))
      .mockResolvedValueOnce(jsonResponse(201, { id: 'order-2' }));
    const onRejected = vi.fn();
    renderWithApp(<PlaceOrderButton cart={cart(10_000)} onRejected={onRejected} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Place order' }));
    await screen.findByText('Cart total has changed');
    expect(onRejected).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Place order' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(keys()[1]).not.toBe(keys()[0]);
  });

  it('is disabled while the cart has unavailable items', () => {
    renderWithApp(<PlaceOrderButton cart={{ ...cart(10_000), hasUnavailableItems: true }} />);
    expect(screen.getByRole('button', { name: 'Place order' })).toBeDisabled();
  });
});
