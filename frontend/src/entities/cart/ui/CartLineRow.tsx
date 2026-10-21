import { Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { Price } from '@/shared/ui/price';
import { ProductImage } from '@/shared/ui/product-image';
import { QuantityStepper } from '@/shared/ui/quantity-stepper';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { humanize } from '@/shared/lib';
import type { CartLine } from '@/shared/api';

export function CartLineRow({
  line,
  onQuantity,
  disabled,
}: {
  line: CartLine;
  onQuantity: (quantity: number) => void;
  disabled?: boolean;
}) {
  return (
    <li className="flex gap-3 py-3">
      <ProductImage src={line.imageUrl} alt={line.title} className="size-16 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link to={`/products/${line.productId}`} className="truncate font-medium hover:underline">
          {line.title}
        </Link>
        <span className="text-sm text-muted-foreground">
          <Price minor={line.unitPriceMinor} /> each
        </span>
        {!line.available && line.unavailableReason && (
          <Badge variant="destructive">{humanize(line.unavailableReason)}</Badge>
        )}
      </div>
      <div className="flex flex-col items-end gap-2">
        <Price minor={line.lineTotalMinor} className="font-medium" />
        <div className="flex items-center gap-1">
          <QuantityStepper
            value={line.quantity}
            max={Math.max(line.quantity, line.stock)}
            onChange={onQuantity}
            disabled={disabled}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${line.title}`}
            onClick={() => onQuantity(0)}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </li>
  );
}
