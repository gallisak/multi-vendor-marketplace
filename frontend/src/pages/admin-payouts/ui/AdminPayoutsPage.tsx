import { useState } from 'react';
import { useAdminPayouts } from '@/entities/seller';
import { formatDateTime } from '@/shared/lib';
import { PageHeader } from '@/shared/ui/page-header';
import { Pager } from '@/shared/ui/pager';
import { Price } from '@/shared/ui/price';
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

export function AdminPayoutsPage() {
  const [page, setPage] = useState(1);
  const payouts = useAdminPayouts(page);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payouts"
        description="Sent automatically to sellers for completed orders after the hold period"
      />
      {payouts.isPending ? (
        <LoadingState rows={3} label="Loading payouts" />
      ) : payouts.isError ? (
        <ErrorState error={payouts.error} onRetry={() => void payouts.refetch()} />
      ) : payouts.data.items.length === 0 ? (
        <EmptyState title="No payouts yet" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Entries</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.data.items.map((payout) => (
                <TableRow key={payout.id}>
                  <TableCell>{formatDateTime(payout.createdAt)}</TableCell>
                  <TableCell>{payout.storeName}</TableCell>
                  <TableCell className="font-mono text-xs">{payout.providerRef}</TableCell>
                  <TableCell className="text-right tabular-nums">{payout.entriesSettled}</TableCell>
                  <TableCell className="text-right">
                    <Price minor={payout.amountMinor} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pager
            page={page}
            limit={payouts.data.limit}
            total={payouts.data.total}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}
