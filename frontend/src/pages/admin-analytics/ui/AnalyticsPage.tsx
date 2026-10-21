import { useSearchParams } from 'react-router';
import { useAnalyticsSummary } from '@/entities/analytics';
import { ExportButtons } from '@/features/export-report';
import { formatMoney } from '@/shared/lib';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { PageHeader } from '@/shared/ui/page-header';
import { Price } from '@/shared/ui/price';
import { StatTile } from '@/shared/ui/stat-tile';
import { EmptyState, ErrorState, LoadingState } from '@/shared/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { SalesChartCard } from '@/widgets/sales-chart';

export function AnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const from = params.get('from') ?? undefined;
  const to = params.get('to') ?? undefined;
  const summary = useAnalyticsSummary({ from, to });

  const setPeriod = (key: 'from' | 'to', value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const data = summary.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" description="Money is counted from the payments ledger" />

      <SalesChartCard />

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="period-from">From</Label>
            <Input
              id="period-from"
              type="date"
              value={from ?? ''}
              max={to}
              onChange={(event) => setPeriod('from', event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="period-to">To</Label>
            <Input
              id="period-to"
              type="date"
              value={to ?? ''}
              min={from}
              onChange={(event) => setPeriod('to', event.target.value)}
            />
          </div>
          {data && (
            <p className="pb-2 text-sm text-muted-foreground">
              {data.period.from} — {data.period.to}
            </p>
          )}
        </div>
        <ExportButtons from={from} to={to} />
      </div>

      {summary.isPending ? (
        <LoadingState rows={3} label="Loading summary" />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <div className={summary.isPlaceholderData ? 'space-y-6 opacity-60' : 'space-y-6'}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Platform revenue"
              value={formatMoney(summary.data.platformCommissionMinor)}
              hint="Commission after refunds"
            />
            <StatTile
              label="Gross sales"
              value={formatMoney(summary.data.grossSalesMinor)}
              hint={`${formatMoney(summary.data.refundedMinor)} refunded`}
            />
            <StatTile label="Paid orders" value={summary.data.ordersCount} />
            <StatTile
              label="Cart → order conversion"
              value={`${summary.data.conversion.ratePercent}%`}
              hint={`${summary.data.conversion.buyers} of ${summary.data.conversion.cartUsers} users with a cart bought`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-2">
              <h2 className="font-medium">Top 5 products</h2>
              {summary.data.topProducts.length === 0 ? (
                <EmptyState title="No sales in this period" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Net sales</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.data.topProducts.map((product) => (
                      <TableRow key={product.productId}>
                        <TableCell className="max-w-56">
                          <span className="block truncate">{product.title}</span>
                          <span className="text-xs text-muted-foreground">{product.storeName}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {product.unitsSold}
                        </TableCell>
                        <TableCell className="text-right">
                          <Price minor={product.netMinor} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
            <section className="space-y-2">
              <h2 className="font-medium">Top 5 sellers</h2>
              {summary.data.topSellers.length === 0 ? (
                <EmptyState title="No sales in this period" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Seller</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Net sales</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.data.topSellers.map((seller) => (
                      <TableRow key={seller.sellerId}>
                        <TableCell>{seller.storeName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {seller.ordersCount}
                        </TableCell>
                        <TableCell className="text-right">
                          <Price minor={seller.netMinor} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          </div>

          <section className="space-y-2">
            <h2 className="font-medium">Revenue by seller</h2>
            {summary.data.sellers.length === 0 ? (
              <EmptyState title="No sales in this period" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Seller</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Refunded</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="text-right">Seller earnings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.data.sellers.map((seller) => (
                    <TableRow key={seller.sellerId}>
                      <TableCell>{seller.storeName}</TableCell>
                      <TableCell className="text-right">
                        <Price minor={seller.grossMinor} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Price minor={seller.refundedMinor} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Price minor={seller.commissionMinor} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Price minor={seller.payoutMinor} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
