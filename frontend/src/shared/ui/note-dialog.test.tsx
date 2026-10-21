import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';
import { NoteDialog } from './note-dialog';

describe('NoteDialog', () => {
  it('requires a note of the minimum length before confirming', async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    render(
      <NoteDialog
        trigger={<Button>Reject</Button>}
        title="Reject this product?"
        label="Reason"
        confirmLabel="Confirm"
        minLength={3}
        onConfirm={onConfirm}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await user.type(screen.getByLabelText('Reason'), 'no');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('At least 3 characters')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Reason'), 'pe');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('nope'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('stays open when the action fails', async () => {
    const onConfirm = vi.fn(() => Promise.reject(new Error('conflict')));
    render(
      <NoteDialog
        trigger={<Button>Reject</Button>}
        title="Reject?"
        label="Reason"
        confirmLabel="Confirm"
        onConfirm={onConfirm}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await user.type(screen.getByLabelText('Reason'), 'duplicate listing');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
