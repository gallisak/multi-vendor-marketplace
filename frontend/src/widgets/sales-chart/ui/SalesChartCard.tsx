import { TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  type TooltipValueType,
  XAxis,
  YAxis,
} from 'recharts';
import { useSalesChart } from '@/entities/analytics';
import { formatMoney } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { ErrorState, LoadingState } from '@/shared/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { type ChartRow, toChartRows } from '../lib/chart-rows';

const dayLabel = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC',
});
const shortDay = (iso: string) => (iso ? dayLabel.format(new Date(`${iso}T00:00:00Z`)) : '');
const compactMoney = (minor: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(
    minor / 100,
  );

function Swatch({ dashed, color }: { dashed?: boolean; color: string }) {
  return (
    <svg width="20" height="8" aria-hidden className="shrink-0">
      <line
        x1="1"
        x2="19"
        y1="4"
        y2="4"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={dashed ? '4 4' : undefined}
      />
    </svg>
  );
}

function ChartTooltip({ active, payload }: TooltipContentProps<TooltipValueType, string | number>) {
  const row = payload?.[0]?.payload as ChartRow | undefined;
  if (!active || !row) return null;
  return (
    <div className="space-y-1.5 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="flex items-center gap-2">
        <Swatch color="var(--chart-1)" />
        <span className="text-muted-foreground">{shortDay(row.currentDay)}</span>
        <span className="ml-auto pl-3 font-medium tabular-nums text-foreground">
          {formatMoney(row.current)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Swatch dashed color="var(--chart-2)" />
        <span className="text-muted-foreground">{shortDay(row.previousDay)}</span>
        <span className="ml-auto pl-3 font-medium tabular-nums text-foreground">
          {formatMoney(row.previous)}
        </span>
      </div>
    </div>
  );
}

export function SalesChartCard() {
  const chart = useSalesChart();
  const [showTable, setShowTable] = useState(false);
  const rows = useMemo(() => (chart.data ? toChartRows(chart.data) : []), [chart.data]);

  if (chart.isPending) return <LoadingState rows={2} label="Loading sales chart" />;
  if (chart.isError) return <ErrorState error={chart.error} onRetry={() => void chart.refetch()} />;

  const { totals } = chart.data;
  const change = totals.changePercent;
  const ticks = rows.filter((_, index) => index % 7 === 0 || index === rows.length - 1);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-base">Net sales, last 30 days</CardTitle>
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">
              {formatMoney(totals.currentNetMinor)}
            </span>
            {change !== null && (
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                {change >= 0 ? (
                  <TrendingUp className="size-4" />
                ) : (
                  <TrendingDown className="size-4" />
                )}
                {change >= 0 ? '+' : ''}
                {change.toFixed(1)}% vs previous 30 days ({formatMoney(totals.previousNetMinor)})
              </span>
            )}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setShowTable((value) => !value)}>
          {showTable ? 'Show chart' : 'Show table'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-hidden={showTable}>
          <span className="flex items-center gap-1.5">
            <Swatch color="var(--chart-1)" /> Last 30 days
          </span>
          <span className="flex items-center gap-1.5">
            <Swatch dashed color="var(--chart-2)" /> Previous 30 days
          </span>
        </div>
        {showTable ? (
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead className="text-right">Net sales</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead>Previous day</TableHead>
                  <TableHead className="text-right">Net sales</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.index}>
                    <TableCell>{shortDay(row.currentDay)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.current)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.currentOrders}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {shortDay(row.previousDay)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.previous)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.previousOrders}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div
            className="h-72"
            role="img"
            aria-label="Line chart of daily net sales, last 30 days against the previous 30 days"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="index"
                  ticks={ticks.map((row) => row.index)}
                  tickFormatter={(index: number) => shortDay(rows[index]?.currentDay ?? '')}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                />
                <YAxis
                  width={48}
                  tickFormatter={compactMoney}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                />
                <Tooltip
                  content={ChartTooltip}
                  cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
                />
                <Line
                  type="monotone"
                  dataKey="previous"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="current"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
