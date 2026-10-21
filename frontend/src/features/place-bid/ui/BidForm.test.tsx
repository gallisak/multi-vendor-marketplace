import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthContext, type AuthState } from '@/entities/viewer';
import { jsonResponse, renderWithApp, requestBody, requestHeaders } from '@/test/render';
import { BidForm } from './BidForm';

const viewer = {
  user: { id: 'u1', email: 'buyer@test', name: 'Buyer', role: 'CUSTOMER' },
  ready: true,
} as AuthState;

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function renderForm() {
  return renderWithApp(
    <AuthContext.Provider value={viewer}>
      <BidForm productId="p1" minimumMinor={55_000} />
    </AuthContext.Provider>,
  );
}

describe('BidForm', () => {
  it('blocks a bid below the current minimum without calling the server', async () => {
    renderForm();
    const user = userEvent.setup();
    const input = screen.getByRole('textbox');

    await user.clear(input);
    await user.type(input, '549.99');
    await user.click(screen.getByRole('button', { name: /place bid/i }));

    expect(await screen.findByText('The minimum bid is 550.00')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the bid in minor units with an idempotency key', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        auctionId: 'a1',
        productId: 'p1',
        amountMinor: 60_000,
        bidCount: 3,
        minNextBidMinor: 65_000,
        endsAt: '2026-10-22T10:00:00Z',
      }),
    );
    renderForm();
    const user = userEvent.setup();
    const input = screen.getByRole('textbox');

    await user.clear(input);
    await user.type(input, '600');
    await user.click(screen.getByRole('button', { name: /place bid/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const call = fetchMock.mock.calls[0];
    expect(String(call[0])).toBe('/api/auctions/p1/bids');
    expect(requestBody(call)).toEqual({ amountMinor: 60_000 });
    expect(requestHeaders(call)['Idempotency-Key']).toBeTruthy();
    await waitFor(() => expect(input).toHaveValue('650.00'));
  });
});
