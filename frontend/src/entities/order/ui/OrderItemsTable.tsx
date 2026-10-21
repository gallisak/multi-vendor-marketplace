import type { ReactNode } from 'react';
import type { OrderItem } from '@/shared/api';
import { Price } from '@/shared/ui/price';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

export function OrderItemsTable({
  items,
  action,
}: {
  items: OrderItem[];
  action?: (item: OrderItem) => ReactNode;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Total</TableHead>
          {action && <TableHead className="w-0" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="max-w-64 truncate">
              {item.title}
              {item.refundedQuantity > 0 && (
                <span className="ml-2 text-xs text-orange-700">
                  {item.refundedQuantity} refunded
                </span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <Price minor={item.unitPriceMinor} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
            <TableCell className="text-right">
              <Price minor={item.lineTotalMinor} />
            </TableCell>
            {action && <TableCell className="text-right">{action(item)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
