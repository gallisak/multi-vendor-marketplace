import { useState } from 'react';
import { useSellerPayouts } from '@/entities/seller';
import { formatDateTime, formatMoney } from '@/shared/lib';
import { PageHeader } from '@/shared/ui/page-header';
import { Pager } from '@/shared/ui/pager';
import { Price } from '@/shared/ui/price';
import { StatTile } from '@/shared/ui/stat-tile';
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

export function SellerPayoutsPage() {
  const [page, setPage] = useState(1);
  const payouts = useSellerPayouts(page);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payouts"
        description="Earnings minus platform commission, sent after the hold period"
      />
      {payouts.isPending ? (
        <LoadingState rows={3} label="Loading payouts" />
      ) : payouts.isError ? (
        <ErrorState error={payouts.error} onRetry={() => void payouts.refetch()} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatTile label="Pending" value={formatMoney(payouts.data.pendingMinor)} />
            <StatTile label="Paid out" value={formatMoney(payouts.data.paidOutMinor)} />
          </div>
          {payouts.data.items.length === 0 ? (
            <EmptyState title="No payouts yet" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Entries</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.data.items.map((payout) => (
                    <TableRow key={payout.id}>
                      <TableCell>{formatDateTime(payout.createdAt)}</TableCell>
                      <TableCell className="font-mono text-xs">{payout.providerRef}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {payout.entriesSettled}
                      </TableCell>
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
        </>
      )}
    </div>
  );
}
